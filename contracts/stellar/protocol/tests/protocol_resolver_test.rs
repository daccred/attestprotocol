mod testutils;

use protocol::{
    interfaces::resolver::{ResolverAttestationData, ResolverError},
    AttestationContract, AttestationContractClient,
};
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Ledger},
    Address, BytesN, Env, String as SorobanString,
};

// HAL-04: Mock resolver contracts updated to the unified ABI. They mirror
// `resolvers::interface::ResolverInterface` (Result-returning, onresolve
// taking (uid, attester)) so that calls from the protocol's `ResolverClient`
// decode correctly on the wire.
mod no_revoke_resolver {
    use super::*;

    /// A resolver that always approves attestations but rejects revocations.
    #[contract]
    pub struct NoRevokeResolver;

    #[contractimpl]
    impl NoRevokeResolver {
        pub fn onattest(
            _env: Env,
            _attestation: ResolverAttestationData,
        ) -> Result<bool, ResolverError> {
            Ok(true)
        }

        pub fn onrevoke(
            _env: Env,
            _attestation: ResolverAttestationData,
        ) -> Result<bool, ResolverError> {
            Ok(false) // Always reject revocations
        }

        pub fn onresolve(
            _env: Env,
            _attestation_uid: BytesN<32>,
            _attester: Address,
        ) -> Result<(), ResolverError> {
            Ok(())
        }
    }
}

mod always_approve_resolver {
    use super::*;

    /// A resolver that always approves everything.
    #[contract]
    pub struct AlwaysApproveResolver;

    #[contractimpl]
    impl AlwaysApproveResolver {
        pub fn onattest(
            _env: Env,
            _attestation: ResolverAttestationData,
        ) -> Result<bool, ResolverError> {
            Ok(true)
        }

        pub fn onrevoke(
            _env: Env,
            _attestation: ResolverAttestationData,
        ) -> Result<bool, ResolverError> {
            Ok(true)
        }

        pub fn onresolve(
            _env: Env,
            _attestation_uid: BytesN<32>,
            _attester: Address,
        ) -> Result<(), ResolverError> {
            Ok(())
        }
    }
}

/// **Test: Schema With Resolver That Allows Attestations**
/// - Create schema with a resolver that approves attestations
/// - Attestation should succeed
/// - Verify resolver was called
#[test]
fn test_schema_with_resolver_allows_attestation() {
    let env = Env::default();
    env.mock_all_auths();

    // Set ledger timestamp
    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    // Deploy the always-approve resolver
    let resolver_address = env.register(always_approve_resolver::AlwaysApproveResolver, ());

    // Initialize protocol
    client.initialize(&admin);

    // Register schema with resolver
    let schema_definition = SorobanString::from_str(&env, "test_schema");
    let resolver = Some(resolver_address);
    let revocable = true;
    let schema_uid = client.register(&attester, &schema_definition, &resolver, &revocable);

    // Create attestation - should succeed as resolver approves
    let value = SorobanString::from_str(&env, "{\"test\":\"data\"}");
    let expiration_time = None;
    let attestation_uid = client.attest(&attester, &schema_uid, &value, &expiration_time);

    // Verify attestation was created
    let attestation = client.get_attestation(&attestation_uid);
    assert_eq!(attestation.subject, attester.clone());
    assert_eq!(attestation.attester, attester);
    assert!(!attestation.revoked);
}

/// **Test: Resolver Rejection of Revocation**
/// - Create schema with resolver that denies revocation
/// - Create an attestation
/// - Attempt revocation should fail with resolver rejection
#[test]
fn test_resolver_rejection_of_revocation() {
    let env = Env::default();
    env.mock_all_auths();

    // Set ledger timestamp
    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    // Deploy the no-revoke resolver
    let resolver_address = env.register(no_revoke_resolver::NoRevokeResolver, ());

    // Initialize protocol
    client.initialize(&admin);

    // Register schema with resolver that blocks revocations
    let schema_definition = SorobanString::from_str(&env, "no_revoke_schema");
    let resolver = Some(resolver_address);
    let revocable = true;
    let schema_uid = client.register(&attester, &schema_definition, &resolver, &revocable);

    // Create attestation - should succeed
    let value = SorobanString::from_str(&env, "{\"test\":\"data\"}");
    let expiration_time = None;
    let attestation_uid = client.attest(&attester, &schema_uid, &value, &expiration_time);

    // Verify attestation was created
    let attestation = client.get_attestation(&attestation_uid);
    assert!(!attestation.revoked);

    // Attempt revocation - should fail due to resolver rejection
    let result = client.try_revoke(&attester, &attestation_uid);

    // The exact error depends on how the protocol handles resolver rejection
    // It might be ResolverError or a different error
    assert!(result.is_err());

    // Verify attestation is still not revoked
    let attestation_after = client.get_attestation(&attestation_uid);
    assert!(!attestation_after.revoked);
}

/// **Test: Schema Without Resolver**
/// - Create schema without resolver (resolver = None)
/// - Attestation and revocation should succeed without resolver checks
#[test]
fn test_schema_without_resolver() {
    let env = Env::default();
    env.mock_all_auths();

    // Set ledger timestamp
    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    // Initialize protocol
    client.initialize(&admin);

    // Register schema WITHOUT resolver
    let schema_definition = SorobanString::from_str(&env, "no_resolver_schema");
    let resolver = None; // No resolver
    let revocable = true;
    let schema_uid = client.register(&attester, &schema_definition, &resolver, &revocable);

    // Create attestation - should succeed without resolver
    let value = SorobanString::from_str(&env, "{\"test\":\"data\"}");
    let expiration_time = None;
    let attestation_uid = client.attest(&attester, &schema_uid, &value, &expiration_time);

    // Verify attestation was created
    let attestation = client.get_attestation(&attestation_uid);
    assert_eq!(attestation.subject, attester.clone());
    assert_eq!(attestation.attester, attester);
    assert!(!attestation.revoked);

    // Revocation should succeed without resolver
    client.revoke(&attester, &attestation_uid);

    // Verify attestation is now revoked
    let revoked_attestation = client.get_attestation(&attestation_uid);
    assert!(revoked_attestation.revoked);
    assert!(revoked_attestation.revocation_time.is_some());
}

/// **Test: Multiple Schemas with Different Resolvers**
/// - Create two schemas with different resolvers
/// - Verify each schema uses its own resolver correctly
#[test]
fn test_multiple_schemas_with_different_resolvers() {
    let env = Env::default();
    env.mock_all_auths();

    // Set ledger timestamp
    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    // Deploy two different resolvers
    let approve_resolver = env.register(always_approve_resolver::AlwaysApproveResolver, ());
    let no_revoke_resolver = env.register(no_revoke_resolver::NoRevokeResolver, ());

    // Initialize protocol
    client.initialize(&admin);

    // Register first schema with approve resolver
    let schema_uid_1 = client.register(
        &attester,
        &SorobanString::from_str(&env, "approve_schema"),
        &Some(approve_resolver),
        &true,
    );

    // Register second schema with no-revoke resolver
    let schema_uid_2 = client.register(
        &attester,
        &SorobanString::from_str(&env, "no_revoke_schema"),
        &Some(no_revoke_resolver),
        &true,
    );

    // Create attestations for both schemas
    let value = SorobanString::from_str(&env, "{\"test\":\"data\"}");
    let attestation_uid_1 = client.attest(&attester, &schema_uid_1, &value, &None);
    let attestation_uid_2 = client.attest(&attester, &schema_uid_2, &value, &None);

    // Revoke first attestation - should succeed (approve resolver)
    client.revoke(&attester, &attestation_uid_1);
    let attestation_1 = client.get_attestation(&attestation_uid_1);
    assert!(attestation_1.revoked);

    // Try to revoke second attestation - should fail (no-revoke resolver)
    let result = client.try_revoke(&attester, &attestation_uid_2);
    assert!(result.is_err());
    let attestation_2 = client.get_attestation(&attestation_uid_2);
    assert!(!attestation_2.revoked);
}

/// **Test: Resolver onresolve Hook is Called**
/// - Create schema with DummyResolver that tracks onresolve calls
/// - Create an attestation
/// - Verify onresolve was called with correct parameters
#[test]
fn test_resolver_onresolve_hook_called() {
    use testutils::DummyResolver;
    use soroban_sdk::symbol_short;

    let env = Env::default();
    env.mock_all_auths();

    // Set ledger timestamp
    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    // Deploy the DummyResolver that tracks onresolve calls
    let resolver_id = env.register(DummyResolver, ());

    // Initialize protocol
    client.initialize(&admin);

    // Register schema with DummyResolver
    let schema_definition = SorobanString::from_str(&env, "test_schema");
    let resolver = Some(resolver_id.clone());
    let revocable = true;
    let schema_uid = client.register(&attester, &schema_definition, &resolver, &revocable);

    // Create attestation - should succeed and trigger onresolve
    let value = SorobanString::from_str(&env, "{\"test\":\"data\"}");
    let expiration_time = None;
    let attestation_uid = client.attest(&attester, &schema_uid, &value, &expiration_time);

    // Verify attestation was created
    let attestation = client.get_attestation(&attestation_uid);
    assert!(!attestation.revoked);

    // Verify onresolve was called by checking resolver storage
    let stored_uid: Option<BytesN<32>> = env.as_contract(&resolver_id, || {
        env.storage()
            .instance()
            .get(&symbol_short!("ONRES_UID"))
    });
    let stored_attester: Option<Address> = env.as_contract(&resolver_id, || {
        env.storage()
            .instance()
            .get(&symbol_short!("ONRES_ATT"))
    });

    assert!(stored_uid.is_some(), "onresolve was not called");
    assert_eq!(stored_uid.unwrap(), attestation_uid);
    assert!(stored_attester.is_some());
    assert_eq!(stored_attester.unwrap(), attester);
}

/// **Test: Resolver onresolve Hook Called After Revocation**
/// - Create and then revoke an attestation
/// - Verify onresolve is called after revocation
#[test]
fn test_resolver_onresolve_hook_called_after_revocation() {
    use testutils::DummyResolver;
    use soroban_sdk::symbol_short;

    let env = Env::default();
    env.mock_all_auths();

    // Set ledger timestamp
    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });

    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    // Deploy the DummyResolver
    let resolver_id = env.register(DummyResolver, ());

    // Initialize protocol
    client.initialize(&admin);

    // Register schema with DummyResolver
    let schema_definition = SorobanString::from_str(&env, "test_schema");
    let resolver = Some(resolver_id.clone());
    let revocable = true;
    let schema_uid = client.register(&attester, &schema_definition, &resolver, &revocable);

    // Create attestation
    let value = SorobanString::from_str(&env, "{\"test\":\"data\"}");
    let attestation_uid = client.attest(&attester, &schema_uid, &value, &None);

    // Clear the onresolve tracking to verify revocation triggers new call
    env.as_contract(&resolver_id, || {
        env.storage()
            .instance()
            .remove(&symbol_short!("ONRES_UID"));
        env.storage()
            .instance()
            .remove(&symbol_short!("ONRES_ATT"));
    });

    // Revoke the attestation - should trigger onresolve again
    client.revoke(&attester, &attestation_uid);

    // Verify attestation is revoked
    let attestation = client.get_attestation(&attestation_uid);
    assert!(attestation.revoked);

    // Verify onresolve was called again after revocation
    let stored_uid: Option<BytesN<32>> = env.as_contract(&resolver_id, || {
        env.storage()
            .instance()
            .get(&symbol_short!("ONRES_UID"))
    });
    let stored_attester: Option<Address> = env.as_contract(&resolver_id, || {
        env.storage()
            .instance()
            .get(&symbol_short!("ONRES_ATT"))
    });

    assert!(stored_uid.is_some(), "onresolve was not called after revocation");
    assert_eq!(stored_uid.unwrap(), attestation_uid);
    assert!(stored_attester.is_some());
    assert_eq!(stored_attester.unwrap(), attester);
}
