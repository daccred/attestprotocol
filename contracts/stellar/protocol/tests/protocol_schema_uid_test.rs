use protocol::{utils::generate_schema_uid, AttestationContract, AttestationContractClient};
use soroban_sdk::{
    testutils::Address as _,
    Address, Env, String as SorobanString,
};

/// **Test: C-CONTRACT-3 — Schema UID differs by `revocable` flag**
///
/// Pre-fix: `generate_schema_uid` hashed only `(definition, authority, resolver)`.
/// Two schemas that differ only in the `revocable` flag produced identical UIDs,
/// and the second registration was rejected by the `SchemaAlreadyExists` guard.
///
/// Post-fix: `revocable` is appended to the hash input as a single byte
/// (`0x01` for true, `0x00` for false), so the two registrations are distinct.
#[test]
fn test_c_contract3_schema_uid_differs_by_revocable_flag() {
    let env = Env::default();
    let authority = Address::generate(&env);
    let definition = SorobanString::from_str(&env, "test");
    let resolver: Option<Address> = None;

    let uid_revocable = generate_schema_uid(&env, &definition, &authority, &resolver, true);
    let uid_non_revocable = generate_schema_uid(&env, &definition, &authority, &resolver, false);

    assert_ne!(
        uid_revocable, uid_non_revocable,
        "C-CONTRACT-3: revocable flag must affect schema UID derivation"
    );
}

/// **Test: C-CONTRACT-3 — Same definition + different revocable = no collision on register**
///
/// Pre-fix: The second `register` call would fail with `SchemaAlreadyExists`
/// because the UID matched.
/// Post-fix: Both registrations succeed under distinct UIDs.
#[test]
fn test_c_contract3_registration_collision_blocked_for_same_definition_diff_revocable() {
    let env = Env::default();
    env.mock_all_auths();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let authority = Address::generate(&env);
    client.initialize(&admin);

    let definition = SorobanString::from_str(&env, "credX");
    let resolver: Option<Address> = None;

    let uid_a = client.register(&authority, &definition, &resolver, &false);
    let uid_b = client.register(&authority, &definition, &resolver, &true);

    assert_ne!(uid_a, uid_b, "C-CONTRACT-3: parallel revocable variants must coexist");

    let schema_a = client.get_schema(&uid_a);
    let schema_b = client.get_schema(&uid_b);
    assert_eq!(schema_a.revocable, false);
    assert_eq!(schema_b.revocable, true);
    assert_eq!(schema_a.definition, schema_b.definition);
    assert_eq!(schema_a.authority, schema_b.authority);
}

/// **Reference vector for the W5 SDK port (C-CONTRACT-3 schema UID).**
///
/// W5 must mirror the on-chain schema-UID formula. The SDK input is canonical
/// (definition string, authority address, optional resolver, revocable bool);
/// no contract address dependency. We print both the revocable=true and
/// revocable=false outputs so the SDK author can pin both.
#[test]
fn test_c_contract3_schema_uid_reference_vector_for_w5() {
    let env = Env::default();
    let authority = Address::generate(&env);
    let definition = SorobanString::from_str(&env, "ref-vector-schema");
    let resolver: Option<Address> = None;

    let uid_t = generate_schema_uid(&env, &definition, &authority, &resolver, true);
    let uid_f = generate_schema_uid(&env, &definition, &authority, &resolver, false);

    eprintln!("C-CONTRACT-3 W5_VECTOR_SCHEMA_UID");
    eprintln!("  authority         : {:?}", authority.to_string());
    eprintln!("  definition        : ref-vector-schema");
    eprintln!("  resolver          : None");
    eprintln!("  schema_uid_T (rev): {}", hex::encode(uid_t.to_array()));
    eprintln!("  schema_uid_F     : {}", hex::encode(uid_f.to_array()));

    assert_ne!(uid_t, uid_f);
}
