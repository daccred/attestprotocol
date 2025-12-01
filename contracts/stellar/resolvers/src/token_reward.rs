// ══════════════════════════════════════════════════════════════════════════════
// ► Token Reward Resolver
// ►
// ► This contract implements the ResolverInterface for attestation processing
// ► with automatic token reward distribution.
// ►
// ► ARCHITECTURE OVERVIEW:
// ► ┌─────────────────────────────────────────────────────────────────────────┐
// ► │  TokenRewardResolver                                                    │
// ► │                                                                         │
// ► │  ┌─────────────────────┐                                               │
// ► │  │  ResolverInterface  │                                               │
// ► │  │                     │                                               │
// ► │  │  onattest()         │                                               │
// ► │  │  onresolve()        │                                               │
// ► │  │  onrevoke()         │                                               │
// ► │  │  metadata()         │                                               │
// ► │  └─────────────────────┘                                               │
// ► │                                                                         │
// ► │  State:                                                                 │
// ► │  - Reward tracking (user balances, total distributed)                  │
// ► │  - Pool management (reward token, amount, admin controls)              │
// ► │                                                                         │
// ► └─────────────────────────────────────────────────────────────────────────┘
// ►
// ► BUSINESS MODEL:
// ► This contract implements a token-incentivized attestation system where:
// ► 1. Organizations create attestations (permissionless model)
// ► 2. Each attestation automatically triggers reward distribution
// ► 3. Rewards are distributed from a managed token pool
// ► 4. Users can query their earned rewards via getter functions
// ► 5. Pool is managed by admin functions
// ►
// ► SECURITY MODEL:
// ► - **ResolverInterface**: Permissionless (economic spam resistance via gas costs)
// ► - **Pool Management**: Admin-controlled (funding, configuration)
// ► - **Reward Distribution**: Automatic (triggered by successful attestations)
// ►
// ► INTEGRATION PATTERN:
// ► - **Protocol Integration**: Contract acts as resolver for specific schemas
// ► - **Pool Management**: Admin funds pool, users earn through attestations
// ► - **Economic Balance**: Gas costs vs reward amounts provide natural rate limiting
// ══════════════════════════════════════════════════════════════════════════════

use crate::interface::{ResolverAttestationData, ResolverError, ResolverInterface, ResolverMetadata, ResolverType};
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, BytesN, Env, String};
use stellar_macros::default_impl;
use stellar_tokens::fungible::{Base, FungibleToken};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Initialized,
    RewardToken,
    RewardAmount,
    TotalRewarded,
    UserRewards,
    ProcessedAttestation, // Tracks attestation UIDs that have been rewarded
    ProtocolContract,     // Authorized protocol contract that can call onresolve
    // OpenZeppelin Fungible Token fields
    TokenName,
    TokenSymbol,
    TokenDecimals,
    TotalSupply,
    Balance,
    Allowance,
}

#[contract]
pub struct TokenRewardResolver;

#[contractimpl]
impl TokenRewardResolver {
    /// Initialize the resolver with reward token, amount, and authorized protocol contract
    ///
    /// # Arguments
    /// * `admin` - The admin address that can manage the resolver
    /// * `reward_token` - The token contract used for rewards
    /// * `reward_amount` - The amount of tokens to reward per attestation (must be >= 0)
    /// * `protocol_contract` - The authorized protocol contract that can call onresolve
    pub fn initialize(
        env: Env,
        admin: Address,
        reward_token: Address,
        reward_amount: i128,
        protocol_contract: Address,
    ) -> Result<(), ResolverError> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(ResolverError::CustomError); // Already initialized
        }

        // Validate reward amount is non-negative
        if reward_amount < 0 {
            return Err(ResolverError::ValidationFailed);
        }

        admin.require_auth();

        // Validate that reward_token implements the token interface by querying its decimals.
        // This prevents initialization with invalid or non-compliant token contracts that could
        // cause onresolve or fund_reward_pool to trap, potentially locking reward distribution.
        // If the address doesn't implement the token interface, this call will trap.
        let token_client = token::Client::new(&env, &reward_token);
        let _ = token_client.decimals(); // Will trap if not a valid token contract

        // Set token metadata using OpenZeppelin Base
        Base::set_metadata(
            &env,
            7, // 7 decimals (Stellar standard)
            String::from_str(&env, "Attestation Reward Token"),
            String::from_str(&env, "AREWARD"),
        );

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::RewardToken, &reward_token);
        env.storage().instance().set(&DataKey::RewardAmount, &reward_amount);
        env.storage().instance().set(&DataKey::TotalRewarded, &0i128);
        env.storage().instance().set(&DataKey::ProtocolContract, &protocol_contract);
        env.storage().instance().set(&DataKey::Initialized, &true);

        env.storage()
            .instance()
            .extend_ttl(env.storage().max_ttl() - 100, env.storage().max_ttl());

        Ok(())
    }

    /// Update reward amount (admin only)
    ///
    /// # Arguments
    /// * `new_amount` - The new reward amount (must be >= 0)
    pub fn set_reward_amount(env: Env, admin: Address, new_amount: i128) -> Result<(), ResolverError> {
        Self::require_admin(&env, &admin)?;

        // Validate reward amount is non-negative
        if new_amount < 0 {
            return Err(ResolverError::ValidationFailed);
        }

        env.storage().instance().set(&DataKey::RewardAmount, &new_amount);
        Self::extend_instance_ttl(&env);

        // Emit event
        env.events()
            .publish((String::from_str(&env, "REWARD_AMOUNT_UPDATED"),), new_amount);

        Ok(())
    }

    /// Get total rewards distributed
    pub fn get_total_rewarded(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalRewarded).unwrap_or(0)
    }

    /// Get user's total rewards earned
    pub fn get_user_rewards(env: Env, user: Address) -> i128 {
        let key = (DataKey::UserRewards, user);
        env.storage().persistent().get(&key).unwrap_or(0)
    }

    /// Fund the reward pool with tokens (admin only)
    ///
    /// This function allows the admin to add tokens to the reward pool,
    /// enabling continued reward distribution.
    pub fn fund_reward_pool(env: Env, admin: Address, amount: i128) -> Result<(), ResolverError> {
        Self::require_admin(&env, &admin)?;

        // Get reward token address
        let reward_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::RewardToken)
            .ok_or(ResolverError::CustomError)?;

        // Transfer tokens from admin to contract
        let token_client = token::Client::new(&env, &reward_token);
        token_client.transfer(&admin, &env.current_contract_address(), &amount);
        Self::extend_instance_ttl(&env);

        // Emit funding event
        env.events()
            .publish((String::from_str(&env, "POOL_FUNDED"), &admin), amount);

        Ok(())
    }

    /// Get current reward pool balance
    pub fn get_pool_balance(env: Env) -> i128 {
        if let Some(reward_token) = env.storage().instance().get::<DataKey, Address>(&DataKey::RewardToken) {
            let token_client = token::Client::new(&env, &reward_token);
            token_client.balance(&env.current_contract_address())
        } else {
            0
        }
    }

    fn require_admin(env: &Env, caller: &Address) -> Result<(), ResolverError> {
        caller.require_auth();

        let admin: Address = env
            .storage()
            .instance()
            .get(&DataKey::Admin)
            .ok_or(ResolverError::CustomError)?;

        if caller != &admin {
            return Err(ResolverError::NotAuthorized);
        }

        Ok(())
    }

    /// Extends the TTL of instance storage to prevent expiration.
    /// Should be called on any method that relies on instance storage.
    fn extend_instance_ttl(env: &Env) {
        env.storage()
            .instance()
            .extend_ttl(env.storage().max_ttl() - 100, env.storage().max_ttl());
    }
}

#[contractimpl]
impl ResolverInterface for TokenRewardResolver {
    /// **PERMISSIONLESS VALIDATION**: Allows all attestations for token reward incentives
    ///
    /// This resolver implements an open, permissionless model where anyone can create
    /// attestations and receive token rewards. This incentivizes attestation creation
    /// while relying on economic mechanisms and token distribution for quality control.
    ///
    /// # Economic Model
    /// - **Open Participation**: No barriers to attestation creation
    /// - **Token Incentives**: Reward distribution encourages attestation volume
    /// - **Market Mechanisms**: Token value and gas costs provide natural rate limiting
    /// - **Reward Pool**: Limited by contract's token balance
    ///
    /// # Security Trade-offs
    /// - **No Access Control**: Anyone can create attestations (potential spam)
    /// - **Economic Balance**: Gas costs vs reward amounts provide equilibrium
    /// - **Token Pool Security**: Rewards limited by available token reserves
    /// - **Attestation Quality**: Relies on external validation mechanisms
    ///
    /// # Alternative Implementations
    /// Production versions might add:
    /// - Minimum stake requirements for attesters
    /// - Rate limiting per address to prevent spam
    /// - Reputation-based multipliers for rewards
    /// - Quality scoring mechanisms
    ///
    /// # Parameters
    /// * `_env` - Soroban environment (unused in permissionless model)
    /// * `_attestation` - ResolverAttestationData (no validation performed)
    ///
    /// # Returns
    /// * `Ok(true)` - Always allows attestations (permissionless access)
    fn onattest(_env: Env, _attestation: ResolverAttestationData) -> Result<bool, ResolverError> {
        // PERMISSIONLESS MODEL: Allow all attestations
        // Economic incentives through token rewards drive participation
        // Gas costs provide natural spam resistance
        Ok(true)
    }

    /// **TOKEN DISTRIBUTION FUNCTION**: Distributes rewards after successful attestation
    ///
    /// This function implements the reward distribution logic that incentivizes attestation
    /// creation. It transfers tokens from the contract's reward pool to the attester's wallet,
    /// creating economic incentives for participation in the attestation ecosystem.
    ///
    /// # Economic Mechanics
    /// - **Immediate Rewards**: Tokens distributed instantly after attestation creation
    /// - **Fixed Amount**: Each attestation receives same reward amount (configurable)
    /// - **Pool Depletion**: Rewards stop when contract balance insufficient
    /// - **Tracking**: Complete audit trail of reward distribution
    ///
    /// # Token Safety
    /// - **Balance Verification**: Checks sufficient tokens before transfer
    /// - **Atomic Transfer**: Token transfer succeeds or entire operation fails
    /// - **Error Handling**: Graceful handling of insufficient funds
    /// - **Authorization**: Contract authorized to transfer its own tokens
    ///
    /// # State Updates
    /// 1. **Total Tracking**: Updates cumulative rewards distributed
    /// 2. **User Tracking**: Records individual user reward totals
    /// 3. **Event Emission**: Publishes reward distribution event
    /// 4. **TTL Extension**: Ensures user reward data persists
    ///
    /// # Parameters
    /// * `env` - Soroban environment for storage and token operations
    /// * `attestation` - Attestation data containing attester address and attestation UID
    ///
    /// # Returns
    /// * `Ok(())` - Reward distributed successfully
    /// * `Err(ResolverError::CustomError)` - Reward token not configured
    /// * `Err(ResolverError::InsufficientFunds)` - Contract balance too low
    ///
    /// # Critical Security Properties
    /// - **Authorization**: Only contract can initiate token transfers from its balance
    /// - **Balance Protection**: Cannot transfer more tokens than available
    /// - **State Consistency**: All state updates are atomic with token transfer
    /// - **Audit Trail**: Complete record of all reward distributions
    ///
    /// # Attack Vectors & Mitigations
    /// * **Double Spending**: Attempting to drain reward pool
    ///   - *Mitigation*: Balance check before each transfer prevents over-distribution
    /// * **Reward Manipulation**: Attempting to claim rewards without attestation
    ///   - *Mitigation*: Function only called by protocol after successful attestation
    /// * **Token Substitution**: Using wrong token for rewards
    ///   - *Mitigation*: Token address stored in contract state and validated
    /// * **Balance Exhaustion**: Draining reward pool through spam
    ///   - *Mitigation*: Economic balance between gas costs and reward amounts
    ///
    /// # Economic Attack Analysis
    /// - **Cost to Attack**: Gas cost per attestation vs reward amount received
    /// - **Profitability Threshold**: Attack profitable only if reward > gas cost
    /// - **Natural Rate Limiting**: Economics provide automatic spam resistance
    /// - **Pool Sustainability**: Requires periodic refunding for continued operation
    fn onresolve(env: Env, attestation_uid: BytesN<32>, attester: Address) -> Result<(), ResolverError> {
        // STEP 0a: Verify caller is the authorized protocol contract
        // This prevents unauthorized direct calls that could drain the reward pool
        let protocol_contract: Address = env
            .storage()
            .instance()
            .get(&DataKey::ProtocolContract)
            .ok_or(ResolverError::CustomError)?;
        protocol_contract.require_auth();

        // STEP 0b: Check for replay attack - ensure this attestation hasn't been rewarded
        let processed_key = (DataKey::ProcessedAttestation, attestation_uid.clone());
        if env.storage().persistent().has(&processed_key) {
            // Already processed - silently succeed to not break protocol flow
            // but don't distribute rewards again
            return Ok(());
        }

        // STEP 1: Load reward configuration from contract storage
        let reward_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::RewardToken)
            .ok_or(ResolverError::CustomError)?; // Resolver not properly initialized

        let reward_amount: i128 = env.storage().instance().get(&DataKey::RewardAmount).unwrap_or(0);

        // EARLY EXIT: No rewards configured (admin set amount to 0)
        if reward_amount == 0 {
            return Ok(()); // Silent success - no rewards to distribute
        }

        // STEP 2: Verify contract has sufficient token balance
        let token_client = token::Client::new(&env, &reward_token);
        let balance = token_client.balance(&env.current_contract_address());

        if balance < reward_amount {
            // INSUFFICIENT FUNDS: Cannot distribute reward - pool depleted
            return Err(ResolverError::InsufficientFunds);
        }

        // STEP 3: Mark attestation as processed BEFORE transfer (prevents reentrancy)
        env.storage().persistent().set(&processed_key, &true);
        env.storage()
            .persistent()
            .extend_ttl(&processed_key, env.storage().max_ttl() - 100, env.storage().max_ttl());

        // STEP 4: Transfer reward tokens to attester
        // This is the core economic incentive - immediate token reward for attestation
        token_client.transfer(
            &env.current_contract_address(), // From: contract's reward pool
            &attester,                       // To: attestation creator
            &reward_amount,                  // Amount: configured reward per attestation
        );

        // STEP 5: Update total rewards distributed (audit trail)
        let total: i128 = env.storage().instance().get(&DataKey::TotalRewarded).unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalRewarded, &(total + reward_amount));

        // Extend instance storage TTL to prevent expiration
        TokenRewardResolver::extend_instance_ttl(&env);

        // STEP 6: Update individual user reward totals
        let user_key = (DataKey::UserRewards, attester.clone());
        let user_total: i128 = env.storage().persistent().get(&user_key).unwrap_or(0);
        env.storage().persistent().set(&user_key, &(user_total + reward_amount));

        // Extend TTL to ensure user reward data persists
        env.storage()
            .persistent()
            .extend_ttl(&user_key, env.storage().max_ttl() - 100, env.storage().max_ttl());

        // STEP 7: Emit reward distribution event for monitoring
        env.events().publish(
            (String::from_str(&env, "REWARD_DISTRIBUTED"), &attester),
            (&attestation_uid, &reward_amount),
        );

        Ok(())
    }

    /// No validation needed for revocations
    fn onrevoke(_env: Env, _attestation: ResolverAttestationData) -> Result<bool, ResolverError> {
        Ok(true)
    }

    fn metadata(env: Env) -> ResolverMetadata {
        ResolverMetadata {
            name: String::from_str(&env, "Token Reward Resolver"),
            version: String::from_str(&env, "1.0.0"),
            description: String::from_str(&env, "Distributes token rewards for attestations"),
            resolver_type: ResolverType::TokenReward,
        }
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// ► OpenZeppelin Fungible Token Interface Implementation
// ►
// ► This implementation makes TokenRewardResolver a dual-interface contract that
// ► functions as both a resolver for attestation rewards AND a standard fungible
// ► token compliant with OpenZeppelin patterns using the default_impl macro.
// ══════════════════════════════════════════════════════════════════════════════

#[default_impl]
#[contractimpl]
impl FungibleToken for TokenRewardResolver {
    type ContractType = Base;
}

