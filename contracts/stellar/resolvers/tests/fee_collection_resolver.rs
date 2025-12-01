#![cfg(test)]
extern crate std;

use soroban_sdk::{
    testutils::{Address as _, BytesN as _, Ledger, LedgerInfo},
    token, Address, Bytes, BytesN, Env, String as SorobanString,
};

use resolvers::fee_collection::FeeCollectionResolverClient;
use resolvers::{FeeCollectionResolver, ResolverAttestationData, ResolverError, ResolverType};

const FEE_AMOUNT: i128 = 50;

fn create_token_contract<'a>(
    env: &Env,
    admin: &Address,
) -> (Address, token::Client<'a>, token::StellarAssetClient<'a>) {
    let token_contract = env.register_stellar_asset_contract_v2(admin.clone());
    let token_address = token_contract.address();
    let client = token::Client::new(env, &token_address);
    let admin_client = token::StellarAssetClient::new(env, &token_address);
    (token_address, client, admin_client)
}

fn setup<'a>() -> (
    Env,
    Address,
    Address,
    token::Client<'a>,
    token::StellarAssetClient<'a>,
    Address,
    FeeCollectionResolverClient<'a>,
) {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set(LedgerInfo {
        timestamp: 0,
        protocol_version: 22,
        sequence_number: 1,
        network_id: Default::default(),
        base_reserve: 1,
        min_temp_entry_ttl: 16 * 60 * 60 * 24,
        min_persistent_entry_ttl: 30 * 60 * 60 * 24,
        max_entry_ttl: 365 * 60 * 60 * 24,
    });

    let admin = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    let (token_address, token_client, token_admin_client) = create_token_contract(&env, &admin);

    // Use constructor args - this prevents front-running attacks
    let resolver_address = env.register(
        FeeCollectionResolver,
        (&admin, &token_address, &FEE_AMOUNT, &fee_recipient),
    );
    let resolver_client = FeeCollectionResolverClient::new(&env, &resolver_address);

    (
        env,
        admin,
        fee_recipient,
        token_client,
        token_admin_client,
        resolver_address,
        resolver_client,
    )
}

fn build_attestation(env: &Env, attester: &Address) -> ResolverAttestationData {
    ResolverAttestationData {
        uid: BytesN::random(env),
        schema_uid: BytesN::random(env),
        recipient: Address::generate(env),
        attester: attester.clone(),
        time: env.ledger().timestamp(),
        expiration_time: 0,
        revocation_time: 0,
        revocable: true,
        ref_uid: Bytes::new(env),
        data: Bytes::new(env),
        value: 0,
    }
}

#[test]
fn test_fee_collected_on_attest() {
    let (env, _admin, fee_recipient, token_client, token_admin_client, resolver_address, resolver_client) = setup();
    let attester = Address::generate(&env);
    token_admin_client.mint(&attester, &FEE_AMOUNT);

    let attestation = build_attestation(&env, &attester);
    assert!(resolver_client.onattest(&attestation));
    // If this line panics with `Error(Auth, InvalidAction)`:
    // ISSUE: onattest lacks attester.require_auth before token transfer
    // RECOMMENDATION: call attester.require_auth() prior to token_client.transfer
    // IMPACT: Fee collection fails because attester authorization isn't recorded

    // Verify transfer to resolver contract
    assert_eq!(token_client.balance(&resolver_address), FEE_AMOUNT);
    // Verify accounting
    assert_eq!(resolver_client.get_total_collected(), FEE_AMOUNT);
    assert_eq!(resolver_client.get_collected_fees(&fee_recipient), FEE_AMOUNT);
}

#[test]
fn test_withdraw_fees_requires_recipient_auth() {
    let (env, _admin, fee_recipient, token_client, token_admin_client, resolver_address, resolver_client) = setup();
    let attester = Address::generate(&env);
    token_admin_client.mint(&attester, &FEE_AMOUNT);
    let attestation = build_attestation(&env, &attester);
    assert!(resolver_client.onattest(&attestation));
    // If this line panics with `Error(Auth, InvalidAction)`:
    // ISSUE: attester authorization is missing for token transfer
    // RECOMMENDATION: require attester auth in onattest
    // IMPACT: Fees cannot be collected, preventing withdrawals

    // Unauthorized withdraw attempt
    let attacker = Address::generate(&env);
    let res = resolver_client.try_withdraw_fees(&attacker);
    // If this assertion fails:
    // ISSUE: withdraw_fees missing recipient auth check
    // RECOMMENDATION: verify require_auth and recipient equality logic
    // IMPACT: Anyone could withdraw collected fees
    assert!(matches!(res.err().unwrap(), Ok(ResolverError::NotAuthorized)));

    // Authorized withdrawal by fee recipient
    resolver_client.withdraw_fees(&fee_recipient);
    assert_eq!(token_client.balance(&fee_recipient), FEE_AMOUNT);
    assert_eq!(resolver_client.get_collected_fees(&fee_recipient), 0);
    assert_eq!(token_client.balance(&resolver_address), 0);
}

#[test]
fn test_non_admin_cannot_update_fee() {
    let (env, _admin, _fee_recipient, _token_client, _token_admin_client, _resolver_address, resolver_client) = setup();
    let attacker = Address::generate(&env);
    let res = resolver_client.try_set_attestation_fee(&attacker, &25);
    // If this assertion fails:
    // ISSUE: set_attestation_fee missing admin check
    // RECOMMENDATION: enforce require_admin in set_attestation_fee
    // IMPACT: Unauthorized users could manipulate fees
    assert!(matches!(res.err().unwrap(), Ok(ResolverError::NotAuthorized)));
}

#[test]
fn test_initialize_twice_fails() {
    let (env, admin, fee_recipient, _token_client, _token_admin_client, _resolver_address, resolver_client) = setup();
    let token_address = env.register_stellar_asset_contract_v2(admin.clone()).address();
    let res = resolver_client.try_initialize(&admin, &token_address, &FEE_AMOUNT, &fee_recipient);
    // If this assertion fails:
    // ISSUE: initialize allows re-initialization, risking state corruption
    // RECOMMENDATION: guard with Initialized flag
    // IMPACT: Admin could inadvertently overwrite configuration
    assert!(matches!(res.err().unwrap(), Ok(ResolverError::CustomError)));
}

#[test]
fn test_metadata() {
    let (env, _admin, _fee_recipient, _token_client, _token_admin_client, _resolver_address, resolver_client) = setup();
    let meta = resolver_client.metadata();
    assert_eq!(meta.name, SorobanString::from_str(&env, "Fee Collection Resolver"));
    assert_eq!(meta.resolver_type, ResolverType::FeeCollection);
}

#[test]
#[should_panic(expected = "attestation_fee must be non-negative")]
fn test_negative_fee_in_constructor_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set(LedgerInfo {
        timestamp: 0,
        protocol_version: 22,
        sequence_number: 1,
        network_id: Default::default(),
        base_reserve: 1,
        min_temp_entry_ttl: 16 * 60 * 60 * 24,
        min_persistent_entry_ttl: 30 * 60 * 60 * 24,
        max_entry_ttl: 365 * 60 * 60 * 24,
    });

    let admin = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    let (token_address, _token_client, _token_admin_client) = create_token_contract(&env, &admin);

    // Attempt to deploy with negative fee should panic
    let _resolver_address = env.register(
        FeeCollectionResolver,
        (&admin, &token_address, &-100i128, &fee_recipient),
    );
}

#[test]
fn test_negative_fee_in_set_attestation_fee_rejected() {
    let (_env, admin, _fee_recipient, _token_client, _token_admin_client, _resolver_address, resolver_client) = setup();

    // Attempt to set negative fee should fail
    let result = resolver_client.try_set_attestation_fee(&admin, &-50);
    assert!(matches!(result.err().unwrap(), Ok(ResolverError::ValidationFailed)));
}

#[test]
#[should_panic(expected = "HostError: Error(Context, InvalidAction)")]
fn test_invalid_token_address_in_constructor_rejected() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set(LedgerInfo {
        timestamp: 0,
        protocol_version: 22,
        sequence_number: 1,
        network_id: Default::default(),
        base_reserve: 1,
        min_temp_entry_ttl: 16 * 60 * 60 * 24,
        min_persistent_entry_ttl: 30 * 60 * 60 * 24,
        max_entry_ttl: 365 * 60 * 60 * 24,
    });

    let admin = Address::generate(&env);
    let fee_recipient = Address::generate(&env);
    // Use a random address that is NOT a token contract
    let invalid_token_address = Address::generate(&env);

    // Attempt to deploy with invalid token address should panic
    let _resolver_address = env.register(
        FeeCollectionResolver,
        (&admin, &invalid_token_address, &FEE_AMOUNT, &fee_recipient),
    );
}
