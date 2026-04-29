mod testutils;

use protocol::{
    errors::Error as ProtocolError,
    instructions::delegation::{create_attestation_message, create_revocation_message},
    state::{DelegatedAttestationRequest, DelegatedRevocationRequest},
    AttestationContract, AttestationContractClient,
};
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, String as SorobanString,
};
use testutils::{create_delegated_attestation_request, TEST_BLS_G2_PUBLIC_KEY, TEST_BLS_PRIVATE_KEY};
// No need for bls12_381 directly or rand_core since we use the test helpers

// --- The corrected test implementation ---

/// **Test: Nonce is Scoped to the Attester, Not the Subject (Delegated)**
///
/// This test proves that the nonce sequence for delegated attestations belongs to the
/// attester (the signer) and is independent of the subject being attested to.
///
/// # Workflow
/// 1. An attester signs a delegated request for Subject X with nonce 0.
/// 2. The test verifies that the `get_attester_nonce` function now returns 1 for the attester.
/// 3. The same attester then signs a second delegated request for a *different* subject, Subject Y,
///    correctly using the next nonce in their sequence (nonce 1).
/// 4. The test verifies the second attestation succeeds and the attester's nonce is now 2,
///    proving the nonce is tied to the attester's action count, not the subject.
#[test]
fn test_nonce_is_scoped_to_attester_not_subject() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let subject_x = Address::generate(&env);
    let subject_y = Address::generate(&env);
    let submitter = Address::generate(&env);

    client.initialize(&admin);
    let schema_uid = client.register(&admin, &SorobanString::from_str(&env, "schema"), &None, &true);

    // Register BLS key for the attester using the TEST_BLS_G2_PUBLIC_KEY
    let public_key = BytesN::from_array(&env, &TEST_BLS_G2_PUBLIC_KEY);
    client.register_bls_key(&attester, &public_key);

    // Verify initial nonce for the attester is 0
    assert_eq!(client.get_attester_nonce(&attester), 0);

    // 1. Attester signs a request for Subject X with nonce 0.
    let request_for_x = create_delegated_attestation_request(
        &env,
        &attester,
        0, // nonce
        &schema_uid,
        &subject_x,
    );
    client.attest_by_delegation(&submitter, &request_for_x);

    // 2. Verify the attester's nonce has incremented to 1.
    assert_eq!(client.get_attester_nonce(&attester), 1);

    // 3. Attester signs a request for Subject Y with nonce 1.
    let request_for_y = create_delegated_attestation_request(
        &env,
        &attester,
        1, // next nonce
        &schema_uid,
        &subject_y,
    );
    client.attest_by_delegation(&submitter, &request_for_y);

    // 4. Verify the attester's nonce has incremented to 2.
    // This proves the nonce is sequential for the attester, regardless of the subject.
    assert_eq!(client.get_attester_nonce(&attester), 2);
}

/// **Test: Nonce is Scoped to the Attester, Not the Submitter**
///
/// This test proves that the nonce is tied to the original signer (the attester)
/// and not the third party who submits the transaction (the delegator/submitter).
/// This is a critical defense against replay attacks from multiple submitters.
///
/// # Workflow
/// 1. Attester A signs a delegated request with their current nonce (0).
/// 2. Submitter 1 successfully submits this request on-chain. The contract
///    processes it and increments Attester A's nonce to 1.
/// 3. Submitter 2 (an attacker) intercepts the same signed request and tries to
///    submit it again.
/// 4. The contract MUST reject the second submission with `Error::InvalidNonce`
///    because the nonce (0) has already been consumed for Attester A.
#[test]
fn test_nonce_is_scoped_to_attester_not_submitter() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let subject = Address::generate(&env);
    let submitter_1 = Address::generate(&env);
    let submitter_2 = Address::generate(&env); // The "attacker"

    client.initialize(&admin);
    let schema_uid = client.register(&admin, &SorobanString::from_str(&env, "schema"), &None, &true);

    // Register the attester's public key so they can create delegated attestations
    let public_key = BytesN::from_array(&env, &TEST_BLS_G2_PUBLIC_KEY);
    client.register_bls_key(&attester, &public_key);

    // 1. Create a single, valid signed request from the attester with nonce 0.
    // We use the helper from testutils.rs.
    let signed_request = create_delegated_attestation_request(
        &env,
        &attester,
        0, // Nonce
        &schema_uid,
        &subject,
    );

    // 2. Submitter 1 successfully submits the request.
    client.attest_by_delegation(&submitter_1, &signed_request);

    // Verify the attester's nonce was consumed and is now 1.
    assert_eq!(client.get_attester_nonce(&attester), 1);

    // 3. Submitter 2 attempts to submit the *exact same* signed request.
    let result = client.try_attest_by_delegation(&submitter_2, &signed_request);

    // 4. Assert that the second submission fails with an InvalidNonce error.
    assert_eq!(result, Err(Ok(ProtocolError::InvalidNonce.into())));

    // 5. Verify the nonce was not consumed again.
    assert_eq!(client.get_attester_nonce(&attester), 1);
}

/// **Test: Delegated Revocation with Valid Signature**
///
/// This test verifies that a delegated revocation request with a valid BLS signature
/// can be successfully processed by the contract.
///
/// # Workflow
/// 1. An attester creates a delegated attestation
/// 2. The attester generates a signed delegated revocation request off-chain
/// 3. A third party submitter submits the revocation request on-chain
/// 4. The contract verifies the signature and processes the revocation
/// 5. The attestation is marked as revoked
#[test]
fn test_delegated_revocation_with_valid_signature() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let subject = Address::generate(&env);
    let submitter = Address::generate(&env);

    client.initialize(&admin);
    let schema_uid = client.register(
        &admin,
        &SorobanString::from_str(&env, "revocable_schema"),
        &None,
        &true, // revocable
    );

    // Register the attester's public key
    let public_key = BytesN::from_array(&env, &TEST_BLS_G2_PUBLIC_KEY);
    client.register_bls_key(&attester, &public_key);

    // Create a delegated attestation first using the helper
    let attestation_request = create_delegated_attestation_request(
        &env,
        &attester,
        0, // nonce
        &schema_uid,
        &subject,
    );
    client.attest_by_delegation(&submitter, &attestation_request);

    // Get the attestation UID that was created
    // Since we can't get it directly from attest_by_delegation (returns ()),
    // we need to use a different approach - use the nonce to predict the UID.
    // The HAL-01 formula now requires the contract address, so compute under
    // `env.as_contract(...)` and pass `&attester` explicitly.
    let attestation_uid = env.as_contract(&contract_id, || {
        protocol::utils::generate_attestation_uid(
            &env,
            &schema_uid,
            &subject,
            &attester,
            0, // nonce used in the attestation
        )
    });

    // Verify the attestation exists and is not revoked
    let attestation = client.get_attestation(&attestation_uid);
    assert!(!attestation.revoked);

    // Now create a delegated revocation request using blst for signing
    let private_key =
        blst::min_sig::SecretKey::from_bytes(&TEST_BLS_PRIVATE_KEY).expect("Failed to create private key");

    let mut revocation_request = DelegatedRevocationRequest {
        attestation_uid: attestation_uid.clone(),
        schema_uid: schema_uid.clone(),
        subject: subject.clone(),
        nonce: client.get_attester_nonce(&attester), // should be 1 after attestation
        revoker: attester.clone(),
        deadline: env.ledger().timestamp() + 1000,
        signature: BytesN::from_array(&env, &[0; 96]), // Placeholder
    };

    // Sign the revocation request using blst (matching testutils pattern)
    let message_hash = create_revocation_message(&env, &revocation_request);
    let signature_scalar = private_key.sign(
        &message_hash.to_array(),
        b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_",
        &[],
    );
    let signature_bytes = signature_scalar.serialize();
    revocation_request.signature = BytesN::from_array(&env, &signature_bytes);

    // Submit the delegated revocation through a third party
    client.revoke_by_delegation(&submitter, &revocation_request);

    // Verify the attestation is now revoked
    let revoked_attestation = client.get_attestation(&attestation_uid);
    assert!(revoked_attestation.revoked);
    assert!(revoked_attestation.revocation_time.is_some());

    // Verify the attester's nonce remains at 1 (revocations don't consume nonces)
    assert_eq!(client.get_attester_nonce(&attester), 1);
}
/// **Test: Delegated Action with Expired Deadline**
///
/// This test verifies that both delegated attestations and revocations
/// fail when submitted after their deadline has expired.
///
/// # Workflow
/// 1. Create a delegated attestation request with a deadline in the past
/// 2. Attempt to submit it and verify it fails with ExpiredSignature error
/// 3. Create a valid attestation for testing revocation
/// 4. Create a delegated revocation request with a deadline in the past
/// 5. Attempt to submit it and verify it fails with ExpiredSignature error
#[test]
fn test_delegated_action_with_expired_deadline() {
    let env = Env::default();
    env.mock_all_auths();

    // Set ledger timestamp to a reasonable value
    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let subject = Address::generate(&env);
    let submitter = Address::generate(&env);

    client.initialize(&admin);
    let schema_uid = client.register(&admin, &SorobanString::from_str(&env, "schema"), &None, &true);

    // Register the attester's public key
    let public_key = BytesN::from_array(&env, &TEST_BLS_G2_PUBLIC_KEY);
    client.register_bls_key(&attester, &public_key);

    // Test 1: Expired delegated attestation
    {
        let private_key =
            blst::min_sig::SecretKey::from_bytes(&TEST_BLS_PRIVATE_KEY).expect("Failed to create private key");

        let mut attestation_request = DelegatedAttestationRequest {
            schema_uid: schema_uid.clone(),
            subject: subject.clone(),
            value: SorobanString::from_str(&env, "{\"key\":\"value\"}"),
            nonce: 0,
            attester: attester.clone(),
            expiration_time: None,
            deadline: 500, // Expired deadline (timestamp 0 is always in the past)
            signature: BytesN::from_array(&env, &[0; 96]),
        };

        // Sign the request using blst
        let message_hash = create_attestation_message(&env, &attestation_request);
        let signature_scalar = private_key.sign(
            &message_hash.to_array(),
            b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_",
            &[],
        );
        let signature_bytes = signature_scalar.serialize();
        attestation_request.signature = BytesN::from_array(&env, &signature_bytes);

        // Attempt to submit the expired attestation request
        let result = client.try_attest_by_delegation(&submitter, &attestation_request);
        assert_eq!(result, Err(Ok(ProtocolError::ExpiredSignature.into())));

        // Verify nonce was not consumed
        assert_eq!(client.get_attester_nonce(&attester), 0);
    }

    // Test 2: First create a valid delegated attestation to revoke
    let valid_attestation_request = create_delegated_attestation_request(
        &env,
        &attester,
        0, // nonce
        &schema_uid,
        &subject,
    );
    client.attest_by_delegation(&submitter, &valid_attestation_request);

    // Get the attestation UID that was created (HAL-01 formula).
    let attestation_uid = env.as_contract(&contract_id, || {
        protocol::utils::generate_attestation_uid(
            &env,
            &schema_uid,
            &subject,
            &attester,
            0, // nonce used in the attestation
        )
    });

    // Test 3: Expired delegated revocation
    {
        let private_key =
            blst::min_sig::SecretKey::from_bytes(&TEST_BLS_PRIVATE_KEY).expect("Failed to create private key");

        let mut revocation_request = DelegatedRevocationRequest {
            attestation_uid: attestation_uid.clone(),
            schema_uid: schema_uid.clone(),
            subject: subject.clone(),
            nonce: client.get_attester_nonce(&attester), // should be 1 after attestation
            revoker: attester.clone(),
            deadline: 500, // Expired deadline (timestamp 0 is always in the past)
            signature: BytesN::from_array(&env, &[0; 96]),
        };

        // Sign the revocation request using blst
        let message_hash = create_revocation_message(&env, &revocation_request);
        let signature_scalar = private_key.sign(
            &message_hash.to_array(),
            b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_",
            &[],
        );
        let signature_bytes = signature_scalar.serialize();
        revocation_request.signature = BytesN::from_array(&env, &signature_bytes);

        // Attempt to submit the expired revocation request
        let result = client.try_revoke_by_delegation(&submitter, &revocation_request);
        assert_eq!(result, Err(Ok(ProtocolError::ExpiredSignature.into())));

        // Verify the attestation is still not revoked
        let attestation = client.get_attestation(&attestation_uid);
        assert!(!attestation.revoked);
    }
}

// =======================================================================================
//
//                              HAL-01 — Attestation UID hardening
//
// =======================================================================================

/// **Test: HAL-01 — Two attesters, same subject/nonce, no UID collision (delegated)**
///
/// Pre-fix: `generate_attestation_uid` derived the UID from (schema_uid, subject, nonce).
/// Two distinct attesters submitting a delegated attestation for the same subject with
/// nonce=0 would collide and the second submission would silently overwrite the first.
///
/// Post-fix (HAL-01): the UID is derived from
/// `b"ATTEST_UID_V1" || contract_address || schema_uid || subject || attester || nonce`,
/// so two different attesters produce two different UIDs for the same subject/nonce.
#[test]
fn test_hal01_two_attesters_same_subject_nonce_no_collision() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let attester_a = Address::generate(&env);
    let attester_b = Address::generate(&env);
    let subject = Address::generate(&env);
    let submitter = Address::generate(&env);

    client.initialize(&admin);
    let schema_uid = client.register(&admin, &SorobanString::from_str(&env, "schema"), &None, &true);

    // Both attesters share the test BLS keypair — the protocol pins keys per
    // address and does not require uniqueness of the key bytes.
    let public_key = BytesN::from_array(&env, &TEST_BLS_G2_PUBLIC_KEY);
    client.register_bls_key(&attester_a, &public_key);
    client.register_bls_key(&attester_b, &public_key);

    let req_a = create_delegated_attestation_request(&env, &attester_a, 0, &schema_uid, &subject);
    let req_b = create_delegated_attestation_request(&env, &attester_b, 0, &schema_uid, &subject);

    client.attest_by_delegation(&submitter, &req_a);
    client.attest_by_delegation(&submitter, &req_b);

    // Compute both expected UIDs under the contract context. They must differ.
    let (uid_a, uid_b) = env.as_contract(&contract_id, || {
        let a = protocol::utils::generate_attestation_uid(&env, &schema_uid, &subject, &attester_a, 0);
        let b = protocol::utils::generate_attestation_uid(&env, &schema_uid, &subject, &attester_b, 0);
        (a, b)
    });
    assert_ne!(uid_a, uid_b, "HAL-01: two attesters must yield distinct UIDs");

    let stored_a = client.get_attestation(&uid_a);
    let stored_b = client.get_attestation(&uid_b);
    assert_eq!(stored_a.attester, attester_a);
    assert_eq!(stored_b.attester, attester_b);
    assert_eq!(stored_a.subject, subject);
    assert_eq!(stored_b.subject, subject);
}

/// **Test: HAL-01 — Duplicate-UID guard blocks an exact replay**
///
/// Even though the per-attester nonce check usually catches replays first, this test
/// asserts the defence-in-depth guard added in `attest_by_delegation`: if a UID already
/// exists in storage, the call must fail with `AttestationExists` rather than silently
/// overwriting the prior record.
///
/// We exercise the guard by directly inserting a record under the post-HAL-01 UID and
/// then submitting a delegated request whose successful path would attempt to write at
/// the same UID. The guard fires before the storage write.
#[test]
fn test_hal01_duplicate_uid_guard_blocks_overwrite() {
    use protocol::state::{Attestation, DataKey};

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

    // Pre-compute the UID the legitimate path would produce, then plant a record there.
    let planted_uid = env.as_contract(&contract_id, || {
        protocol::utils::generate_attestation_uid(&env, &schema_uid, &subject, &attester, 0)
    });

    let planted = Attestation {
        uid: planted_uid.clone(),
        schema_uid: schema_uid.clone(),
        subject: subject.clone(),
        attester: attester.clone(),
        value: SorobanString::from_str(&env, "{\"planted\":true}"),
        nonce: 0,
        timestamp: 1,
        expiration_time: None,
        revoked: false,
        revocation_time: None,
    };
    env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::AttestationUID(planted_uid.clone()), &planted);
    });

    // Submit the legit signed request; the duplicate-UID guard must reject it.
    let req = create_delegated_attestation_request(&env, &attester, 0, &schema_uid, &subject);
    let result = client.try_attest_by_delegation(&submitter, &req);
    assert_eq!(result, Err(Ok(ProtocolError::AttestationExists.into())));

    // The planted record is preserved.
    let still_there = client.get_attestation(&planted_uid);
    assert_eq!(still_there.value, SorobanString::from_str(&env, "{\"planted\":true}"));
}

// =======================================================================================
//
//                              HAL-05 — Delegated expiration_time check
//
// =======================================================================================

/// Build a delegated attestation request with a custom `expiration_time` and a
/// valid BLS signature against the test key. Lives here rather than in
/// `testutils.rs` because it's only consumed by HAL-05 tests.
fn build_signed_delegated_request_with_expiration(
    env: &Env,
    attester: &Address,
    nonce: u64,
    schema_uid: &BytesN<32>,
    subject: &Address,
    expiration_time: Option<u64>,
) -> DelegatedAttestationRequest {
    let private_key = blst::min_sig::SecretKey::from_bytes(&TEST_BLS_PRIVATE_KEY)
        .expect("valid test private key");

    let mut request = DelegatedAttestationRequest {
        schema_uid: schema_uid.clone(),
        subject: subject.clone(),
        value: SorobanString::from_str(env, "{\"key\":\"value\"}"),
        nonce,
        attester: attester.clone(),
        expiration_time,
        deadline: env.ledger().timestamp() + 1000,
        signature: BytesN::from_array(env, &[0; 96]),
    };

    let message_hash = create_attestation_message(env, &request);
    let sig = private_key.sign(
        &message_hash.to_array(),
        b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_",
        &[],
    );
    request.signature = BytesN::from_array(env, &sig.serialize());
    request
}

/// **Test: HAL-05 — Delegated attestation rejects an already-expired `expiration_time`**
///
/// Pre-fix: `attest_by_delegation` did not validate `expiration_time` against the
/// current ledger timestamp, so a request signed with `expiration_time` already
/// in the past would land and be stored as a born-expired record.
/// Post-fix: the same guard the direct `attest` path uses now applies, returning
/// `Error::InvalidDeadline`.
#[test]
fn test_hal05_expired_expiration_time_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1000);

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let subject = Address::generate(&env);
    let submitter = Address::generate(&env);

    client.initialize(&admin);
    let schema_uid = client.register(&admin, &SorobanString::from_str(&env, "schema"), &None, &true);
    client.register_bls_key(&attester, &BytesN::from_array(&env, &TEST_BLS_G2_PUBLIC_KEY));

    // expiration_time = current_time - 1 → already expired.
    let req = build_signed_delegated_request_with_expiration(
        &env,
        &attester,
        0,
        &schema_uid,
        &subject,
        Some(999),
    );

    let result = client.try_attest_by_delegation(&submitter, &req);
    assert_eq!(result, Err(Ok(ProtocolError::InvalidDeadline.into())));

    // Nonce was not consumed.
    assert_eq!(client.get_attester_nonce(&attester), 0);
}

/// **Test: HAL-05 — Delegated attestation accepts a valid future `expiration_time`**
#[test]
fn test_hal05_valid_expiration_time_accepted() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1000);

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let subject = Address::generate(&env);
    let submitter = Address::generate(&env);

    client.initialize(&admin);
    let schema_uid = client.register(&admin, &SorobanString::from_str(&env, "schema"), &None, &true);
    client.register_bls_key(&attester, &BytesN::from_array(&env, &TEST_BLS_G2_PUBLIC_KEY));

    let exp = 1000 + 3600;
    let req = build_signed_delegated_request_with_expiration(
        &env,
        &attester,
        0,
        &schema_uid,
        &subject,
        Some(exp),
    );
    client.attest_by_delegation(&submitter, &req);

    let attestation_uid = env.as_contract(&contract_id, || {
        protocol::utils::generate_attestation_uid(&env, &schema_uid, &subject, &attester, 0)
    });
    let stored = client.get_attestation(&attestation_uid);
    assert_eq!(stored.expiration_time, Some(exp));
}

// =======================================================================================
//
//                            H-CONTRACT-4 — Delegated revoke subject match
//
// =======================================================================================

/// Build and sign a delegated revocation request with a custom `subject` field.
/// Used to exercise the H-CONTRACT-4 subject-mismatch guard.
fn build_signed_delegated_revoke_with_subject(
    env: &Env,
    attester: &Address,
    nonce: u64,
    schema_uid: &BytesN<32>,
    attestation_uid: &BytesN<32>,
    subject: &Address,
) -> DelegatedRevocationRequest {
    let private_key = blst::min_sig::SecretKey::from_bytes(&TEST_BLS_PRIVATE_KEY)
        .expect("valid test private key");

    let mut req = DelegatedRevocationRequest {
        attestation_uid: attestation_uid.clone(),
        schema_uid: schema_uid.clone(),
        subject: subject.clone(),
        nonce,
        revoker: attester.clone(),
        deadline: env.ledger().timestamp() + 1000,
        signature: BytesN::from_array(env, &[0; 96]),
    };
    let message_hash = create_revocation_message(env, &req);
    let sig = private_key.sign(
        &message_hash.to_array(),
        b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_",
        &[],
    );
    req.signature = BytesN::from_array(env, &sig.serialize());
    req
}

/// **Test: H-CONTRACT-4 — Delegated revoke rejects a subject that doesn't match the stored attestation**
///
/// Pre-fix: `revoke_by_delegation` validated `attestation.schema_uid == request.schema_uid`
/// but not `attestation.subject == request.subject`. The signed message hash binds the
/// subject, so the ultimate failure mode was `InvalidSignature`, but a precise cheap
/// guard at the head of the function surfaces a more informative error and decouples
/// from any future drift in message construction.
#[test]
fn test_h_contract4_subject_mismatch_in_delegated_revoke_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let subject_real = Address::generate(&env);
    let subject_fake = Address::generate(&env);
    let submitter = Address::generate(&env);

    client.initialize(&admin);
    let schema_uid = client.register(&admin, &SorobanString::from_str(&env, "schema"), &None, &true);
    client.register_bls_key(&attester, &BytesN::from_array(&env, &TEST_BLS_G2_PUBLIC_KEY));

    // Create a real attestation for `subject_real`.
    let attest_req = create_delegated_attestation_request(&env, &attester, 0, &schema_uid, &subject_real);
    client.attest_by_delegation(&submitter, &attest_req);
    let attestation_uid = env.as_contract(&contract_id, || {
        protocol::utils::generate_attestation_uid(&env, &schema_uid, &subject_real, &attester, 0)
    });

    // Build a revoke request that lies about the subject.
    let revoke_req = build_signed_delegated_revoke_with_subject(
        &env,
        &attester,
        client.get_attester_nonce(&attester),
        &schema_uid,
        &attestation_uid,
        &subject_fake,
    );
    let result = client.try_revoke_by_delegation(&submitter, &revoke_req);
    assert_eq!(result, Err(Ok(ProtocolError::InvalidReference.into())));

    // The attestation is untouched.
    assert!(!client.get_attestation(&attestation_uid).revoked);
}

/// **Test: H-CONTRACT-4 — Delegated revoke succeeds when subject matches**
#[test]
fn test_h_contract4_correct_subject_revoke_succeeds() {
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
    client.register_bls_key(&attester, &BytesN::from_array(&env, &TEST_BLS_G2_PUBLIC_KEY));

    let attest_req = create_delegated_attestation_request(&env, &attester, 0, &schema_uid, &subject);
    client.attest_by_delegation(&submitter, &attest_req);
    let attestation_uid = env.as_contract(&contract_id, || {
        protocol::utils::generate_attestation_uid(&env, &schema_uid, &subject, &attester, 0)
    });

    let revoke_req = build_signed_delegated_revoke_with_subject(
        &env,
        &attester,
        client.get_attester_nonce(&attester),
        &schema_uid,
        &attestation_uid,
        &subject,
    );
    client.revoke_by_delegation(&submitter, &revoke_req);
    assert!(client.get_attestation(&attestation_uid).revoked);
}

/// **Reference vector for the W5 SDK port (HAL-01 attestation UID).**
///
/// W5 must mirror the on-chain formula in `packages/stellar-sdk/`. This test prints
/// the bytes produced by `generate_attestation_uid` on a fully-pinned input set so
/// the SDK author can copy the value into a parity test. The contract address is
/// itself an input (HAL-01 includes it for cross-deployment isolation), so the
/// printed UID is unique to this test deployment — the SDK parity check should use
/// the same canonical inputs (schema_uid all-0x11, subject GAAA…AWHF, attester
/// GBBB…CWHL, nonce=42) and assert that, when the SDK is told the contract address
/// matches what we print here, it produces the same bytes.
#[test]
fn test_hal01_uid_reference_vector_for_w5() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());

    // Pinned canonical inputs. We use generated addresses (the test SDK only
    // accepts valid strkey-encoded addresses for `Address::from_str`), so the
    // exact address strings vary between runs — but the assertion below just
    // pins determinism, and the printout gives W5 the bytes they need.
    let schema_uid = BytesN::from_array(&env, &[0x11u8; 32]);
    let subject = Address::generate(&env);
    let attester = Address::generate(&env);
    let nonce: u64 = 42;

    let (uid_a, uid_b) = env.as_contract(&contract_id, || {
        let a = protocol::utils::generate_attestation_uid(&env, &schema_uid, &subject, &attester, nonce);
        let b = protocol::utils::generate_attestation_uid(&env, &schema_uid, &subject, &attester, nonce);
        (a, b)
    });
    assert_eq!(uid_a, uid_b, "HAL-01 UID generation must be deterministic");

    eprintln!("HAL-01 W5_VECTOR_ATTEST_UID");
    eprintln!("  contract_id : {:?}", contract_id.to_string());
    eprintln!("  schema_uid  : {}", hex::encode([0x11u8; 32]));
    eprintln!("  subject     : {:?}", subject.to_string());
    eprintln!("  attester    : {:?}", attester.to_string());
    eprintln!("  nonce       : {}", nonce);
    eprintln!("  attest_uid  : {}", hex::encode(uid_a.to_array()));

    // Sanity: the produced UID is non-zero (keccak256 of non-empty input).
    assert_ne!(uid_a.to_array(), [0u8; 32]);
}
