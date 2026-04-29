use protocol::{errors::Error, AttestationContract, AttestationContractClient};
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, MockAuth, MockAuthInvoke},
    Address, BytesN, Env, IntoVal, String as SorobanString, TryIntoVal,
};

/// **Test: Basic Revocation by Original Attester**
/// - Verifies successful revocation workflow
/// - Checks event emission and state updates
#[test]
fn revoke_by_nonce() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    println!("=============================================================");
    println!("      Running TC: {}", "revoke_by_nonce");
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
        r#"{"name":"Revocable","version":"1.0","description":"Revocable","fields":[]}"#,
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

    // create attestation
    let value = SorobanString::from_str(&env, "{\"k\":\"v\"}");
    let expiration_time = None;
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

    // revoke by attester
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "revoke",
            args: (attester.clone(), attestation_uid.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.revoke(&attester, &attestation_uid);

    // verify revocation event shape
    let events = env.events().all();
    let last = events.last().unwrap();
    assert_eq!(last.0, contract_id);
    let expected_topics = (symbol_short!("ATTEST"), symbol_short!("REVOKE")).into_val(&env);
    assert_eq!(last.1, expected_topics);
    let (attestation_uid_ev, _schema_uid_ev, subject_ev, attester_ev, revoked_ev, revocation_time_ev): (
        BytesN<32>,
        BytesN<32>,
        Address,
        Address,
        bool,
        Option<u64>,
    ) = last.2.try_into_val(&env).unwrap();
    assert_eq!(subject_ev, attester);
    assert_eq!(attester_ev, attester);
    assert_eq!(attestation_uid_ev, attestation_uid);
    assert_eq!(revoked_ev, true);
    assert!(revocation_time_ev.is_some());

    // verify state reflects revocation
    let fetched = client.get_attestation(&attestation_uid);
    dbg!(&fetched, "\n");
    assert!(fetched.revoked);
    assert!(fetched.revocation_time.is_some());

    println!("=============================================================");
    println!("      Finished: {}", "revoke_by_nonce");
    println!("=============================================================");
}

/// **Test: Unauthorized Revocation Attempt**
/// - A different attester tries to revoke someone else's attestation
/// - The subject of the attestation tries to revoke it
/// - All attempts should fail with Error::NotAuthorized
#[test]
fn test_revocation_by_unauthorized_parties() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);
    let unauthorized_user = Address::generate(&env);

    println!("=============================================================");
    println!(" Running TC: {}", "test_revocation_by_unauthorized_parties");
    println!("=============================================================");

    // initialize
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (admin.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin);

    // register schema
    let schema_definition = SorobanString::from_str(
        &env,
        r#"{"name":"Revocable","version":"1.0","description":"Revocable","fields":[]}"#,
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

    // create attestation
    let value = SorobanString::from_str(&env, "{\"k\":\"v\"}");
    let expiration_time = None;
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

    // 1. Attempt revocation by an unauthorized user
    env.mock_auths(&[MockAuth {
        address: &unauthorized_user,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "revoke",
            args: (unauthorized_user.clone(), attestation_uid.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let result_unauthorized = client.try_revoke(&unauthorized_user, &attestation_uid);
    dbg!(&result_unauthorized);
    assert_eq!(result_unauthorized, Err(Ok(Error::NotAuthorized.into())));
    assert!(env.events().all().is_empty());

    // 2. Attempt revocation by the subject (who is not the attester)
    // This should fail because only the attester can revoke.
    let subject_as_revoker = Address::generate(&env);
    env.mock_auths(&[MockAuth {
        address: &subject_as_revoker,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "revoke",
            args: (subject_as_revoker.clone(), attestation_uid.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let result_subject = client.try_revoke(&subject_as_revoker, &attestation_uid);
    assert_eq!(result_subject, Err(Ok(Error::NotAuthorized.into())));

    // 3. Attempt revocation by the admin
    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "revoke",
            args: (admin.clone(), attestation_uid.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let result_admin = client.try_revoke(&admin, &attestation_uid);
    assert_eq!(result_admin, Err(Ok(Error::NotAuthorized.into())));

    // verify no new events were emitted
    assert!(env.events().all().is_empty());

    // verify state has not changed
    let fetched = client.get_attestation(&attestation_uid);
    assert!(!fetched.revoked);

    println!("=============================================================");
    println!("Finished: {}", "test_revocation_by_unauthorized_parties");
    println!("=============================================================");
}

/// **Test: Revocation of Non-Revocable Schema Attestation**
/// - Create schema with revocable=false
/// - Attempt revocation should fail with Error::AttestationNotRevocable
#[test]
fn test_cannot_revoke_from_non_revocable_schema() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    println!("=============================================================");
    println!(" Running test case: {}", "____attestation_from_non_revo____");
    println!("=============================================================");

    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (admin.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin);

    let schema_definition = SorobanString::from_str(
        &env,
        r#"{"name":"Simple","version":"1.0","description":"Simple","fields":[]}"#,
    );
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

    let value = SorobanString::from_str(&env, "{\"origin\":\"saudi\"}");
    let expiration_time = None;
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
    let attestation_uid = client.attest(&attester, &schema_uid, &value, &expiration_time);

    let _initial_events_count = env.events().all().len();

    // Now try to revoke the attestation, it should fail with AttestationNotRevocable
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "revoke",
            args: (attester.clone(), attestation_uid.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let result = client.try_revoke(&attester, &attestation_uid);
    dbg!(&result);
    assert_eq!(result, Err(Ok(Error::AttestationNotRevocable.into())));

    assert!(env.events().all().is_empty());

    let fetched = client.get_attestation(&attestation_uid);
    assert!(!fetched.revoked);

    println!("=============================================================");
    println!("Finished: {}", "__revoke_from_non_revocable_schema");
    println!("=============================================================");
}

/// **Test: Double Revocation Prevention**
/// - Revoke an attestation successfully
/// - Attempt to revoke the same attestation again
/// - Should fail with `Error::AlreadyRevoked` (HAL-08). Pre-fix this returned
///   `AttestationNotFound`, which conflated terminal records with missing ones.
#[test]
fn test_double_revocation_fails() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    println!("=============================================================");
    println!(" Running test case: {}", "test_double_revocation_fails");
    println!("=============================================================");

    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (admin.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin);

    // register schema
    let schema_definition = SorobanString::from_str(
        &env,
        r#"{"name":"Revocable","version":"1.0","description":"Revocable","fields":[]}"#,
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

    // create attestation
    let value = SorobanString::from_str(&env, "{\"k\":\"v\"}");
    let expiration_time = None;
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

    // revoke for the first time
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "revoke",
            args: (attester.clone(), attestation_uid.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.revoke(&attester, &attestation_uid);

    let fetched = client.get_attestation(&attestation_uid);
    assert!(fetched.revoked);

    let events_after_first_revoke = env.events().all().len();

    // try to revoke again
    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "revoke",
            args: (attester.clone(), attestation_uid.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let result = client.try_revoke(&attester, &attestation_uid);
    dbg!(&result);
    assert_eq!(result, Err(Ok(Error::AlreadyRevoked.into())));

    // verify no new events were emitted
    assert_eq!(env.events().all().len(), events_after_first_revoke);

    // verify state is unchanged after failed second attempt
    let fetched_again = client.get_attestation(&attestation_uid);
    assert_eq!(fetched, fetched_again);

    println!("=============================================================");
    println!("      Finished: {}", "test_double_revocation_fails");
    println!("=============================================================");
}

/// **Test: Revocation of Non-Existent Attestation**
/// - Attempt to revoke with fabricated attestation_uid
/// - Should fail with Error::AttestationNotFound
#[test]
fn test_revoking_non_existent_attestation_fails() {
    let env = Env::default();
    let contract_id = env.register(AttestationContract {}, ());
    let client = AttestationContractClient::new(&env, &contract_id);
    let admin = Address::generate(&env);
    let attester = Address::generate(&env);

    println!("=============================================================");
    println!("      Running test case: {}", "____existent_attestation_fails");
    println!("=============================================================");

    env.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "initialize",
            args: (admin.clone(),).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    client.initialize(&admin);

    let non_existent_uid = BytesN::from_array(&env, &[1; 32]);

    env.mock_auths(&[MockAuth {
        address: &attester,
        invoke: &MockAuthInvoke {
            contract: &contract_id,
            fn_name: "revoke",
            args: (attester.clone(), non_existent_uid.clone()).into_val(&env),
            sub_invokes: &[],
        },
    }]);
    let result = client.try_revoke(&attester, &non_existent_uid);
    dbg!(&result);
    assert_eq!(result, Err(Ok(Error::AttestationNotFound.into())));

    println!("=============================================================");
    println!("Finished: {}", "___non_existent_attestation_fails");
    println!("=============================================================");
}
