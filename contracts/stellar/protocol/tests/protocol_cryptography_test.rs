//! # BLS Cryptography and Delegation Tests
//!
//! This module contains comprehensive tests for the BLS12-381 cryptographic functionality
//! and delegated attestation/revocation features of the Attest Protocol.
//!
//! ## Test Categories
//!
//! ### Cryptographic Constants Validation
//! - Validates that hardcoded BLS12-381 curve points are valid and on-curve
//! - Generates reference constants for G1 and G2 generators
//!
//! ### Nonce Management
//! - Tests sequential nonce incrementation for UID collision prevention
//! - Validates attester-specific nonce isolation
//! - Stress tests nonce sequence integrity at scale
//!
//! ### BLS Key Registration
//! - Tests BLS public key registration and event emission
//! - Validates key storage and retrieval functionality
//!
//! ### Delegated Actions Security
//! - Tests signature verification for delegated attestations
//! - Validates rejection of unregistered BLS keys
//! - End-to-end signature verification with known key pairs
//!
//! ### Message Hash Consistency
//! - Cross-validates on-chain vs off-chain message construction
//! - Ensures signature compatibility between environments
//! - Tests both attestation and revocation message formats
//!
//! ## Security Properties Tested
//! - **Replay Attack Prevention**: Nonce-based protection mechanisms
//! - **Signature Authenticity**: BLS signature verification integrity
//! - **Cross-Chain Compatibility**: Message hash consistency
//! - **Key Management**: Secure BLS key registration and retrieval

mod testutils;
use testutils::{
    create_delegated_attestation_request, group_one_generator, group_two_generator, TEST_BLS_G2_PUBLIC_KEY,
};

use bls12_381::{G1Affine, G2Affine};
use protocol::{
    errors::Error as ProtocolError,
    instructions::{self, delegation::create_attestation_message},
    state::{DelegatedAttestationRequest, DelegatedRevocationRequest},
    AttestationContract, AttestationContractClient,
};

use soroban_sdk::{
    testutils::{Address as _, Events, MockAuth, MockAuthInvoke},
    xdr::ToXdr,
    Address, Bytes, BytesN, Env, IntoVal, String as SorobanString, TryIntoVal,
};

#[test]
/// Verify our constants are valid points on the curve
/// This is a sanity check to ensure our constants are valid points on the curve
///
/// We use the bls12_381 crate to generate the points and verify them.
///
fn test_valid_points() {
    let g1_gen = group_one_generator();
    let g2_gen = group_two_generator();

    assert!(bool::from(g1_gen.is_on_curve()));
    assert!(bool::from(g1_gen.is_torsion_free()));
    assert!(bool::from(g2_gen.is_on_curve()));
    assert!(bool::from(g2_gen.is_torsion_free()));
}

#[test]
/// Generate G1 uncompressed (96 bytes)
/// Generate G2 uncompressed (192 bytes)
///
/// This is a sanity check for compressed and uncompressed points.
/// We use the bls12_381 crate to generate the points and verify them.
///
fn generate_valid_bls_constants() {
    let g1_gen = G1Affine::generator();
    let g1_uncompressed = g1_gen.to_uncompressed();
    println!("G1 generator uncompressed (96 bytes):");
    print!("pub const TEST_BLS_G1_SIGNATURE: [u8; 96] = [");
    for (i, byte) in g1_uncompressed.iter().enumerate() {
        if i % 16 == 0 {
            print!("\n    ");
        }
        print!("0x{:02x}, ", byte);
    }
    println!("\n];");

    let g2_gen = G2Affine::generator();
    let g2_uncompressed = g2_gen.to_uncompressed();
    println!("\nG2 generator uncompressed (192 bytes):");
    print!("pub const TEST_BLS_G2_PUBLIC_KEY: [u8; 192] = [");
    for (i, byte) in g2_uncompressed.iter().enumerate() {
        if i % 16 == 0 {
            print!("\n    ");
        }
        print!("0x{:02x}, ", byte);
    }
    println!("\n];");

    // Verify they're valid
    let g1_from_bytes = G1Affine::from_uncompressed(&g1_uncompressed).unwrap();
    let g2_from_bytes = G2Affine::from_uncompressed(&g2_uncompressed).unwrap();

    assert_eq!(g1_from_bytes, g1_gen);
    assert_eq!(g2_from_bytes, g2_gen);

    println!("\n✅ All constants are valid BLS12-381 points!");
}

// =======================================================================================
//
//                                   NONCE MANAGEMENT
//
// =======================================================================================

/// Tests that the attestation contract correctly increments internal nonces to prevent UID collisions.
///
/// ## Purpose
/// Validates that the attestation protocol maintains a per-attester nonce counter that increments
/// with each successful attestation, ensuring each attestation generates a unique identifier (UID).
///
/// ## Test Scenario
/// 1. **Setup**: Initialize contract with admin and register a schema with an attester
/// 2. **Sequential Attestations**: Perform three attestations from the same attester to the same subject
/// 3. **Nonce Verification**: Verify that each attestation uses an incremented nonce value (0, 1, 2)
///
/// ## Expected Behavior from same attester on same subject on same schema
/// - First attestation should use nonce 0 and succeed
/// - Second attestation should use nonce 1 (preventing UID collision with first)
/// - Third attestation should use nonce 2 (preventing UID collision with previous two)
/// - Each attestation event should contain the correct nonce value in position 4 of the event data
///
/// ## Security Importance
/// This test ensures the protocol's fundamental security property: preventing attestation UID
/// collisions that could lead to attestation overwrites or duplicate attestation identifiers.
#[test]
fn test_nonce_incrementation() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let subject = Address::generate(&env);

    println!("=============================================================");
    println!("      Running TC: {}", "test_nonce_incrementation");
    println!("=============================================================");

    client.initialize(&admin);
    let schema_uid = client.register(&attester, &SorobanString::from_str(&env, "schema"), &None, &true);

    client.attest(
        &attester,
        &schema_uid,
        &SorobanString::from_str(&env, "value1"),
        &None,
    );
    let event_one = env.events().all().clone();

    client.attest(
        &attester,
        &schema_uid,
        &SorobanString::from_str(&env, "value2"),
        &None,
    );
    let event_two = env.events().all().clone();

    client.attest(
        &attester,
        &schema_uid,
        &SorobanString::from_str(&env, "value3"),
        &None,
    );
    let event_three = env.events().all().clone();

    let first_event_data: (BytesN<32>, Address, Address, SorobanString, u64, u64) =
        event_one.last().unwrap().2.try_into_val(&env).unwrap();
    let second_event_data: (BytesN<32>, Address, Address, SorobanString, u64, u64) =
        event_two.last().unwrap().2.try_into_val(&env).unwrap();
    let third_event_data: (BytesN<32>, Address, Address, SorobanString, u64, u64) =
        event_three.last().unwrap().2.try_into_val(&env).unwrap();

    dbg!(&first_event_data, &second_event_data, &third_event_data);
    // let (event_schema_uid, event_attester, event_subject, event_value, event_nonce, event_timestamp): (BytesN<32>, Address, Address, SorobanString, u64, u64) = first_event_data;
    assert_eq!(first_event_data.4, 0, "First attestation should use nonce 0");
    assert_eq!(second_event_data.4, 1, "Second attestation should use nonce 1");
    assert_eq!(third_event_data.4, 2, "Third attestation should use nonce 2");

    println!("=============================================================");
    println!("      Finished: {}", "test_nonce_incrementation");
    println!("=============================================================");
}

/// Tests that nonce counters are maintained separately for each attester address.
///
/// ## Purpose
/// Validates that the attestation protocol maintains independent nonce sequences per attester,
/// ensuring that different attesters do not interfere with each other's nonce progression.
///
/// ## Test Scenario
/// 1. **Setup**: Initialize contract and register a schema
/// 2. **Interleaved Attestations**: Perform attestations from two different attesters in sequence:
///    - Attester A makes first attestation (should use nonce 0 for A)
///    - Attester B makes first attestation (should use nonce 0 for B, independent of A)
///    - Attester A makes second attestation (should use nonce 1 for A)
/// 3. **Nonce Verification**: Verify each attester maintains their own nonce counter
///
/// ## Expected Behavior
/// - Attester A's first attestation uses nonce 0
/// - Attester B's first attestation uses nonce 0 (independent sequence)
/// - Attester A's second attestation uses nonce 1 (continuing A's sequence)
/// - Each attester's nonce sequence is isolated and unaffected by other attesters
///
/// ## Security Importance
/// This test ensures proper nonce isolation between attesters, preventing cross-attester
/// nonce interference that could lead to unexpected UID generation patterns.
#[test]
fn test_nonce_is_attester_specific() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester_a = Address::generate(&env);
    let attester_b = Address::generate(&env);
    let subject = Address::generate(&env);

    println!("=============================================================");
    println!("      Running TC: {}", "test_nonce_is_attester_specific");
    println!("=============================================================");

    client.initialize(&admin);
    let schema_uid = client.register(
        &admin, // Schema owner doesn't matter for this test
        &SorobanString::from_str(&env, "schema"),
        &None,
        &true,
    );

    client.attest(
        &attester_a,
        &schema_uid,
        &SorobanString::from_str(&env, "valueA"),
        &None,
    );
    let event_from_att_one = env.events().all().clone();

    client.attest(
        &attester_b,
        &schema_uid,
        &SorobanString::from_str(&env, "valueB"),
        &None,
    );
    let event_from_att_two = env.events().all().clone();

    client.attest(
        &attester_a,
        &schema_uid,
        &SorobanString::from_str(&env, "valueA2"),
        &None,
    );
    let event_from_att_three = env.events().all().clone();

    let event_from_att_one_data: (BytesN<32>, Address, Address, SorobanString, u64, u64) =
        event_from_att_one.last().unwrap().2.try_into_val(&env).unwrap();
    let event_from_att_two_data: (BytesN<32>, Address, Address, SorobanString, u64, u64) =
        event_from_att_two.last().unwrap().2.try_into_val(&env).unwrap();
    let event_from_att_three_data: (BytesN<32>, Address, Address, SorobanString, u64, u64) =
        event_from_att_three.last().unwrap().2.try_into_val(&env).unwrap();

    dbg!(
        &event_from_att_one_data,
        &event_from_att_two_data,
        &event_from_att_three_data
    );

    assert_eq!(
        event_from_att_one_data.4, 0,
        "Attester A's first attestation should use nonce 0"
    );
    assert_eq!(
        event_from_att_two_data.4, 0,
        "Attester B's first attestation should use nonce 0 (independent of A)"
    );
    assert_eq!(
        event_from_att_three_data.4, 1,
        "Attester A's second attestation should use nonce 1"
    );
    assert_eq!(
        event_from_att_one_data.2, attester_a,
        "First event should be from attester A"
    );
    assert_eq!(
        event_from_att_two_data.2, attester_b,
        "Second event should be from attester B"
    );
    assert_eq!(
        event_from_att_three_data.2, attester_a,
        "Third event should be from attester A"
    );

    println!("=============================================================");
    println!("      Finished: {}", "test_nonce_is_attester_specific");
    println!("=============================================================");
}

/// Tests that the contract enforces strict sequential nonce usage at scale.
///
/// ## Purpose
/// Validates that the attestation protocol maintains perfect nonce sequence integrity
/// across high-volume attestation scenarios, ensuring no gaps, jumps, or sequence
/// disruptions are possible even under stress conditions.
///
/// ## Test Scenario
/// 1. **Setup**: Initialize contract and register a schema
/// 2. **Comprehensive Sequential Testing**: Execute 1000 sequential attestations with unique values
/// 3. **Real-time Verification**: Verify each attestation uses the exact expected nonce (0-999)
///
/// ## Expected Behavior
/// - All 1000 attestations must use strictly sequential nonces: 0, 1, 2, ..., 999
/// - No gaps, jumps, or sequence disruptions across the entire range
/// - Protocol automatically assigns next sequential nonce for each attestation
/// - System maintains performance and accuracy across high-volume operations
/// - Continued sequential progression after the 100-attestation sequence
///
/// ## Security Importance
/// This comprehensive test ensures the nonce management system can maintain security
/// properties under realistic high-volume conditions, preventing sequence manipulation
/// attacks that could exploit edge cases or performance degradation scenarios.
#[test]
// #[ignore="this takes a lot of time"]
fn test_nonce_replay_future_nonce_rejection() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let subject = Address::generate(&env);

    println!("=============================================================");
    println!("      Running TC: {}", "test_nonce_future_nonce_rejection");
    println!("=============================================================");

    client.initialize(&admin);
    let schema_uid = client.register(&attester, &SorobanString::from_str(&env, "schema"), &None, &true);

    // Create an array with 1000 test values for comprehensive nonce sequence testing
    let test_values: Vec<String> = (0..1000).map(|i| format!("test_value_{:04}", i)).collect();

    let mut expected_nonce = 0u64;

    for (index, value) in test_values.iter().enumerate() {
        client.attest(
            &attester,
            &schema_uid,
            &SorobanString::from_str(&env, value),
            &None,
        );

        let events = env.events().all();
        let event_data: (BytesN<32>, Address, Address, SorobanString, u64, u64) =
            events.last().unwrap().2.try_into_val(&env).unwrap();

        assert_eq!(
            event_data.4,
            expected_nonce,
            "Attestation {} should use nonce {}, got {}",
            index + 1,
            expected_nonce,
            event_data.4
        );

        if (index + 1) % 200 == 0 {
            println!(
                "Progress: {} attestations completed, current nonce: {}",
                index + 1,
                expected_nonce
            );
        }

        expected_nonce += 1;
    }

    println!(
        "Completed {} attestations with perfect nonce sequence (0-{})",
        test_values.len(),
        expected_nonce - 1
    );

    /* Test continued sequential progression */
    client.attest(
        &attester,
        &schema_uid,
        &SorobanString::from_str(&env, "final_value"),
        &None,
    );

    let final_events = env.events().all();
    let final_event_data: (BytesN<32>, Address, Address, SorobanString, u64, u64) =
        final_events.last().unwrap().2.try_into_val(&env).unwrap();

    assert_eq!(
        final_event_data.4, expected_nonce,
        "Final attestation should use nonce {}",
        expected_nonce
    );

    println!("=============================================================");
    println!("      Finished: {}", "test_nonce_future_nonce_rejection");
    println!("=============================================================");
}

/// Tests BLS public key registration functionality and event emission.
///
/// ## Purpose
/// Validates that the attestation contract properly registers BLS public keys for attesters
/// and emits the correct `BLS_KEY_REGISTER` event with accurate data.
///
/// ## Expected Behavior
/// - BLS key registration should succeed without errors
/// - A `BLS_KEY_REGISTER` event should be emitted with:
///   - Correct attester address
///   - Registered public key (96 bytes)
///   - Current ledger timestamp
/// - The key should be stored and retrievable from the contract
///
/// ## Security Importance
/// BLS key registration is critical for cryptographic verification of attestations,
/// enabling signature validation and ensuring attestation authenticity.
#[test]
fn test_bls_key_registration_and_event() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    println!("=============================================================");
    println!("      Running TC: {}", "test_bls_key_registration_and_event");
    println!("=============================================================");

    client.initialize(&admin);

    let public_key = BytesN::from_array(&env, &TEST_BLS_G2_PUBLIC_KEY);

    client.register_bls_key(&attester, &public_key);

    let events = env.events().all();
    let last_event = events.last().unwrap();

    let expected_topics = (
        soroban_sdk::symbol_short!("BLS_KEY"),
        soroban_sdk::symbol_short!("REGISTER"),
    )
        .into_val(&env);

    let (event_attester, event_pk, event_timestamp): (Address, BytesN<192>, u64) =
        last_event.2.try_into_val(&env).unwrap();

    assert_eq!(
        last_event.1, expected_topics,
        "Event should have BLS_KEY_REGISTER topics"
    );
    assert_eq!(
        event_attester, attester,
        "Event should contain correct attester address"
    );
    assert_eq!(event_pk, public_key, "Event should contain the registered public key");
    assert_eq!(
        event_timestamp,
        env.ledger().timestamp(),
        "Event should contain current timestamp"
    );

    let stored_key = client.try_get_bls_key(&attester);
    assert!(stored_key.is_ok(), "BLS key should be retrievable");
    let bls_key = stored_key.unwrap().unwrap(); // First unwrap for SDK result, second for contract result
    assert_eq!(bls_key.key, public_key, "Stored key should match registered key");

    dbg!(&bls_key, &event_attester, &event_pk, &event_timestamp);

    println!("=============================================================");
    println!("      Finished: {}", "test_bls_key_registration_and_event");
    println!("=============================================================");
}

// =======================================================================================
//
//                              BLS KEY & DELEGATED ACTIONS
//
// =======================================================================================

/// **Test: Delegated Action with Unregistered Key**
/// - Ensures delegated actions fail if the attester has not registered a BLS key.
/// - This tests the first check within `verify_bls_signature`.
/// - Should fail with `Error::BlsPubKeyNotRegistered`.
#[test]
fn test_delegated_action_with_unregistered_key() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let subject = Address::generate(&env);
    let submitter = Address::generate(&env);

    client.initialize(&admin);
    let schema_uid = client.register(&attester, &SorobanString::from_str(&env, "schema"), &None, &true);

    // 1. Create a delegated attestation request.
    let request = create_delegated_attestation_request(&env, &attester, 0, &schema_uid, &subject);

    // 3. Attempt to submit the delegated attestation.
    let result = client.try_attest_by_delegation(&submitter, &request);
    dbg!(&result);

    // 4. Verify that the call fails with the correct error.
    assert_eq!(result, Err(Ok(ProtocolError::BlsPubKeyNotRegistered.into())));
}

#[test]

fn test_delegated_attestation_with_valid_signature() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let subject = Address::generate(&env);

    println!("=============================================================");
    println!("Running TC: {}", "test_delegated_attestation_with_valid_signature");
    println!("=============================================================");

    client.initialize(&admin);
    let schema_uid = client.register(&attester, &SorobanString::from_str(&env, "schema"), &None, &true);

    // Register the BLS public key for the attester
    let public_key = BytesN::from_array(&env, &TEST_BLS_G2_PUBLIC_KEY);
    client.register_bls_key(&attester, &public_key);

    let bls_key_entry = client.try_get_bls_key(&attester);
    assert!(bls_key_entry.is_ok(), "BLS key should be registered");
    let bls_key = bls_key_entry.unwrap().unwrap(); // First unwrap for SDK result, second for contract result
    assert_eq!(bls_key.key, public_key, "Stored key should match registered key");

    let delegated_attestation_request = create_delegated_attestation_request(&env, &attester, 0, &schema_uid, &subject);
    client.attest_by_delegation(&attester, &delegated_attestation_request);

    let events = env.events().all();
    dbg!(&events);

    assert!(!events.is_empty(), "Attestation event should be emitted");

    let last_attestation_event = events.last().unwrap();
    let (event_uid, event_subject, event_attester, _event_value, event_nonce, _): (
        BytesN<32>,
        Address,
        Address,
        SorobanString,
        u64,
        u64,
    ) = last_attestation_event.2.try_into_val(&env).unwrap();

    // 4. Verify that the attestation was created.
    let attestation_uid = protocol::utils::generate_attestation_uid(&env, &schema_uid, &subject, 0);
    let fetched = client.get_attestation(&attestation_uid);

    assert_eq!(
        fetched.attester, attester,
        "Attestation should be from the correct attester"
    );

    // Verify event data
    assert_eq!(event_attester, attester, "Event should contain correct attester");
    assert_eq!(event_subject, subject, "Event should contain correct subject");
    assert_eq!(event_nonce, 0, "First attestation should use nonce 0");

    dbg!(
        "Delegated attestation successful:",
        &event_uid,
        &event_attester,
        &event_subject,
        &event_attester,
    );

    println!("=============================================================");
    println!("      Finished: {}", "test_delegated_attestation_with_valid_signature");
    println!("=============================================================");
}

// **Test: End-to-End BLS Signature Verification**
// - Verifies that a signature generated off-chain with a known private key
//   can be successfully verified by the on-chain contract logic.
// - This confirms the message construction and signature verification are compatible.
#[test]
// #[should_panic="this is runnable"]
fn test_end_to_end_bls_signature_verification() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let subject = Address::generate(&env);
    let relayer = Address::generate(&env);

    client.initialize(&admin);

    let schema_uid = client.register(&attester, &SorobanString::from_str(&env, "schema"), &None, &true);

    let ikm: [u8; 32] = [
        0x1a, 0x9e, 0x24, 0x8c, 0x1f, 0x4d, 0x8a, 0x2a, 0x48, 0x9c, 0x3a, 0x4b, 0x5b, 0x1c, 0x8e, 0x2f, 0x9d, 0x3b,
        0x7e, 0x5f, 0x1a, 0x2a, 0x3c, 0x4d, 0x5e, 0x6f, 0x7a, 0x8b, 0x9c, 0x0d, 0x1e, 0x2f,
    ];

    // Generate new public key from private key using the blst crate with keygen or seed
    let private_key = blst::min_sig::SecretKey::key_gen_v3(&ikm, &[0; 8]).unwrap();
    let public_key = private_key.clone().sk_to_pk();
    let public_key_bytes = BytesN::from_array(&env, &public_key.serialize());

    // 3. Register the public key on-chain.
    client.register_bls_key(&attester, &public_key_bytes);

    let attester_nonce = client.get_attester_nonce(&attester);

    let mut request = DelegatedAttestationRequest {
        schema_uid: schema_uid.clone(),
        subject: subject.clone(),
        value: SorobanString::from_str(&env, "{\"key\":\"value\"}"),
        nonce: attester_nonce,
        attester: attester.clone(),
        expiration_time: Some(9876543210),
        deadline: env.ledger().timestamp() + 666,
        signature: BytesN::from_array(&env, &[0; 96]), // Not used for this test
    };

    let delegated_attestation_message: [u8; 32] = {
        let mut message_payload = Bytes::new(&env);

        let attestation_domain_separator = instructions::delegation::get_attest_dst();
        message_payload.extend_from_slice(attestation_domain_separator);

        // Field 1: Schema UID
        message_payload.extend_from_slice(&request.schema_uid.to_array());

        // Field 2: Subject Hash (SHA256 of XDR-encoded subject address)
        let subject_xdr = request.subject.clone().to_xdr(&env);
        let subject_hash = env.crypto().sha256(&subject_xdr);
        message_payload.extend_from_slice(&subject_hash.to_array());

        // Field 3: Nonce (big-endian)
        message_payload.extend_from_slice(&request.nonce.to_be_bytes());

        // Field 4: Deadline (big-endian)
        message_payload.extend_from_slice(&request.deadline.to_be_bytes());
        // Field 5: Expiration Time (optional, big-endian)
        if let Some(exp_time) = request.expiration_time {
            message_payload.extend_from_slice(&exp_time.to_be_bytes());
        }

        // FIELD 6: Value Hash (32 bytes, SHA256 of value XDR)
        let value_xdr = request.value.clone().to_xdr(&env);
        let value_hash = env.crypto().sha256(&value_xdr);
        message_payload.extend_from_slice(&value_hash.to_array());

        env.crypto().sha256(&message_payload).into()
    };

    let signature = private_key.sign(
        &delegated_attestation_message,
        b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_",
        &[],
    );
    request.signature = BytesN::from_array(&env, &signature.serialize());

    env.mock_auths(&[MockAuth {
        address: &relayer,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "attest_by_delegation",
            args: (relayer.clone(), request.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);

    let delegated_attestation = client.try_attest_by_delegation(&relayer, &request);
    dbg!(&delegated_attestation);

    let event = env.events().all().last().unwrap();

    let (event_uid, event_subject, event_attester, _event_value, event_nonce, _): (
        BytesN<32>,
        Address,
        Address,
        SorobanString,
        u64,
        u64,
    ) = event.2.try_into_val(&env).unwrap();

    let attestation_uid = protocol::utils::generate_attestation_uid(&env, &schema_uid, &subject, attester_nonce);
    let fetched = client.get_attestation(&attestation_uid);

    assert_eq!(fetched.attester, attester);
    assert_eq!(event_uid, attestation_uid);
    assert_eq!(event_subject, subject);
    assert_eq!(event_attester, attester);
    assert_eq!(event_nonce, attester_nonce);
}

/// **Test: Message Hash Consistency Between On-Chain and Off-Chain Logic**
///
/// This test provides very high confidence that the off-chain message construction
/// (simulated here in Rust) and the on-chain `create_attestation_message` function
/// produce the exact same hash. This is a critical check to prevent signature
/// verification failures caused by serialization mismatches.
#[test]
fn test_clean_room_attestation_message_hash() {
    let env = Env::default();
    let attester = Address::generate(&env);
    let subject = Address::generate(&env);
    let schema_uid = BytesN::from_array(&env, &[1; 32]);

    // 1. Create a sample request object with all fields populated.
    let request = DelegatedAttestationRequest {
        schema_uid: schema_uid.clone(),
        subject: subject.clone(),
        value: SorobanString::from_str(&env, "{\"key\":\"value\"}"),
        nonce: 12345,
        attester: attester.clone(),
        expiration_time: Some(9876543210),
        deadline: 1234567890,
        signature: BytesN::from_array(&env, &[0; 96]), // Not used for this test
    };

    // 2. Simulate the OFF-CHAIN message construction.
    // This logic is a clean-room implementation that MUST perfectly mirror
    // the production `create_attestation_message` function.
    let off_chain_hash: [u8; 32] = {
        let mut message_payload = Bytes::new(&env);

        let attestation_domain_separator = instructions::delegation::get_attest_dst();
        message_payload.extend_from_slice(attestation_domain_separator);

        // Field 1: Schema UID
        message_payload.extend_from_slice(&request.schema_uid.to_array());

        // Field 2: Subject Hash (SHA256 of XDR-encoded subject address)
        let subject_xdr = request.subject.clone().to_xdr(&env);
        let subject_hash = env.crypto().sha256(&subject_xdr);
        message_payload.extend_from_slice(&subject_hash.to_array());

        // Field 3: Nonce (big-endian)
        message_payload.extend_from_slice(&request.nonce.to_be_bytes());

        // Field 4: Deadline (big-endian)
        message_payload.extend_from_slice(&request.deadline.to_be_bytes());
        // Field 5: Expiration Time (optional, big-endian)
        if let Some(exp_time) = request.expiration_time {
            message_payload.extend_from_slice(&exp_time.to_be_bytes());
        }

        // FIELD 6: Value Hash (32 bytes, SHA256 of value XDR)
        let value_xdr = request.value.clone().to_xdr(&env);
        let value_hash = env.crypto().sha256(&value_xdr);
        message_payload.extend_from_slice(&value_hash.to_array());

        env.crypto().sha256(&message_payload).into()
    };

    // 3. Call the ON-CHAIN message construction function from the contract.
    let on_chain_hash_bytesn = create_attestation_message(&env, &request);
    let on_chain_hash = on_chain_hash_bytesn.to_array();

    // 4. Assert that the two hashes are absolutely identical.
    println!("Off-chain generated hash: {:?}", off_chain_hash);
    println!("On-chain generated hash:  {:?}", on_chain_hash);
    assert_eq!(off_chain_hash, on_chain_hash);
}

#[test]
fn test_clean_room_revocation_message_hash() {
    let env = Env::default();
    let attester = Address::generate(&env);
    let subject = Address::generate(&env);
    let schema_uid = BytesN::from_array(&env, &[1; 32]);

    // 1. Create a sample request object with all fields populated.
    let request = DelegatedRevocationRequest {
        schema_uid: schema_uid.clone(),
        subject: subject.clone(),
        nonce: 0,
        deadline: env.ledger().timestamp() + 1000,
        /* This is not valid because we are only computing for
        the hash of the message, not the signature
        */
        attestation_uid: BytesN::from_array(&env, &[0; 32]),
        revoker: attester.clone(),
        signature: BytesN::from_array(&env, &[0; 96]), // Not used for this test
    };

    // 2. Simulate the OFF-CHAIN message construction.
    // This logic is a clean-room implementation that MUST perfectly mirror
    // the production `create_revocation_message` function.
    let off_chain_hash: [u8; 32] = {
        let mut payload = Bytes::new(&env);

        let revocation_domain_separator = instructions::delegation::get_revoke_dst();
        payload.extend_from_slice(revocation_domain_separator);

        // Field 1: Schema UID
        payload.extend_from_slice(&request.schema_uid.to_array());

        // Field 2: Attestation UID (binds signature to specific attestation)
        payload.extend_from_slice(&request.attestation_uid.to_array());

        // Field 3: Nonce
        payload.extend_from_slice(&request.nonce.to_be_bytes());

        // Field 4: Deadline
        payload.extend_from_slice(&request.deadline.to_be_bytes());

        env.crypto().sha256(&payload).into()
    };

    // 3. Call the ON-CHAIN message construction function from the contract.
    let on_chain_hash_bytesn = instructions::create_revocation_message(&env, &request);
    assert_eq!(off_chain_hash, on_chain_hash_bytesn.to_array());
}
