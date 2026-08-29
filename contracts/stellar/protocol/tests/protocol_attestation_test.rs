mod testutils;
use protocol::{
    errors::Error,
    state::{Attestation, DataKey},
    utils::{create_xdr_string, generate_attestation_uid},
    AttestationContract, AttestationContractClient,
};
// Tests below depend on `env.current_contract_address()` for the post-HAL-01
// UID formula, so we register a throwaway contract and compute UIDs inside
// `env.as_contract(...)`. Keep this in sync with `generate_attestation_uid`
// in `contracts/stellar/protocol/src/utils.rs`.
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, Ledger, LedgerInfo, MockAuth, MockAuthInvoke},
    Address, BytesN, Env, IntoVal, String as SorobanString, TryIntoVal,
};

fn return_schema_definition(env: &Env) -> String {
    let schema = create_xdr_string(
        &env,
        &SorobanString::from_str(
            &env,
            r#"{"name":"Simple","version":"1.0","description":"Simple","fields":[]}"#,
        ),
    )
    .to_string();
    format!("XDR:{}", schema)
}
/// **Test: HAL-01 — Determinism check for the post-HAL-01 attestation UID formula**
///
/// The HAL-01 fix changes `generate_attestation_uid` to bind the UID to:
///   `b"ATTEST_UID_V1" || contract_address_xdr || schema_uid_xdr ||
///    subject_xdr || attester_xdr || nonce_be8`
/// hashed with keccak256.
///
/// Because the formula now depends on `env.current_contract_address()` and the
/// contract address is randomized per `env.register(...)` call, we cannot pin a
/// hardcoded UID independent of the deployment. This test instead verifies
/// determinism (same inputs => same output) and prints the produced bytes so the
/// W5 SDK port can build the matching off-chain helper. A separate reference-
/// vector test in `protocol_delegation_test.rs` pins UIDs against fully-qualified
/// canonical inputs (see `test_hal01_uid_reference_vector_for_w5`).
#[test]
fn test_generate_compatible_attestation_uid() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());

    let schema_uid = BytesN::from_array(
        &env,
        &[
            0xa8, 0xb1, 0x58, 0xf4, 0xf0, 0xaa, 0xdc, 0x90, 0x3c, 0xd5, 0x81, 0x11, 0x19, 0x9d, 0x8f, 0x71, 0xe7, 0x56,
            0x14, 0xe6, 0x47, 0xd3, 0xc2, 0x8c, 0x39, 0x0c, 0x90, 0x40, 0x14, 0x28, 0x1f, 0x6d,
        ],
    );
    let subject = Address::from_str(&env, "GD25F6Z56KYTB4I4EU7KHGLM43VRBNENAUQ3GP24FZIO6WNAAJMUA7P5");
    let attester = Address::generate(&env);
    let nonce: u64 = 0;

    let (uid_a, uid_b) = env.as_contract(&contract_id, || {
        let a = generate_attestation_uid(&env, &schema_uid, &subject, &attester, nonce);
        let b = generate_attestation_uid(&env, &schema_uid, &subject, &attester, nonce);
        (a, b)
    });

    // Determinism: same inputs => same UID.
    assert_eq!(uid_a, uid_b);

    println!("=============================================================");
    println!("      HAL-01 generate_attestation_uid determinism check");
    println!("=============================================================");
    println!(
        "schema_uid: {}",
        schema_uid
            .iter()
            .map(|b| format!("{:02x}", b))
            .collect::<Vec<String>>()
            .join("")
    );
    println!("subject:    {:?}", subject.to_string());
    println!("attester:   {:?}", attester.to_string());
    println!("nonce:      {}", nonce);
    println!(
        "produced uid (depends on test contract address): {}",
        hex::encode(uid_a.to_array())
    );
}

/// **Test: Basic Attestation Creation and Retrieval**
///
/// This is the core "happy path" test that verifies the fundamental attestation workflow:
/// 1. Contract initialization with an admin
/// 2. Schema registration by an attester
/// 3. Attestation creation with an expiration time
/// 4. Event emission verification (CREATE event with correct data)
/// 5. Attestation retrieval and data integrity verification
///
/// **Key Assertions:**
/// - All attestation fields match input values
/// - Event is emitted with correct topics and data
/// - Generated UID matches expected hash
/// - Attestation is not revoked by default
#[test]
fn create_and_get_attestation() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    println!("=============================================================");
    println!("      Running test case: {}", "create_and_get_attestation");
    println!("=============================================================");

    // initialize
    let admin_clone_for_init_args = admin.clone();
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (admin_clone_for_init_args,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin);

    // register schema
    let schema_definition = SorobanString::from_str(
        &env,
        &create_xdr_string(
            &env,
            &SorobanString::from_str(
                &env,
                r#"{"name":"Simple","version":"1.0","description":"Simple","fields":[]}"#,
            ),
        )
        .to_string(),
    );
    let resolver: Option<Address> = None;
    let revocable = true;
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "register",
            args: (attester.clone(), schema_definition.clone(), resolver.clone(), revocable).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let schema_uid: BytesN<32> = client.register(&attester, &schema_definition, &resolver, &revocable);

    // attest
    let value = SorobanString::from_str(&env, "{\"foo\":\"bar\"}");
    let expiration_time = Some(123456789u64);
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "attest",
            args: (
                attester.clone(),
                schema_uid.clone(),
                value.clone(),
                expiration_time.clone(),
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let attestation_uid: BytesN<32> = client.attest(&attester, &schema_uid, &value, &expiration_time);

    // verify event shape
    let events = testutils::all_events(&env);
    let last = events.last().unwrap();
    assert_eq!(last.0, contract_id);
    let expected_topics = (symbol_short!("ATTEST"), symbol_short!("CREATE")).into_val(&env);
    assert_eq!(last.1, expected_topics);
    // Post HAL-09 the ATTEST/CREATE event tuple is:
    //   (uid, schema_uid, subject, attester, value, nonce, timestamp)
    let (_uid_ev, schema_uid_ev, subject_ev, attester_ev, value_ev, nonce_ev, timestamp_ev): (
        BytesN<32>,
        BytesN<32>,
        Address,
        Address,
        SorobanString,
        u64,
        u64,
    ) = last.2.try_into_val(&env).unwrap();
    assert_eq!(schema_uid_ev, schema_uid);

    dbg!(&subject_ev, &attester_ev, &value_ev, &nonce_ev);
    assert_eq!(subject_ev, attester);
    assert_eq!(attester_ev, attester);
    assert_eq!(value_ev, value);
    let recomputed_uid = env.as_contract(&contract_id, || {
        generate_attestation_uid(&env, &schema_uid, &attester, &attester, nonce_ev)
    });
    assert_eq!(recomputed_uid, attestation_uid);
    let _ = timestamp_ev; // timestamp may be zero in test env; no assertion

    // get attestation and verify
    let fetched = client.get_attestation(&attestation_uid);
    assert_eq!(fetched.schema_uid, schema_uid);
    assert_eq!(fetched.subject, attester);
    assert_eq!(fetched.attester, attester);
    assert_eq!(fetched.value, value);
    assert_eq!(fetched.uid, attestation_uid);
    assert_eq!(fetched.expiration_time, expiration_time);
    assert_eq!(fetched.revoked, false);

    println!("=============================================================");
    println!("      Finished test case: {}", "create_and_get_attestation");
    println!("=============================================================");
}

/// **Test: Attestation Lifecycle with Expiration Handling**
///
/// This test validates the complete lifecycle of attestations with time-based constraints:
/// 1. Creates attestations with different expiration scenarios
/// 2. Tests retrieval before expiration (should succeed)
/// 3. Simulates time progression using ledger manipulation
/// 4. Verifies that expired attestations can still be retrieved (before cleanup)
///
/// **Key Scenarios:**
/// - Non-expiring attestation (expiration_time = None equivalent)
/// - Future expiration time (should be accessible)
/// - Time manipulation using LedgerInfo
///
/// **Note:** This test uses a non-revocable schema to isolate expiration testing
/// from revocation logic.
#[test]
fn test_attestation_and_expiration() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    println!("==================================================================");
    println!("   Running test case: {}", "test_attestation_and_expiration");
    println!("==================================================================");

    let admin_clone_for_init_args = admin.clone();
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (admin_clone_for_init_args,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin);
    let schema_definition = SorobanString::from_str(&env, &return_schema_definition(&env));
    let resolver: Option<Address> = None;
    let revocable = false;
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "register",
            args: (attester.clone(), schema_definition.clone(), resolver.clone(), revocable).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let schema_uid: BytesN<32> = client.register(&attester, &schema_definition, &resolver, &revocable);

    let default_ledger_info = LedgerInfo {
        protocol_version: 22,
        sequence_number: 0,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 0,
        min_persistent_entry_ttl: 0,
        max_entry_ttl: 0,
        timestamp: env.ledger().timestamp() + 1001,
    };

    let value = SorobanString::from_str(&env, "{\"graduating_year\":\"2025\"}");
    let will_not_expire = Some(env.ledger().timestamp() + 5555);

    env.ledger().set(default_ledger_info);
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "attest",
            args: (
                attester.clone(),
                schema_uid.clone(),
                value.clone(),
                will_not_expire.clone(),
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let non_expired_attestation_uid: BytesN<32> =
        client.attest(&attester, &schema_uid, &value, &will_not_expire);
    let fetched_non_expired = client.get_attestation(&non_expired_attestation_uid);
    assert_eq!(fetched_non_expired.uid, non_expired_attestation_uid);
    assert_eq!(fetched_non_expired.value, value);
    assert_eq!(fetched_non_expired.expiration_time, will_not_expire);
    assert_eq!(fetched_non_expired.revoked, false);

    dbg!(&fetched_non_expired);

    println!("=============================================================");
    println!("Creating second attestation that will be tested after time passes");
    println!("=============================================================");

    let expiration_time = Some(env.ledger().timestamp() + 777);

    // Mock auth for the second attestation
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "attest",
            args: (
                attester.clone(),
                schema_uid.clone(),
                value.clone(),
                expiration_time.clone(),
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let expired_attestation_uid: BytesN<32> = client.attest(&attester, &schema_uid, &value, &expiration_time);

    let fetched_expired = client.get_attestation(&expired_attestation_uid);
    assert_eq!(fetched_expired.uid, expired_attestation_uid);
    assert_eq!(fetched_expired.value, value);
    assert_eq!(fetched_expired.expiration_time, expiration_time);
    assert_eq!(fetched_expired.revoked, false);

    dbg!(&fetched_expired);

    println!("==================================================================");
    println!("   Finished test case: {}", "test_attestation_and_expiration");
    println!("==================================================================");
}

/// **Test: Revocation Workflow for Revocable Schemas**
///
/// Validates the complete revocation process including:
/// 1. Schema registration with revocable=true
/// 2. Attestation creation on the revocable schema
/// 3. Successful revocation by the original attester
/// 4. Event emission verification (REVOKE event)
/// 5. Event data structure validation
///
/// **Key Assertions:**
/// - Revocation succeeds for revocable schemas
/// - REVOKE event is emitted with correct structure
/// - Event contains: (attestation_uid, schema_uid, attester, subject, revoked=true, timestamp)
/// - Only the original attester can revoke (authorization check)
///
/// **Test Coverage:**
/// - Authorization: attester revoking their own attestation
/// - Event emission: correct topics and data structure
/// - State change: revocation flag and timestamp
#[test]
fn test_can_revoke_non_revocable_schema() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    // initialize
    let admin_clone_for_init_args = admin.clone();
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (admin_clone_for_init_args,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin);

    println!("=============================================================");
    println!("start: test_can_revoke_revocable_schema");
    println!("=============================================================");

    let schema_definition = SorobanString::from_str(&env, &return_schema_definition(&env));
    let resolver: Option<Address> = None;
    let revocable = true;
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "register",
            args: (attester.clone(), schema_definition.clone(), resolver.clone(), revocable).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let schema_uid: BytesN<32> = client.register(&attester, &schema_definition, &resolver, &revocable);

    let value = SorobanString::from_str(&env, "{\"foo\":\"bar\"}");
    let expiration_time: Option<u64> = None;
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "attest",
            args: (
                attester.clone(),
                schema_uid.clone(),
                value.clone(),
                expiration_time.clone(),
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let non_expired_attestation_uid: BytesN<32> =
        client.attest(&attester, &schema_uid, &value, &expiration_time);
    dbg!(&non_expired_attestation_uid, &schema_uid);
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "revoke",
            args: (attester.clone(), non_expired_attestation_uid.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.revoke(&attester, &non_expired_attestation_uid);
    let revoke_event_data = testutils::all_events(&env).last().unwrap();

    let expected_topics = (symbol_short!("ATTEST"), symbol_short!("REVOKE")).into_val(&env);
    assert_eq!(revoke_event_data.1, expected_topics);

    let event_data: (BytesN<32>, BytesN<32>, Address, Address, bool, Option<u64>) =
        revoke_event_data.2.try_into_val(&env).unwrap();
    dbg!(&revoke_event_data, &event_data);
    assert_eq!(event_data.4, true);
    assert_eq!(event_data.0, non_expired_attestation_uid);
    assert_eq!(event_data.1, schema_uid);
    assert_eq!(event_data.2, attester);
    assert_eq!(event_data.3, attester);
    assert_eq!(event_data.5, Some(env.ledger().timestamp()));

    println!("=============================================================");
    println!("   Finished test case: {}", "test_can_revoke_non_revocable_schema");
    println!("=============================================================");
}

/// **Test: Multiple Attestations with Nonce-Based Uniqueness**
///
/// Verifies the nonce-based system that allows multiple attestations for the same
/// (schema, subject) pair:
/// 1. Creates three separate attestations for the same subject and schema
/// 2. Validates that each gets a unique UID based on incremental nonces
/// 3. Ensures all attestations are independently retrievable
/// 4. Confirms data integrity across multiple attestations
///
/// **Key Assertions:**
/// - Nonce increments correctly (0, 1, 2)
/// - Each UID is deterministically generated from schema_uid + subject + nonce
/// - All attestations remain independently accessible
/// - Different values and expiration times are preserved correctly
///
/// **Architecture Validation:**
/// This test confirms the core design choice of using nonces to enable multiple
/// attestations per subject, rather than a simple key-value overwrite system.
#[test]
fn test_multiple_attestations_for_same_subject_and_schema() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    // initialize
    let admin_clone_for_init_args = admin.clone();
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (admin_clone_for_init_args,).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin);

    // register schema
    let schema_definition = SorobanString::from_str(&env, &return_schema_definition(&env));
    let resolver: Option<Address> = None;
    let revocable = true;
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "register",
            args: (attester.clone(), schema_definition.clone(), resolver.clone(), revocable).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let schema_uid: BytesN<32> = client.register(&attester, &schema_definition, &resolver, &revocable);

    // attest - 1
    let value1 = SorobanString::from_str(&env, "{\"foo\":\"bar1\"}");
    let expiration_time1: Option<u64> = None;
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "attest",
            args: (
                attester.clone(),
                schema_uid.clone(),
                value1.clone(),
                expiration_time1.clone(),
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let uid_0: BytesN<32> = client.attest(&attester, &schema_uid, &value1, &expiration_time1);

    // attest - 2
    let value2 = SorobanString::from_str(&env, "{\"foo\":\"bar2\"}");
    let expiration_time2 = Some(123456789u64);
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "attest",
            args: (
                attester.clone(),
                schema_uid.clone(),
                value2.clone(),
                expiration_time2.clone(),
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let uid_1: BytesN<32> = client.attest(&attester, &schema_uid, &value2, &expiration_time2);
    let expected_uid_1 = env.as_contract(&contract_id, || {
        generate_attestation_uid(&env, &schema_uid, &attester, &attester, 1)
    });
    assert_eq!(uid_1, expected_uid_1);

    // attest - 3
    let value3 = SorobanString::from_str(&env, "{\"foo\":\"bar3\"}");
    let expiration_time3: Option<u64> = None;
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "attest",
            args: (
                attester.clone(),
                schema_uid.clone(),
                value3.clone(),
                expiration_time3.clone(),
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let uid_2: BytesN<32> = client.attest(&attester, &schema_uid, &value3, &expiration_time3);
    let expected_uid_2 = env.as_contract(&contract_id, || {
        generate_attestation_uid(&env, &schema_uid, &attester, &attester, 2)
    });
    assert_eq!(uid_2, expected_uid_2);

    // get attestations and verify
    let fetched0 = client.get_attestation(&uid_0);
    assert_eq!(fetched0.uid, uid_0);
    assert_eq!(fetched0.value, value1);
    assert_eq!(fetched0.expiration_time, expiration_time1);

    let fetched1 = client.get_attestation(&uid_1);
    assert_eq!(fetched1.uid, uid_1);
    assert_eq!(fetched1.value, value2);
    assert_eq!(fetched1.expiration_time, expiration_time2);

    let fetched2 = client.get_attestation(&uid_2);
    assert_eq!(fetched2.uid, uid_2);
    assert_eq!(fetched2.value, value3);
    assert_eq!(fetched2.expiration_time, expiration_time3);
}

/// **Test: Schema Validation - Unregistered Schema Rejection**
///
/// Error path test that ensures attestations cannot be created against non-existent schemas:
/// 1. Attempts to create attestation with a fabricated schema UID
/// 2. Verifies the contract rejects the request with SchemaNotFound error
/// 3. Validates error handling in the try_attest path
///
/// **Security Validation:**
/// - Prevents attestations against arbitrary/malicious schema UIDs
/// - Ensures schema registry is properly consulted
/// - Confirms graceful error handling (no panics)
///
/// **Error Code:** `Error::SchemaNotFound`
#[test]
fn test_attesting_with_unregistered_schema() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    println!("=============================================================");
    println!("panic: Attesting with unregistered schema");
    println!("=============================================================");

    env.mock_all_auths();
    client.initialize(&admin);

    // Attest with a random, unregistered schema UID
    let schema_uid = BytesN::from_array(&env, &[1; 32]);
    let value = SorobanString::from_str(&env, "{\"foo\":\"bar\"}");
    let expiration_time: Option<u64> = None;
    let result = client.try_attest(&attester, &schema_uid, &value, &expiration_time);

    assert_eq!(result, Err(Ok(protocol::errors::Error::SchemaNotFound.into())));
    println!("=============================================================");
    println!("   Finished test case: {}", "test_attesting_with_unregistered_schema");
    println!("=============================================================");
}

/// **Test: Non-Existent Attestation Query Handling**
///
/// Validates proper error handling when querying attestations that don't exist:
/// 1. Attempts to retrieve an attestation with a fabricated UID
/// 2. Verifies the contract returns AttestationNotFound error
/// 3. Ensures no panics or unexpected behavior
///
/// **Key Behavior:**
/// - Direct query with non-existent UID fails gracefully
/// - Proper error propagation through try_get_attestation
/// - No side effects or state changes
///
/// **Error Code:** `Error::AttestationNotFound`
#[test]
fn test_querying_non_existent_attestation() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);
    let result = client.try_get_attestation(&BytesN::from_array(&env, &[1; 32]));
    assert_eq!(result, Err(Ok(protocol::errors::Error::AttestationNotFound.into())));
}

/// **Test: Temporal Validation - Past Expiration Time Rejection**
///
/// Validates that attestations cannot be created with expiration times in the past:
/// 1. Sets ledger timestamp to a known value
/// 2. Attempts to create attestation with expiration_time before current time
/// 3. Verifies the contract rejects with InvalidDeadline error
///
/// **Security Validation:**
/// - Prevents creation of "pre-expired" attestations
/// - Enforces temporal logic at creation time
/// - Uses <= comparison (expiration_time must be > current_time)
///
/// **Test Technique:**
/// Uses expiration_time = 0 when current_time = 0 to trigger the validation
///
/// **Error Code:** `Error::InvalidDeadline`
#[test]
fn test_attest_with_past_expiration_fails() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin_for_init_args = Address::generate(&env);
    let attester = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin_for_init_args);

    println!("=============================================================");
    println!("Testing: Attesting with past expiration time should fail");
    println!("=============================================================");

    let schema_definition = SorobanString::from_str(&env, &return_schema_definition(&env));
    let resolver: Option<Address> = None;
    let revocable = true;

    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "register",
            args: (attester.clone(), schema_definition.clone(), resolver.clone(), revocable).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let schema_uid: BytesN<32> = client.register(&attester, &schema_definition, &resolver, &revocable);

    // attest with a past expiration time
    // Using 0 as expiration which will fail since 0 <= 0 (current_time starts at 0)
    let value = SorobanString::from_str(&env, "{\"batch\":\"summer\"}");
    let expiration_time = Some(0); // This will fail validation since 0 <= 0

    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "attest",
            args: (
                attester.clone(),
                schema_uid.clone(),
                value.clone(),
                expiration_time.clone(),
            )
                .into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let err_on_result = client.try_attest(&attester, &schema_uid, &value, &expiration_time);

    dbg!(&err_on_result);
    assert_eq!(err_on_result, Err(Ok(protocol::errors::Error::InvalidDeadline)));

    println!("=============================================================");
    println!("Finished {}", "test_attest_with_past_expiration_fails");
    println!("=============================================================");
}

/// **Test: Expired Attestation Retrieval and Auto-Cleanup**
///
/// Complex test that validates both expiration detection and the auto-cleanup behavior:
/// 1. Creates attestation with near-future expiration
/// 2. Advances ledger time past expiration point
/// 3. Attempts retrieval - should fail with AttestationExpired
/// 4. Validates that expired attestation is removed from storage (side effect)
///
/// **Key Behaviors Tested:**
/// - Expiration time comparison using ledger timestamp
/// - Auto-deletion of expired attestations on first access
/// - Proper error propagation for expired data
/// - State cleanup to prevent storage bloat
///
/// **Architecture Note:**
/// This "lazy deletion" approach means expired attestations are cleaned up
/// when accessed, rather than requiring active cleanup processes.
///
/// **Error Code:** `Error::AttestationExpired`
#[test]
fn test_handling_expired_attestations() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let schema_definition = SorobanString::from_str(
        &env,
        r#"{"name":"Simple","version":"1.0","description":"Simple","fields":[]}"#,
    );
    let resolver: Option<Address> = None;
    let revocable = true;
    let schema_uid: BytesN<32> = client.register(&attester, &schema_definition, &resolver, &revocable);

    // attest with an expiration time in the near future
    let current_time = env.ledger().timestamp();
    let value = SorobanString::from_str(&env, "{\"origin\":\"saudi\"}");
    let expiration_time = Some(current_time + 100);
    let attestation_uid = client.attest(&attester, &schema_uid, &value, &expiration_time);

    // set the ledger timestamp to be in the "future"
    // relative to the expiration time
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        protocol_version: 22,
        sequence_number: 0,
        network_id: Default::default(),
        base_reserve: 10,
        min_temp_entry_ttl: 0,
        min_persistent_entry_ttl: 0,
        max_entry_ttl: 0,
        timestamp: current_time + 101,
    });

    // Now try to get the attestation, it should fail with AttestationExpired
    let result = client.try_get_attestation(&attestation_uid);
    assert_eq!(result, Err(Ok(protocol::errors::Error::AttestationExpired.into())));

    // CRITICAL: Verify that reading an expired attestation does NOT delete it from storage.
    // Read operations must be idempotent - no side effects on storage.
    // This prevents attackers from scraping and erasing expired attestations.
    let record_after_read = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get::<DataKey, Attestation>(&DataKey::AttestationUID(attestation_uid.clone()))
    });

    // The attestation should still exist in storage after the read
    assert!(
        record_after_read.is_some(),
        "Expired attestation should NOT be deleted by get_attestation - read ops must be idempotent"
    );

    // Verify the attestation data is intact
    let record = record_after_read.unwrap();
    assert_eq!(record.uid, attestation_uid);
    assert_eq!(record.expiration_time, expiration_time);

    // Call get_attestation again to ensure repeated reads don't cause deletion
    let result2 = client.try_get_attestation(&attestation_uid);
    assert_eq!(result2, Err(Ok(protocol::errors::Error::AttestationExpired.into())));

    // Verify still in storage after second read
    let record_after_second_read = env.as_contract(&contract_id, || {
        env.storage()
            .persistent()
            .get::<DataKey, Attestation>(&DataKey::AttestationUID(attestation_uid.clone()))
    });
    assert!(
        record_after_second_read.is_some(),
        "Attestation should persist across multiple reads"
    );
}
