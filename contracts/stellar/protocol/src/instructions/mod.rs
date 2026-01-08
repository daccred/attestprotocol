pub mod attestation;
pub mod crypto;
pub mod delegation;
pub mod schema;

// Pub use all functions from the submodules to make them accessible from the parent `instructions` module.
pub use self::attestation::{attest, get_attestation_record, revoke_attestation};
pub use self::crypto::{get_bls_public_key, register_bls_public_key, verify_bls_signature};
pub use self::delegation::{
    attest_by_delegation, create_attestation_message, create_revocation_message, get_attest_dst, get_revoke_dst,
    revoke_by_delegation,
};
pub use self::schema::{
    get_address_schema_count, get_schema_or_fail, get_schema_registration_config, register_schema,
    set_schema_registration_config,
};