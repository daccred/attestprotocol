mod testutils;

use protocol::{
    errors::Error as ProtocolError,
    instructions::delegation::create_revocation_message,
    state::DelegatedRevocationRequest,
    AttestationContract, AttestationContractClient,
};
use soroban_sdk::{
    testutils::Address as _,
    Address, BytesN, Env, String as SorobanString,
};
use testutils::{create_delegated_attestation_request, TEST_BLS_G2_PUBLIC_KEY, TEST_BLS_PRIVATE_KEY};

/// **Test: HAL-08 — Direct revoke of an already-revoked attestation returns `AlreadyRevoked`**
///
/// Pre-fix: returned `AttestationNotFound`, which is misleading because the
/// record exists (just in a terminal state).
/// Post-fix: returns `AlreadyRevoked` (error code 29).
#[test]
fn test_hal08_already_revoked_returns_correct_error() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    client.initialize(&admin);
    let schema_uid = client.register(
        &attester,
        &SorobanString::from_str(&env, "revocable_schema"),
        &None,
        &true,
    );

    let value = SorobanString::from_str(&env, "{\"k\":\"v\"}");
    let attestation_uid = client.attest(&attester, &schema_uid, &value, &None);

    // First revoke succeeds.
    client.revoke(&attester, &attestation_uid);

    // Second revoke must surface AlreadyRevoked.
    let result = client.try_revoke(&attester, &attestation_uid);
    assert_eq!(result, Err(Ok(ProtocolError::AlreadyRevoked.into())));
}

/// **Test: HAL-08 — Delegated revoke of an already-revoked attestation returns `AlreadyRevoked`**
///
/// The delegated path now mirrors the direct path: the early-out fires before
/// BLS verification, so an already-revoked record terminates without burning
/// compute on a signature that would otherwise have been valid.
#[test]
fn test_hal08_delegated_already_revoked_returns_correct_error() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let subject = Address::generate(&env);
    let submitter = Address::generate(&env);

    client.initialize(&admin);
    let schema_uid = client.register(&admin, &SorobanString::from_str(&env, "schema"), &None, &true);
    let public_key = BytesN::from_array(&env, &TEST_BLS_G2_PUBLIC_KEY);
    client.register_bls_key(&attester, &public_key);

    // Create a delegated attestation.
    let attest_req = create_delegated_attestation_request(&env, &contract_id, &attester, 0, &schema_uid, &subject);
    client.attest_by_delegation(&submitter, &attest_req);

    let attestation_uid = env.as_contract(&contract_id, || {
        protocol::utils::generate_attestation_uid(&env, &schema_uid, &subject, &attester, 0)
    });

    // Build, sign, and submit a valid delegated revocation request.
    let private_key =
        blst::min_sig::SecretKey::from_bytes(&TEST_BLS_PRIVATE_KEY).expect("valid test private key");

    let mut revoke_req = DelegatedRevocationRequest {
        attestation_uid: attestation_uid.clone(),
        schema_uid: schema_uid.clone(),
        subject: subject.clone(),
        nonce: client.get_revoker_nonce(&attester),
        revoker: attester.clone(),
        deadline: env.ledger().timestamp() + 1000,
        signature: BytesN::from_array(&env, &[0; 96]),
    };
    let message_hash = env.as_contract(&contract_id, || create_revocation_message(&env, &revoke_req));
    let sig = private_key.sign(
        &message_hash.to_array(),
        b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_",
        &[],
    );
    revoke_req.signature = BytesN::from_array(&env, &sig.serialize());

    // First delegated revoke succeeds.
    client.revoke_by_delegation(&submitter, &revoke_req);

    // Replay the same signed request: must hit the HAL-08 guard before BLS verify.
    let result = client.try_revoke_by_delegation(&submitter, &revoke_req);
    assert_eq!(result, Err(Ok(ProtocolError::AlreadyRevoked.into())));
}
