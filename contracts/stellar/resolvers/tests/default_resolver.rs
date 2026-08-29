#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::{Address as _, BytesN as _, Ledger, LedgerInfo},
    Address, Bytes, BytesN, Env, String as SorobanString,
};

use resolvers::default::DefaultResolverClient;
use resolvers::{DefaultResolver, ResolverAttestationData, ResolverError, ResolverType};

fn setup<'a>() -> (Env, DefaultResolverClient<'a>) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set(LedgerInfo {
        timestamp: 100,
        protocol_version: 27,
        sequence_number: 1,
        network_id: Default::default(),
        base_reserve: 1,
        min_temp_entry_ttl: 16 * 60 * 60 * 24,
        min_persistent_entry_ttl: 30 * 60 * 60 * 24,
        max_entry_ttl: 365 * 60 * 60 * 24,
    });

    let resolver_address = env.register(DefaultResolver, ());
    let client = DefaultResolverClient::new(&env, &resolver_address);
    (env, client)
}

fn build_attestation(
    env: &Env,
    attester: &Address,
    recipient: &Address,
    expiration_time: u64,
) -> ResolverAttestationData {
    ResolverAttestationData {
        uid: BytesN::random(env),
        schema_uid: BytesN::random(env),
        recipient: recipient.clone(),
        attester: attester.clone(),
        time: env.ledger().timestamp(),
        expiration_time,
        revocation_time: 0,
        revocable: true,
        ref_uid: Bytes::new(env),
        data: Bytes::new(env),
        value: 0,
    }
}

#[test]
fn test_reject_self_attestation() {
    let (env, client) = setup();
    let user = Address::generate(&env);
    let attestation = build_attestation(&env, &user, &user, 0);
    let res = client.try_onattest(&attestation);
    // If this assertion fails:
    // ISSUE: self-attestation check missing in onattest
    // RECOMMENDATION: Ensure attester != recipient validation
    // IMPACT: Users could create meaningless self-attestations
    assert!(matches!(res.err().unwrap(), Ok(ResolverError::ValidationFailed)));
}

#[test]
fn test_reject_expired_attestation() {
    let (env, client) = setup();
    let attester = Address::generate(&env);
    let recipient = Address::generate(&env);
    let attestation = build_attestation(&env, &attester, &recipient, 50); // before current ledger timestamp 100
    let res = client.try_onattest(&attestation);
    // If this assertion fails:
    // ISSUE: expiration check missing or timestamp miscomputed
    // RECOMMENDATION: verify env.ledger().timestamp usage
    // IMPACT: Expired attestations could be accepted
    assert!(matches!(res.err().unwrap(), Ok(ResolverError::InvalidAttestation)));
}

#[test]
fn test_accept_valid_attestation() {
    let (env, client) = setup();
    let attester = Address::generate(&env);
    let recipient = Address::generate(&env);
    let attestation = build_attestation(&env, &attester, &recipient, 0);
    assert!(client.onattest(&attestation));
}

#[test]
fn test_revocation_hooks() {
    let (env, client) = setup();
    let uid = BytesN::random(&env);
    let attester = Address::generate(&env);
    assert!(client.try_onresolve(&uid, &attester).is_ok());
    // onresolve should be a no-op
    client.onresolve(&uid, &attester);
}

#[test]
fn test_metadata() {
    let (env, client) = setup();
    let metadata = client.metadata();
    assert_eq!(metadata.name, SorobanString::from_str(&env, "Default Resolver"));
    assert_eq!(metadata.version, SorobanString::from_str(&env, "1.0.0"));
    assert_eq!(metadata.resolver_type, ResolverType::Default);
}

#[test]
fn test_reject_non_revocable_attestation_revocation() {
    let (env, client) = setup();
    let attester = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Create a non-revocable attestation
    let mut attestation = build_attestation(&env, &attester, &recipient, 0);
    attestation.revocable = false;

    // Attempt to revoke should fail
    let res = client.try_onrevoke(&attestation);
    assert!(matches!(
        res.err().unwrap(),
        Ok(ResolverError::ValidationFailed)
    ));
}

#[test]
fn test_allow_revocable_attestation_revocation() {
    let (env, client) = setup();
    let attester = Address::generate(&env);
    let recipient = Address::generate(&env);

    // Create a revocable attestation
    let attestation = build_attestation(&env, &attester, &recipient, 0);
    // revocable is true by default in build_attestation

    // Revocation should succeed
    assert!(client.onrevoke(&attestation));
}
