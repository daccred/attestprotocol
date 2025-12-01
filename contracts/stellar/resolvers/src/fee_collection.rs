use crate::interface::{ResolverAttestationData, ResolverError, ResolverInterface, ResolverMetadata, ResolverType};
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, BytesN, Env, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DataKey {
    Admin,
    Initialized,
    FeeToken,
    AttestationFee,
    FeeRecipient,
    TotalCollected,
    CollectedFees,
}

/// FeeCollectionResolver - Collects XLM fees for attestations
// Feature gating: expose the contract on native (non-wasm) test builds and when
// the `export-fee-collection-resolver` feature is enabled for Wasm builds.
// This prevents duplicate exported symbols (e.g., `onresolve`) when the
// resolvers library is linked into other Wasm contracts like `protocol`.
#[contract]
pub struct FeeCollectionResolver;

// Same gating rationale as above. Methods are exported only in host tests or
// when explicitly exporting this resolver contract to Wasm.
#[contractimpl]
impl FeeCollectionResolver {
    /// Initialize the resolver with fee configuration
    ///
    /// # Arguments
    /// * `admin` - The admin address that can manage the resolver
    /// * `fee_token` - The token contract used for fee collection
    /// * `attestation_fee` - The fee amount per attestation (must be >= 0)
    /// * `fee_recipient` - The address that receives collected fees
    pub fn initialize(
        env: Env,
        admin: Address,
        fee_token: Address,
        attestation_fee: i128,
        fee_recipient: Address,
    ) -> Result<(), ResolverError> {
        if env.storage().instance().has(&DataKey::Initialized) {
            return Err(ResolverError::CustomError); // Already initialized
        }

        // Validate attestation fee is non-negative to prevent reverse transfers
        // that could drain the contract or corrupt accounting
        if attestation_fee < 0 {
            return Err(ResolverError::ValidationFailed);
        }

        admin.require_auth();

        // Validate that fee_token implements the token interface by querying its decimals.
        // This prevents initialization with invalid or non-compliant token contracts.
        let token_client = token::Client::new(&env, &fee_token);
        let _ = token_client.decimals(); // Will trap if not a valid token contract

        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::FeeToken, &fee_token);
        env.storage().instance().set(&DataKey::AttestationFee, &attestation_fee);
        env.storage().instance().set(&DataKey::FeeRecipient, &fee_recipient);
        env.storage().instance().set(&DataKey::TotalCollected, &0i128);
        env.storage().instance().set(&DataKey::Initialized, &true);

        env.storage()
            .instance()
            .extend_ttl(env.storage().max_ttl() - 100, env.storage().max_ttl());

        Ok(())
    }

    /// Update attestation fee (admin only)
    ///
    /// # Arguments
    /// * `new_fee` - The new fee amount (must be >= 0)
    pub fn set_attestation_fee(env: Env, admin: Address, new_fee: i128) -> Result<(), ResolverError> {
        Self::require_admin(&env, &admin)?;

        // Validate fee is non-negative
        if new_fee < 0 {
            return Err(ResolverError::ValidationFailed);
        }

        env.storage().instance().set(&DataKey::AttestationFee, &new_fee);

        // Emit event
        env.events().publish((String::from_str(&env, "FEE_UPDATED"),), new_fee);

        Ok(())
    }

    /// Update fee recipient (admin only)
    pub fn set_fee_recipient(env: Env, admin: Address, new_recipient: Address) -> Result<(), ResolverError> {
        Self::require_admin(&env, &admin)?;

        env.storage().instance().set(&DataKey::FeeRecipient, &new_recipient);

        // Emit event
        env.events()
            .publish((String::from_str(&env, "RECIPIENT_UPDATED"),), &new_recipient);

        Ok(())
    }

    /// Withdraw collected fees (fee recipient only)
    pub fn withdraw_fees(env: Env, recipient: Address) -> Result<(), ResolverError> {
        recipient.require_auth();

        let fee_recipient: Address = env
            .storage()
            .instance()
            .get(&DataKey::FeeRecipient)
            .ok_or(ResolverError::CustomError)?;

        if recipient != fee_recipient {
            return Err(ResolverError::NotAuthorized);
        }

        // Get collected fees for this recipient
        let key = (DataKey::CollectedFees, recipient.clone());
        let collected: i128 = env.storage().persistent().get(&key).unwrap_or(0);

        if collected == 0 {
            return Ok(()); // Nothing to withdraw
        }

        // Transfer tokens
        let fee_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::FeeToken)
            .ok_or(ResolverError::CustomError)?;

        let token_client = token::Client::new(&env, &fee_token);
        token_client.transfer(&env.current_contract_address(), &recipient, &collected);

        // Reset collected amount
        env.storage().persistent().set(&key, &0i128);

        // Emit event
        env.events()
            .publish((String::from_str(&env, "FEES_WITHDRAWN"), &recipient), collected);

        Ok(())
    }

    /// Get total fees collected
    pub fn get_total_collected(env: Env) -> i128 {
        env.storage().instance().get(&DataKey::TotalCollected).unwrap_or(0)
    }

    /// Get collected fees for recipient
    pub fn get_collected_fees(env: Env, recipient: Address) -> i128 {
        let key = (DataKey::CollectedFees, recipient);
        env.storage().persistent().get(&key).unwrap_or(0)
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
}

// Same gating rationale as above. This ensures the trait method exports are
// not duplicated in Wasm unless explicitly requested via the feature flag.
#[cfg(any(not(target_arch = "wasm32"), feature = "export-fee-collection-resolver"))]
#[contractimpl]
impl ResolverInterface for FeeCollectionResolver {
    /// Collect fee before attestation
    fn onattest(env: Env, attestation: ResolverAttestationData) -> Result<bool, ResolverError> {
        // Get fee configuration
        let attestation_fee: i128 = env.storage().instance().get(&DataKey::AttestationFee).unwrap_or(0);

        if attestation_fee == 0 {
            return Ok(true); // No fee required
        }

        let fee_recipient: Address = env
            .storage()
            .instance()
            .get(&DataKey::FeeRecipient)
            .ok_or(ResolverError::CustomError)?;

        // Ensure attester authorization is tied to the root invocation
        attestation.attester.require_auth();

        // Collect fee from attester
        let fee_token: Address = env
            .storage()
            .instance()
            .get(&DataKey::FeeToken)
            .ok_or(ResolverError::CustomError)?;

        let token_client = token::Client::new(&env, &fee_token);
        token_client.transfer(&attestation.attester, &env.current_contract_address(), &attestation_fee);

        // Track collected fees for recipient
        let key = (DataKey::CollectedFees, fee_recipient.clone());
        let collected: i128 = env.storage().persistent().get(&key).unwrap_or(0);
        env.storage().persistent().set(&key, &(collected + attestation_fee));
        env.storage()
            .persistent()
            .extend_ttl(&key, env.storage().max_ttl() - 100, env.storage().max_ttl());

        // Update total collected
        let total: i128 = env.storage().instance().get(&DataKey::TotalCollected).unwrap_or(0);
        env.storage()
            .instance()
            .set(&DataKey::TotalCollected, &(total + attestation_fee));

        // Emit event
        env.events().publish(
            (String::from_str(&env, "FEE_COLLECTED"), &attestation.attester),
            (&attestation.uid, &attestation_fee),
        );

        Ok(true)
    }

    /// No post-processing needed
    fn onrevoke(_env: Env, _attestation: ResolverAttestationData) -> Result<bool, ResolverError> {
        Ok(true)
    }

    /// No validation needed for revocations
    fn onresolve(
        _env: Env,
        _attestation_uid: BytesN<32>,
        _attester: Address,
    ) -> core::result::Result<(), ResolverError> {
        Ok(())
    }

    fn metadata(env: Env) -> ResolverMetadata {
        ResolverMetadata {
            name: String::from_str(&env, "Fee Collection Resolver"),
            version: String::from_str(&env, "1.0.0"),
            description: String::from_str(&env, "Collects XLM fees for attestations"),
            resolver_type: ResolverType::FeeCollection,
        }
    }
}
