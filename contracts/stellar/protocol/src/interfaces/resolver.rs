use soroban_sdk::{contractclient, contracttype, Address, Bytes, BytesN, Env};

/************************************************
* Flattened Attestation Struct for Resolver Calls
************************************************/
#[derive(Debug, Clone)]
#[contracttype]
pub struct ResolverAttestation {
    pub uid: BytesN<32>,
    pub schema_uid: BytesN<32>,
    pub recipient: Address,
    pub attester: Address,
    pub time: u64,
    pub expiration_time: u64, // Flattened: 0 = not set
    pub revocation_time: u64, // Flattened: 0 = not set
    pub revocable: bool,
    pub ref_uid: Bytes, // Flattened: empty bytes = not set
    pub data: Bytes,
    pub value: i128, // Flattened: 0 = not set
    pub revoked: bool,
}

/// Resolver Contract Client Interface
///
/// This interface defines the contract between the protocol and resolver implementations.
/// Resolvers provide custom business logic for attestation validation, economic models,
/// and post-processing hooks.
///
/// The ResolverClient is auto-generated from this trait and provides type-safe
/// cross-contract calls to resolver implementations. Each method corresponds to
/// a specific hook in the attestation lifecycle:
///
/// - onattest: Validates whether an attestation should be allowed (pre-creation)
/// - onrevoke: Validates whether a revocation should be allowed (pre-revocation)
/// - onresolve: Handles post-processing after attestation/revocation (side effects)
///
/// Security Model:
/// - onattest/onrevoke return boolean values that gate protocol actions
/// - onresolve failures are logged but don't revert transactions
/// - Resolvers implement access control, economic barriers, and business logic
///
#[contractclient(name = "ResolverClient")]
pub trait Resolver {
    /// Called before an attestation is created - CRITICAL for access control
    /// Returns true if attestation should be allowed, false to reject
    fn onattest(env: &Env, attestation: &ResolverAttestation) -> Result<bool, ResolverError>;

    /// Called before an attestation is revoked - CRITICAL for access control
    /// Returns true if revocation should be allowed, false to reject
    fn onrevoke(env: &Env, attestation: &ResolverAttestation) -> Result<bool, ResolverError>;

    /// Called after an attestation is attested or revoked - for side effects (rewards, cleanup, etc.)
    /// Failures are logged but don't revert the attestation or revocation
    fn onresolve(env: &Env, attestation: &ResolverAttestation) -> Result<(), ResolverError>;
}
