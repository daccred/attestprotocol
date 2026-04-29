//! Regression tests for HAL-04 (Resolver ABI unification) and H-CONTRACT-2
//! (DefaultResolver `require_auth` removal).
//!
//! Test coverage:
//!
//! 1. `test_resolver_abi_onattest_roundtrip`,
//!    `test_resolver_abi_onrevoke_roundtrip`,
//!    `test_resolver_abi_onresolve_roundtrip`:
//!    Verify the protocol's generated `ResolverClient` can call a deployed
//!    `DefaultResolver` (compiled from `ResolverInterface`) without an XDR
//!    shape mismatch. Pre-fix, the protocol's `Resolver` trait declared
//!    return types `bool` / `()` while the on-chain resolver returned
//!    `Result<bool, ResolverError>` / `Result<(), ResolverError>` — every
//!    call would fail to decode.
//!
//! 2. `test_delegated_attest_with_default_resolver_succeeds`:
//!    Verify that a schema backed by `DefaultResolver` can be attested via
//!    the delegated path. Pre-fix, `DefaultResolver::onattest` called
//!    `attestation.attester.require_auth()` which panics in the delegated
//!    flow because the on-chain auth context is the submitter, not the
//!    attester.

mod testutils;

use protocol::{
    interfaces::resolver::{ResolverAttestationData, ResolverClient},
    AttestationContract, AttestationContractClient,
};
use resolvers::DefaultResolver;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Bytes, BytesN, Env, String as SorobanString,
};
use testutils::{create_delegated_attestation_request, TEST_BLS_G2_PUBLIC_KEY};

// ─────────────────────────────────────────────────────────────────────────────
// Test 1 (HAL-04): Resolver ABI shape parity
// ─────────────────────────────────────────────────────────────────────────────

/// The protocol's `ResolverClient::try_onattest` must decode the
/// `Result<bool, ResolverError>` returned by `DefaultResolver::onattest`.
/// Pre-fix this returned `Err(ConversionError)` because the protocol-side
/// trait declared `-> bool`.
#[test]
fn test_resolver_abi_onattest_roundtrip() {
    let env = Env::default();
    env.mock_all_auths();

    let resolver_id = env.register(DefaultResolver, ());

    let attestation = ResolverAttestationData {
        uid: BytesN::from_array(&env, &[1u8; 32]),
        schema_uid: BytesN::from_array(&env, &[2u8; 32]),
        recipient: Address::generate(&env),
        attester: Address::generate(&env),
        time: 1_000_000u64,
        expiration_time: 0u64,
        revocation_time: 0u64,
        revocable: true,
        ref_uid: Bytes::new(&env),
        data: Bytes::new(&env),
        value: 0i128,
    };

    let client = ResolverClient::new(&env, &resolver_id);
    let result = client.try_onattest(&attestation);

    // Outer Ok = host-level call succeeded (no XDR shape mismatch),
    // inner Ok(true) = DefaultResolver allowed the attestation.
    assert_eq!(result, Ok(Ok(true)));
}

/// `ResolverClient::try_onrevoke` shape parity check.
#[test]
fn test_resolver_abi_onrevoke_roundtrip() {
    let env = Env::default();
    env.mock_all_auths();
    let resolver_id = env.register(DefaultResolver, ());

    let attestation = ResolverAttestationData {
        uid: BytesN::from_array(&env, &[3u8; 32]),
        schema_uid: BytesN::from_array(&env, &[4u8; 32]),
        recipient: Address::generate(&env),
        attester: Address::generate(&env),
        time: 1_000_000u64,
        expiration_time: 0u64,
        revocation_time: 0u64,
        revocable: true,
        ref_uid: Bytes::new(&env),
        data: Bytes::new(&env),
        value: 0i128,
    };

    let client = ResolverClient::new(&env, &resolver_id);
    let result = client.try_onrevoke(&attestation);

    assert_eq!(result, Ok(Ok(true)));
}

/// `ResolverClient::try_onresolve` shape parity check. Critically, this
/// also verifies the parameter-set change: under the unified ABI, onresolve
/// takes `(uid, attester)` rather than the full `ResolverAttestationData`.
#[test]
fn test_resolver_abi_onresolve_roundtrip() {
    let env = Env::default();
    env.mock_all_auths();
    let resolver_id = env.register(DefaultResolver, ());

    let uid = BytesN::from_array(&env, &[5u8; 32]);
    let attester = Address::generate(&env);

    let client = ResolverClient::new(&env, &resolver_id);
    let result = client.try_onresolve(&uid, &attester);

    assert_eq!(result, Ok(Ok(())));
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 2 (H-CONTRACT-2): DefaultResolver does not break delegated path
// ─────────────────────────────────────────────────────────────────────────────

/// Verify that `attest_by_delegation` succeeds against a schema backed by
/// `DefaultResolver`. Pre-fix, `DefaultResolver::onattest` called
/// `attestation.attester.require_auth()` which panics under
/// `mock_all_auths()` only if the host fails to find a recorded auth entry
/// for the attester — but in the delegated path the on-chain auth context
/// belongs to the submitter, not the attester, so even outside of mocks the
/// resolver call traps.
///
/// Uses `create_delegated_attestation_request` which produces a real BLS
/// signature against `TEST_BLS_G2_PUBLIC_KEY`, so the protocol's
/// `verify_bls_signature` step accepts the request and we exercise the
/// resolver dispatch with the actual unified ABI on the wire.
#[test]
fn test_delegated_attest_with_default_resolver_succeeds() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| {
        li.timestamp = 1_000_000;
    });

    let protocol_id = env.register(AttestationContract {}, ());
    let protocol = AttestationContractClient::new(&env, &protocol_id);
    let resolver_id = env.register(DefaultResolver, ());

    let admin = Address::generate(&env);
    protocol.initialize(&admin);

    // Register schema attached to DefaultResolver.
    let schema_uid = protocol.register(
        &admin,
        &SorobanString::from_str(&env, "test:v1"),
        &Some(resolver_id.clone()),
        &true, // revocable
    );

    // The attester whose BLS key we control.
    let attester = Address::generate(&env);
    let public_key = BytesN::from_array(&env, &TEST_BLS_G2_PUBLIC_KEY);
    protocol.register_bls_key(&attester, &public_key);

    // The submitter is a separate account — this is the whole point of the
    // delegated path. `DefaultResolver::onattest` previously called
    // `attestation.attester.require_auth()` which would panic here because
    // the submitter is the only one with an on-chain auth context.
    let submitter = Address::generate(&env);
    let recipient = Address::generate(&env);

    let request = create_delegated_attestation_request(
        &env,
        &protocol_id,
        &attester,
        0u64, // nonce
        &schema_uid,
        &recipient,
    );

    // Pre-fix: `try_attest_by_delegation` returns Err wrapping the resolver's
    // host auth error. Post-fix: returns Ok(Ok(())).
    let result = protocol.try_attest_by_delegation(&submitter, &request);

    assert!(
        result.is_ok(),
        "attest_by_delegation must succeed against DefaultResolver post H-CONTRACT-2 fix; got {:?}",
        result,
    );
}
