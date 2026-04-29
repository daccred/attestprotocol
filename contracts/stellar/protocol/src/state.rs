use soroban_sdk::{contracttype, Address, BytesN, String};

/// ╔══════════════════════════════════════════════════════════════════════════╗
/// ║                                 DataKey                                   ║
/// ╚══════════════════════════════════════════════════════════════════════════╝
///
/// Represents the keys used for data storage in the contract.
///
/// Each variant corresponds to a different type of data that can be stored
/// in the contract's persistent storage.
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Key for storing the contract admin address
    Admin,
    /// Key for storing authority information, indexed by the authority's address
    Authority(Address),
    /// Key for storing structured schema information, indexed by the schema's unique identifier
    Schema(BytesN<32>),
    /// Key for storing attestation data
    ///
    /// Indexed by attestation UID for direct lookup
    AttestationUID(BytesN<32>),
    /// Key for storing the current nonce for an attester
    ///
    /// Used to prevent replay attacks in delegated attestations
    AttesterNonce(Address),
    /// Key for storing the BLS public key for an attester
    ///
    /// One-to-one mapping: wallet address -> BLS public key
    AttesterPublicKey(Address),
    /// Key for storing the current nonce for a revoker (delegated revocation
    /// replay protection). Independent of AttesterNonce so revoking attestation
    /// N never requires the attester's current nonce.
    /// Source: C-CONTRACT-1 (independent audit), extends HAL-03 (Halborn §7.3).
    RevokerNonce(Address),
}

/// ╔══════════════════════════════════════════════════════════════════════════╗
/// ║                               Authority                                   ║
/// ╚══════════════════════════════════════════════════════════════════════════╝
///
/// Represents an authority that can create schemas and attestations.
///
/// Authorities are registered entities with specific permissions in the system
/// that can create schemas and issue attestations.
#[derive(Debug, Clone)]
#[contracttype]
pub struct Authority {
    /// The Stellar address of the authority
    pub address: Address,
    /// Metadata describing the authority
    ///
    /// Typically in JSON format, containing information about the authority.
    pub metadata: String,
}

/// ╔══════════════════════════════════════════════════════════════════════════╗
/// ║                                 Schema                                    ║
/// ╚══════════════════════════════════════════════════════════════════════════╝
///
/// Represents a schema definition that attestations can follow.
///
/// Schemas define the structure and validation rules for attestations.
/// The definition field supports multiple formats:
/// - XDR-encoded: Stellar-native binary format for structured data
/// - JSON: Human-readable structured format
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Schema {
    /// The address of the authority that created this schema
    pub authority: Address,
    /// The schema definition in any supported format
    ///
    /// Supports XDR-encoded structured data or JSON
    pub definition: String,
    /// Optional address of a resolver contract for this schema
    ///
    /// If present, this contract will be called to handle attestation operations.
    pub resolver: Option<Address>,
    /// Whether attestations using this schema can be revoked
    pub revocable: bool,
}

/// ╔══════════════════════════════════════════════════════════════════════════╗
/// ║                      DelegatedAttestationRequest                          ║
/// ╚══════════════════════════════════════════════════════════════════════════╝
///
/// Represents a request for delegated attestations.
///
/// This allows an attester to sign an attestation off-chain, which can then be
/// submitted on-chain by any party (who will pay the transaction fees).
#[contracttype]
#[derive(Clone)]
pub struct DelegatedAttestationRequest {
    /// The unique identifier of the schema this attestation follows
    pub schema_uid: BytesN<32>,
    /// The address of the entity that is the subject of this attestation
    pub subject: Address,
    /// The address of the original attester (who signed off-chain)
    pub attester: Address,
    /// The value or content of the attestation
    pub value: String,
    /// The nonce for this attestation (must be the next expected nonce for the attester)
    pub nonce: u64,
    /// Expiration timestamp for this signed request
    ///
    /// After this time, the signature is no longer valid and cannot be submitted.
    pub deadline: u64,
    /// Optional expiration time for the attestation itself
    pub expiration_time: Option<u64>,
    /// BLS12-381 G1 signature of the request data (96 bytes)
    pub signature: BytesN<96>,
}

/// ╔══════════════════════════════════════════════════════════════════════════╗
/// ║                      DelegatedRevocationRequest                           ║
/// ╚══════════════════════════════════════════════════════════════════════════╝
///
/// Represents a request for delegated revocation.
///
/// This allows an attester to sign a revocation off-chain, which can then be
/// submitted on-chain by any party.
#[contracttype]
#[derive(Clone)]
pub struct DelegatedRevocationRequest {
    /// The unique identifier of the attestation to revoke
    pub attestation_uid: BytesN<32>,
    /// The unique identifier of the schema
    pub schema_uid: BytesN<32>,
    /// The address of the entity that is the subject of the attestation to revoke
    pub subject: Address,
    /// The nonce of the attestation to revoke
    pub nonce: u64,
    /// The address of the original attester (who signed off-chain)
    pub revoker: Address,
    /// Expiration timestamp for this signed request
    pub deadline: u64,
    /// BLS12-381 G1 signature of the request data (96 bytes)
    pub signature: BytesN<96>,
}

/// ╔══════════════════════════════════════════════════════════════════════════╗
/// ║                            Attestation                                    ║
/// ╚══════════════════════════════════════════════════════════════════════════╝
///
/// Represents an attestation with support for both direct and delegated attestations.
///
/// Used for tracking attestations and supporting multiple attestations per schema/subject
/// pair through nonces.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct Attestation {
    /// The unique identifier of the attestation
    pub uid: BytesN<32>,
    /// The unique identifier of the schema this attestation follows
    pub schema_uid: BytesN<32>,
    /// The address of the entity that is the subject of this attestation
    pub subject: Address,
    /// The address of the entity that created this attestation
    ///
    /// In direct attestations, this is the caller.
    /// In delegated attestations, this is the original signer.
    pub attester: Address,
    /// The value or content of the attestation
    pub value: String,
    /// Unique nonce for this attestation
    ///
    /// Allows for multiple attestations of the same schema for the same subject,
    /// and prevents replay attacks in delegated attestations.
    pub nonce: u64,
    /// Timestamp when the attestation was created
    pub timestamp: u64,
    /// Optional expiration timestamp
    ///
    /// If set, the attestation is considered invalid after this time.
    pub expiration_time: Option<u64>,
    /// Whether this attestation has been revoked
    pub revoked: bool,
    /// Optional timestamp when the attestation was revoked
    pub revocation_time: Option<u64>,
}

/// ╔══════════════════════════════════════════════════════════════════════════╗
/// ║                            BLS Public Key                                 ║
/// ╚══════════════════════════════════════════════════════════════════════════╝
///
/// Represents a BLS12-381 public key for an attester.
///
/// Each wallet address can have exactly one BLS public key. No updates or revocations.
#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub struct BlsPublicKey {
    /// The BLS12-381 G2 public key (192 bytes compressed)
    pub key: BytesN<192>,
    /// Timestamp when this key was registered
    pub registered_at: u64,
}
