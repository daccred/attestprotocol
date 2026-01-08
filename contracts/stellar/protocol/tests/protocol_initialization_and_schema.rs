use protocol::{errors::Error, state::Schema, utils::create_xdr_string, AttestationContract, AttestationContractClient};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, MockAuth, MockAuthInvoke},
    Address, BytesN, Env, IntoVal, String as SorobanString, TryIntoVal,
};

struct SchemaRegistrationParams {
    name: &'static str,
    schema_definition: String,
    resolver: Option<Address>,
    revocable: bool,
}

/*
 * Comprehensive test for contract initialization and schema registration
 *
 * This test validates the complete workflow of:
 * 1. Contract initialization with proper admin setup and authentication
 * 2. Schema registration with various configurations (JSON and XDR formats)
 * 3. Event emission verification for schema registration operations
 * 4. Support for optional resolver addresses and revocability settings
 *
 * Test cases cover:
 * - Simple JSON schema with basic revocable configuration
 * - XDR-encoded schema with resolver integration and permanent attestations
 *
 * Each test case verifies:
 * - Successful schema registration and UID generation
 * - Correct event emission with proper topics and data structure
 * - Event data integrity (schema UID and authority address matching)
 */
#[test]
fn initialize_and_register_schema() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

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

    let test_cases = [
		SchemaRegistrationParams {
			name: "schema_with_revocable",
			schema_definition: r#"{"name":"Degree","version":"1.0","description":"University degree","fields":[{"name":"degree","type":"string"}]}"#.to_string(),
			resolver: None,
			revocable: true,
		},
		SchemaRegistrationParams {
			name: "schema_xdr_with_revocable",
			schema_definition: format!(
				"{}{}",
				"XDR:",
				create_xdr_string(
					&env,
					&SorobanString::from_str(&env, r#"{"name":"Certificate","version":"1.5","description":"Revocable_Certificate_Schema","fields":[{"name":"certificate_type","type":"string"},{"name":"issued_date","type":"number"}]}"#),
				).to_string()
			),
			resolver: None,
			revocable: true,
		},
	];

    for case in test_cases {
        println!("\n\n");
        println!("=============================================================");
        println!("      Running test case: {}", case.name);
        println!("=============================================================");
        let authority = Address::generate(&env);
        // register schema
        let schema_definition = SorobanString::from_str(&env, &case.schema_definition);
        env.mock_auths(&[MockAuth {
            address: &authority,
            invoke: &MockAuthInvoke {
                contract: &contract_id,
                fn_name: "register",
                args: (
                    authority.clone(),
                    schema_definition.clone(),
                    case.resolver.clone(),
                    case.revocable,
                )
                    .into_val(&env),
                sub_invokes: &[],
            },
        }]);
        let schema_uid: BytesN<32> = client.register(&authority, &schema_definition, &case.resolver, &case.revocable);

        let events = env.events().all();
        dbg!(&events);
        let last = events.last().unwrap();
        dbg!(&last);
        assert_eq!(last.0, contract_id);
        let expected_topics = (symbol_short!("SCHEMA"), symbol_short!("REGISTER")).into_val(&env);
        dbg!(&expected_topics);
        assert_eq!(last.1, expected_topics);
        let event_data: (BytesN<32>, Schema, Address) = last.2.try_into_val(&env).unwrap();
        println!(
            "Event data: schema_uid={:?}, schema={:?}",
            event_data.0, event_data.1.definition
        );
        assert_eq!(event_data.0, schema_uid);
        assert_eq!(event_data.1.authority, authority);
        assert_eq!(event_data.1.definition, schema_definition);
        assert_eq!(event_data.1.resolver, case.resolver);
        assert_eq!(event_data.1.revocable, case.revocable);
    }
}

/// Test that registering an identical schema (same definition, authority, resolver)
/// returns SchemaAlreadyExists error to prevent accidental overwrites and detect collisions.
#[test]
fn test_duplicate_schema_registration_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let authority = Address::generate(&env);

    // Initialize contract
    client.initialize(&admin);

    // Define a schema
    let schema_definition = SorobanString::from_str(
        &env,
        r#"{"name":"Degree","version":"1.0","description":"University degree","fields":[{"name":"degree","type":"string"}]}"#,
    );

    // First registration should succeed
    let _schema_uid = client.register(&authority, &schema_definition, &None, &true);

    // Second registration with identical parameters should fail with SchemaAlreadyExists
    let result = client.try_register(&authority, &schema_definition, &None, &true);
    assert!(result.is_err());
    assert_eq!(result.err().unwrap(), Ok(Error::SchemaAlreadyExists));
}

/// Test that the same schema definition with different authorities produces different UIDs
/// and both registrations succeed (no collision).
#[test]
fn test_same_definition_different_authority_succeeds() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let authority1 = Address::generate(&env);
    let authority2 = Address::generate(&env);

    client.initialize(&admin);

    let schema_definition = SorobanString::from_str(
        &env,
        r#"{"name":"Certificate","version":"1.0","fields":[{"name":"type","type":"string"}]}"#,
    );

    // Both registrations should succeed because they have different authorities
    let uid1 = client.register(&authority1, &schema_definition, &None, &true);
    let uid2 = client.register(&authority2, &schema_definition, &None, &true);

    // UIDs should be different since authority is part of the hash input
    assert_ne!(uid1, uid2);
}

// ══════════════════════════════════════════════════════════════════════════════
// ► Schema Registration DoS Protection Tests
// ══════════════════════════════════════════════════════════════════════════════

/// Test that schema registration is limited per address to prevent DoS attacks.
/// Each address can only register up to max_schemas_per_address schemas.
#[test]
fn test_schema_quota_exceeded() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let authority = Address::generate(&env);

    client.initialize(&admin);

    // Set a low quota for testing (3 schemas per address)
    client.set_schema_config(&admin, &3, &4096);

    // Register 3 schemas (should succeed)
    for i in 0..3 {
        let schema_def = SorobanString::from_str(&env, &format!(r#"{{"name":"Schema{}","version":"1.0"}}"#, i));
        let _uid = client.register(&authority, &schema_def, &None, &true);
    }

    // Verify schema count
    let count = client.get_schema_count(&authority);
    assert_eq!(count, 3);

    // 4th schema should fail with SchemaQuotaExceeded
    let schema_def = SorobanString::from_str(&env, r#"{"name":"Schema4","version":"1.0"}"#);
    let result = client.try_register(&authority, &schema_def, &None, &true);
    assert!(result.is_err());
    assert_eq!(result.err().unwrap(), Ok(Error::SchemaQuotaExceeded));
}

/// Test that schema definitions exceeding the size limit are rejected.
#[test]
fn test_schema_definition_too_large() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let authority = Address::generate(&env);

    client.initialize(&admin);

    // Set a small definition size limit for testing (100 bytes)
    client.set_schema_config(&admin, &10, &100);

    // Try to register a schema with definition larger than limit
    let large_definition = "x".repeat(150); // 150 bytes, exceeds 100 byte limit
    let schema_def = SorobanString::from_str(&env, &large_definition);
    let result = client.try_register(&authority, &schema_def, &None, &true);
    assert!(result.is_err());
    assert_eq!(result.err().unwrap(), Ok(Error::SchemaDefinitionTooLarge));
}

/// Test that admin can configure schema registration limits.
#[test]
fn test_admin_can_set_schema_config() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);

    client.initialize(&admin);

    // Get default config
    let config = client.get_schema_config();
    assert_eq!(config.max_schemas_per_address, 10);
    assert_eq!(config.max_definition_size, 4096);

    // Admin sets new config
    client.set_schema_config(&admin, &5, &2048);

    // Verify config was updated
    let config = client.get_schema_config();
    assert_eq!(config.max_schemas_per_address, 5);
    assert_eq!(config.max_definition_size, 2048);
}

/// Test that non-admin cannot set schema config.
#[test]
fn test_non_admin_cannot_set_schema_config() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);

    client.initialize(&admin);

    // Non-admin tries to set config
    let result = client.try_set_schema_config(&non_admin, &5, &2048);
    assert!(result.is_err());
    assert_eq!(result.err().unwrap(), Ok(Error::NotAuthorized));
}

/// Test that different addresses have independent schema quotas.
#[test]
fn test_independent_address_quotas() {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let authority1 = Address::generate(&env);
    let authority2 = Address::generate(&env);

    client.initialize(&admin);

    // Set quota to 2 schemas per address
    client.set_schema_config(&admin, &2, &4096);

    // Authority1 registers 2 schemas
    for i in 0..2 {
        let schema_def = SorobanString::from_str(&env, &format!(r#"{{"name":"Auth1Schema{}"}}"#, i));
        let _uid = client.register(&authority1, &schema_def, &None, &true);
    }

    // Authority1 is at quota
    assert_eq!(client.get_schema_count(&authority1), 2);

    // Authority2 should still be able to register (independent quota)
    let schema_def = SorobanString::from_str(&env, r#"{"name":"Auth2Schema1"}"#);
    let result = client.try_register(&authority2, &schema_def, &None, &true);
    assert!(result.is_ok());
    assert_eq!(client.get_schema_count(&authority2), 1);
}
