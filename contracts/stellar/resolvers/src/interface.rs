use soroban_sdk::{contracterror, contracttype, Address, BytesN, Env, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolverAttestationData {
    pub uid: BytesN<32>,
    pub schema_uid: BytesN<32>,
    pub recipient: Address,
    pub attester: Address,
    pub time: u64,
    pub expiration_time: u64, // 0 = not set
    pub revocation_time: u64, // 0 = not set
    pub revocable: bool,
    pub ref_uid: soroban_sdk::Bytes, // empty bytes = not set
    pub data: soroban_sdk::Bytes,
    pub value: i128, // 0 = not set
    pub revoked: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ResolverMetadata {
    pub name: String,
    pub version: String,
    pub description: String,
    pub resolver_type: ResolverType,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ResolverType {
    Default,
    Authority,
    TokenReward,
    FeeCollection,
    Hybrid,
    Staking,
    Custom,
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq, PartialOrd, Ord)]
#[repr(u32)]
pub enum ResolverError {
    NotAuthorized = 1,
    InvalidAttestation = 2,
    InvalidSchema = 3,
    InsufficientFunds = 4,
    TokenTransferFailed = 5,
    StakeRequired = 6,
    ValidationFailed = 7,
    CustomError = 8,
}

/// Standard Resolver Interface that all resolvers must implement
/// This provides a consistent interface for the protocol to interact with resolvers
///
/// # Interface Overview
///
/// The ResolverInterface defines the contract between the protocol and resolver implementations,
/// enabling modular business logic for attestation validation, economic models, and post-processing.
/// Each resolver can implement custom logic for:
/// - Attestation validation (onattest)
/// - Post-processing for both attestations and revocations (onresolve)
/// - Revocation handling (onrevoke)
/// - Metadata and type identification (metadata)
///
/// # Execution Flow
///
/// ```text
/// Protocol Attestation Flow:
/// ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
/// │ 1. onattest()   │───▶│ 2. Create        │───▶│ 3. onresolve()  │
/// │   Validation    │    │    Attestation   │    │   Post-process  │
/// │   - Auth checks │    │    - Store data  │    │   - Rewards     │
/// │   - Fee collect │    │    - Emit events │    │   - Tracking    │
/// │   - Requirements│    │    - Update refs │    │   - Side effects│
/// └─────────────────┘    └──────────────────┘    └─────────────────┘
///
/// Protocol Revocation Flow:
/// ┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
/// │ 1. onrevoke()   │───▶│ 2. Mark Revoked  │───▶│ 3. onresolve()  │
/// │   Validation    │    │    - Update state│    │   Post-process  │
/// │   - Auth checks │    │    - Emit events │    │   - Cleanup     │
/// │   - Conditions  │    │    - Cleanup     │    │   - Side effects│
/// └─────────────────┘    └──────────────────┘    └─────────────────┘
/// ```
///
/// # Resolver Types & Patterns
///
/// ## 1. Permissionless Resolvers (e.g., TokenRewardResolver)
/// - **onattest**: Always returns Ok(true) - no validation
/// - **onresolve**: Distributes token rewards for attestations, handles cleanup for revocations
/// - **Economic Model**: Gas costs provide spam resistance
/// - **Use Case**: Open attestation ecosystems with token incentives
///
/// ## 2. Permission-based Resolvers (e.g., AuthorityResolver)
/// - **onattest**: Validates attester authorization/permissions
/// - **onresolve**: Updates reputation, access controls, or handles state cleanup
/// - **Economic Model**: Access control prevents spam
/// - **Use Case**: Controlled attestation environments
///
/// ## 3. Fee-based Resolvers (e.g., FeeCollectionResolver)
/// - **onattest**: Collects fees before allowing attestation
/// - **onresolve**: Processes fee distribution or handles refunds/cleanup
/// - **Economic Model**: Fee requirements limit spam
/// - **Use Case**: Commercial attestation services
///
/// ## 4. Hybrid Resolvers
/// - **Multiple Models**: Combine permission, fees, and rewards
/// - **Complex Logic**: Multi-step validation and processing
/// - **Use Case**: Enterprise or complex business models
///
/// # Security Considerations
///
/// ## Authorization Patterns
/// - **onattest**: MUST validate attester authorization if required
/// - **onresolve**: Operates with protocol authorization context
/// - **onrevoke**: MUST validate revocation permissions
/// - **Pattern**: Use `address.require_auth()` for user actions
///
/// ## State Safety
/// - **Atomicity**: All state changes must be atomic with attestation creation/revocation
/// - **Consistency**: Failed resolver calls must not leave partial state
/// - **Isolation**: Resolvers cannot interfere with protocol core state
/// - **Pattern**: Use Result types and avoid panics
///
/// ## Economic Security
/// - **Spam Prevention**: Implement cost barriers (gas, fees, stakes)
/// - **Resource Limits**: Prevent resource exhaustion attacks
/// - **Rate Limiting**: Consider per-address restrictions
/// - **Pattern**: Balance economic incentives with attack costs
///
/// # Error Handling
///
/// Resolvers should return appropriate ResolverError variants:
/// - **NotAuthorized**: Caller lacks required permissions
/// - **InvalidAttestation**: Attestation data fails validation
/// - **InsufficientFunds**: Economic requirements not met
/// - **ValidationFailed**: Business logic validation fails
/// - **CustomError**: Resolver-specific error conditions
///
pub trait ResolverInterface {
    /// **ATTESTATION VALIDATION HOOK**
    ///
    /// Called before an attestation is created to validate whether it should be allowed.
    /// This is the primary gate for implementing business logic, economic models,
    /// and access control patterns.
    ///
    /// # Validation Patterns
    /// - **Permissionless**: Always return Ok(true), rely on economic barriers
    /// - **Permissioned**: Check authorization, roles, or credentials
    /// - **Economic**: Collect fees, check stakes, verify balances
    /// - **Conditional**: Validate data, check external conditions
    ///
    /// # Parameters
    /// * `env` - Soroban environment for storage and external calls
    /// * `attestation` - Complete attestation data for validation
    ///
    /// # Returns
    /// * `Ok(true)` - Attestation allowed, proceed with creation
    /// * `Ok(false)` - Attestation denied (soft failure)
    /// * `Err(ResolverError)` - Validation failed with specific error
    ///
    /// # Security Notes
    /// - MUST call `attester.require_auth()` if implementing access control
    /// - SHOULD validate all user-provided data before processing
    /// - MUST NOT modify protocol state (read-only validation)
    fn onattest(env: Env, attestation: ResolverAttestationData) -> Result<bool, ResolverError>;

    /// **REVOCATION VALIDATION HOOK**
    ///
    /// Called when an attestation revocation is requested to validate whether
    /// the revocation should be allowed. Implements revocation policies and
    /// business logic for attestation lifecycle management.
    ///
    /// # Revocation Patterns
    /// - **Open**: Allow any revocation by attester or recipient
    /// - **Restricted**: Require specific permissions or conditions
    /// - **Time-limited**: Only allow revocation within time windows
    /// - **Conditional**: Check external state or requirements
    ///
    /// # Parameters
    /// * `env` - Soroban environment for storage and external calls
    /// * `attestation` - Attestation data being revoked
    ///
    /// # Returns
    /// * `Ok(true)` - Revocation allowed, proceed with marking revoked
    /// * `Ok(false)` - Revocation denied (soft failure)
    /// * `Err(ResolverError)` - Revocation failed with specific error
    ///
    /// # Security Notes
    /// - Protocol handles basic revocability check (attestation.revocable)
    /// - Resolver adds additional business logic validation
    /// - MUST validate caller authorization for revocation
    fn onrevoke(env: Env, attestation: ResolverAttestationData) -> Result<bool, ResolverError>;

    /// **POST-PROCESSING CALLBACK HOOK**
    ///
    /// Called after successful attestation creation OR revocation to perform post-processing,
    /// side effects, and cleanup operations. This is a universal callback that handles
    /// both attestation and revocation contexts - the resolver determines the appropriate
    /// action based on the current state and context.
    ///
    /// # Processing Patterns
    /// ## For Attestations:
    /// - **Token Rewards**: Distribute rewards to attesters
    /// - **Reputation**: Update attester/recipient reputation scores
    /// - **Analytics**: Track attestation metrics and statistics
    /// - **Integration**: Trigger external system updates
    ///
    /// ## For Revocations:
    /// - **Cleanup**: Remove or reverse previous processing
    /// - **Refunds**: Return fees or stakes if applicable
    /// - **State Reversal**: Undo reputation or reward changes
    /// - **Notifications**: Alert external systems of revocation
    ///
    /// # Parameters
    /// * `env` - Soroban environment for storage and external calls
    /// * `attestation_uid` - Unique identifier of the attestation
    /// * `attester` - Address of the attester for processing purposes
    ///
    /// # Returns
    /// * `Ok(())` - Post-processing completed successfully
    /// * `Err(ResolverError)` - Post-processing failed (does not revert operation)
    ///
    /// # Security Notes
    /// - Runs with protocol authorization context
    /// - Failures do NOT revert the attestation creation or revocation
    /// - SHOULD handle errors gracefully to avoid blocking operations
    /// - MUST validate all external interactions and state changes
    /// - Resolver must determine context (attestation vs revocation) internally
    fn onresolve(env: Env, attestation_uid: BytesN<32>, attester: Address) -> Result<(), ResolverError>;

    /// **RESOLVER METADATA PROVIDER**
    ///
    /// Returns metadata describing the resolver's purpose, capabilities, and type.
    /// Used for discovery, documentation, and integration purposes.
    ///
    /// # Metadata Fields
    /// - **name**: Human-readable resolver name
    /// - **version**: Semantic version for compatibility tracking
    /// - **description**: Detailed description of resolver functionality
    /// - **resolver_type**: Enum categorizing the resolver's primary purpose
    ///
    /// # Returns
    /// * `ResolverMetadata` - Complete metadata describing the resolver
    fn metadata(env: Env) -> ResolverMetadata;
}
