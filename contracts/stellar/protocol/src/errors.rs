use soroban_sdk::contracterror;
// use soroban_sdk::{Address, Env}; // Unused

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum Error {
    TransferFailed = 1,
    AuthorityNotRegistered = 2,
    SchemaNotFound = 3,
    AttestationExists = 4,
    AttestationNotFound = 5,
    NotAuthorized = 6,
    StorageFailed = 7,
    InvalidUid = 9,
    ResolverError = 10,
    SchemaHasNoResolver = 11,
    AdminNotSet = 12,
    AlreadyInitialized = 13,
    NotInitialized = 14,
    AttestationNotRevocable = 15,
    InvalidSchemaDefinition = 16,
    InvalidAttestationValue = 17,
    InvalidReference = 18,
    InvalidNonce = 19,
    ExpiredSignature = 20,
    InvalidSignature = 21,
    AttestationExpired = 22,
    InvalidDeadline = 23,
    ResolverCallFailed = 24,
    /// The submitted BLS point bytes have invalid encoding flags (e.g. the
    /// compression bit is set on what should be an uncompressed point, or
    /// the infinity bit is set on a non-identity point). Returned by the
    /// HAL-07 structural pre-check in `register_bls_public_key` and
    /// `verify_bls_signature` before `from_bytes` is invoked. Note: off-curve
    /// or wrong-subgroup points whose flag byte happens to be 0x00 still
    /// cause a Soroban host trap rather than this error.
    InvalidSignaturePoint = 25,
    /// The attester has not registered a BLS public key with the protocol,
    /// so delegated attestation / revocation cannot be cryptographically verified.
    BlsPubKeyNotRegistered = 26,
    IntegerOverflow = 27,
    /// A schema with the same definition, authority, and resolver already exists.
    /// This indicates an attempt to register a duplicate schema.
    SchemaAlreadyExists = 28,
}
