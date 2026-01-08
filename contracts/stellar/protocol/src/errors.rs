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
    InvalidSignaturePoint = 25,
    BlsPubKeyNotRegistered = 26,
    IntegerOverflow = 27,
    /// A schema with the same definition, authority, and resolver already exists.
    /// This indicates an attempt to register a duplicate schema.
    SchemaAlreadyExists = 28,
    /// The caller has exceeded their schema registration quota.
    /// Each address is limited to a maximum number of schemas to prevent DoS attacks.
    SchemaQuotaExceeded = 29,
    /// The schema definition exceeds the maximum allowed size.
    /// Limits are enforced to prevent storage exhaustion attacks.
    SchemaDefinitionTooLarge = 30,
}
