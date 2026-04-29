// =======================================================================================
//
//                          EVENT PAYLOAD REGRESSION TESTS (W4)
//
// =======================================================================================
//! Regression tests for HAL-09 and M-CONTRACT-1.
//!
//! These tests exercise the event-emitting helpers in `protocol::events` directly
//! (wrapped inside `env.as_contract(...)` so the host considers them on-contract
//! emissions), bypassing the full attestation/schema entry points. This isolates
//! event-shape correctness from BLS signature setup, delegation, and storage logic.

use protocol::{events, AttestationContract};
use protocol::state::Attestation;
use soroban_sdk::{
    symbol_short,
    testutils::{Address as _, Events, Ledger as _},
    Address, BytesN, Env, IntoVal, String as SorobanString, TryIntoVal,
};

// ---------------------------------------------------------------------------------------
// Test 1 — HAL-09: ATTEST/CREATE event includes schema_uid at index 1
// ---------------------------------------------------------------------------------------
#[test]
fn test_attest_create_event_includes_schema_uid() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().set_timestamp(1000);

    // Register a contract instance so we have a contract context to emit events from.
    let contract_id = env.register(AttestationContract {}, ());

    let uid = BytesN::from_array(&env, &[0xABu8; 32]);
    let schema_uid = BytesN::from_array(&env, &[0xCDu8; 32]);
    let subject = Address::generate(&env);
    let attester = Address::generate(&env);
    let value = SorobanString::from_str(&env, "test-value");

    let attestation = Attestation {
        uid: uid.clone(),
        schema_uid: schema_uid.clone(),
        subject: subject.clone(),
        attester: attester.clone(),
        value: value.clone(),
        nonce: 42u64,
        timestamp: 1000u64,
        expiration_time: None,
        revoked: false,
        revocation_time: None,
    };

    // Emit the event from within the contract context.
    env.as_contract(&contract_id, || {
        events::publish_attestation_event(&env, &attestation);
    });

    let all_events = env.events().all();
    assert!(!all_events.is_empty(), "expected at least one event");

    // Find the ATTEST/CREATE event by topics.
    let expected_topics = (symbol_short!("ATTEST"), symbol_short!("CREATE")).into_val(&env);
    let target = all_events
        .iter()
        .find(|e| e.1 == expected_topics)
        .expect("ATTEST/CREATE event not found");

    // Decode the new 7-tuple shape with schema_uid at index 1.
    let event_data: (BytesN<32>, BytesN<32>, Address, Address, SorobanString, u64, u64) =
        target.2.try_into_val(&env).expect("event data did not match new 7-tuple shape");

    assert_eq!(event_data.0, uid, "index 0 (uid) mismatch");
    assert_eq!(event_data.1, schema_uid, "index 1 (schema_uid) mismatch — HAL-09 regression");
    assert_eq!(event_data.2, subject, "index 2 (subject) mismatch");
    assert_eq!(event_data.3, attester, "index 3 (attester) mismatch");
    assert_eq!(event_data.4, value, "index 4 (value) mismatch");
    assert_eq!(event_data.5, 42u64, "index 5 (nonce) mismatch");
    assert_eq!(event_data.6, 1000u64, "index 6 (timestamp) mismatch");
}
