#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Bytes, BytesN, Env, String};

pub mod errors;
pub mod events;
pub mod instructions;
pub mod interfaces;
pub mod state;
pub mod utils;

use state::{Attestation, BlsPublicKey, DataKey, DelegatedAttestationRequest, DelegatedRevocationRequest, Schema};

use instructions::{
    attest, attest_by_delegation, get_attest_dst, get_attestation_record, get_bls_public_key, get_revoke_dst,
    register_bls_public_key, register_schema, revoke_attestation, revoke_by_delegation, get_schema_or_fail,
};

#[contract]
pub struct AttestationContract;

#[contractimpl]
impl AttestationContract {
    /// Initializes the contract with an administrative address.
    ///
    /// This function can only be called once. Subsequent calls will result in an
    /// `AlreadyInitialized` error. The admin address must authorize the initialization
    /// to prevent front-running attacks.
    ///
    /// # Arguments
    ///
    /// * `admin` - The address to be set as the contract administrator. Must authorize this call.
    ///
    /// # Errors
    ///
    /// Returns `Err(errors::Error::AlreadyInitialized)` if the contract has already been initialized.
    pub fn initialize(env: Env, admin: Address) -> Result<(), errors::Error> {
        if env.storage().instance().has(&DataKey::Admin) {
            return Err(errors::Error::AlreadyInitialized);
        }

        // Require authorization from the admin to prevent front-running attacks
        admin.require_auth();

        env.storage().instance().set(&DataKey::Admin, &admin);

        // Emit contract initialization event
        events::publish_contract_initialized(&env, &admin);

        Ok(())
    }

    /// Registers a new attestation schema.
    ///
    /// A schema defines the structure and rules for attestations. Each schema is
    /// identified by a unique UID, which is derived from its definition.
    ///
    /// # Arguments
    ///
    /// * `caller` - The address of the entity registering the schema. The caller is designated as the schema's creator.
    /// * `schema_definition` - A string defining the schema. The format of this string is up to the implementer.
    /// * `resolver` - An optional address of a contract that can resolve or validate attestations against this schema.
    /// * `revocable` - A boolean indicating whether attestations made against this schema can be revoked.
    ///
    /// # Returns
    ///
    /// Returns a `Result` containing the 32-byte UID of the newly registered schema,
    /// or an error if the registration fails.
    pub fn register(
        env: Env,
        caller: Address,
        schema_definition: String,
        resolver: Option<Address>,
        revocable: bool,
    ) -> Result<BytesN<32>, errors::Error> {
        register_schema(&env, caller, schema_definition, resolver, revocable)
    }

    /// Retrieves a registered schema by its UID.
    ///
    /// # Arguments
    ///
    /// * `schema_uid` - The 32-byte unique identifier of the schema to retrieve.
    ///
    /// # Returns
    ///
    /// Returns a `Result` containing the `Schema` struct if found, or an error
    /// if no schema with the given UID exists.
    pub fn get_schema(env: Env, schema_uid: BytesN<32>) -> Result<Schema, errors::Error> {
        get_schema_or_fail(&env, &schema_uid)
    }

    /// Creates an attestation where the attester is also the subject.
    ///
    /// This function creates a new attestation based on a specified schema. The `attester`
    /// must authorize this operation by signing the transaction, and they will also be the subject of the attestation.
    ///
    /// # Arguments
    ///
    /// * `attester` - The address of the entity making the attestation. Must be the transaction signer.
    /// * `schema_uid` - The UID of the schema for which the attestation is being made.
    /// * `value` - The value of the attestation, conforming to the schema's definition.
    /// * `expiration_time` - An optional Unix timestamp indicating when the attestation expires.
    ///
    /// # Returns
    ///
    /// Returns a `Result` containing the 32-byte UID of the newly created attestation,
    /// or an error if the process fails.
    pub fn attest(
        env: Env,
        attester: Address,
        schema_uid: BytesN<32>,
        value: String,
        expiration_time: Option<u64>,
    ) -> Result<BytesN<32>, errors::Error> {
        attest(&env, attester, schema_uid, value, expiration_time)
    }

    /// Revokes an existing attestation.
    ///
    /// Only the original attester or an authorized party (as defined by the schema) can
    /// revoke an attestation. The schema must also permit revocations.
    ///
    /// # Arguments
    ///
    /// * `revoker` - The address of the entity revoking the attestation. Must be authorized to perform this action.
    /// * `attestation_uid` - The UID of the attestation to be revoked.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` on successful revocation, or an error if the revocation fails.
    pub fn revoke(env: Env, revoker: Address, attestation_uid: BytesN<32>) -> Result<(), errors::Error> {
        revoke_attestation(&env, revoker, attestation_uid)
    }

    /// Retrieves an attestation by its UID.
    ///
    /// # Arguments
    ///
    /// * `attestation_uid` - The 32-byte unique identifier of the attestation to retrieve.
    ///
    /// # Returns
    ///
    /// Returns a `Result` containing the `Attestation` struct if found, or an error
    /// if no attestation with the given UID exists.
    pub fn get_attestation(env: Env, attestation_uid: BytesN<32>) -> Result<Attestation, errors::Error> {
        get_attestation_record(&env, attestation_uid)
    }

    // ══════════════════════════════════════════════════════════════════════════════
    // ► Delegated Attestation Functions
    // ══════════════════════════════════════════════════════════════════════════════

    /// Creates an attestation using a delegated signature.
    ///
    /// This method allows for gas-less attestations where a `submitter` can post an
    /// attestation on behalf of an `attester`. The `attester`'s authorization is
    /// verified through a signed `DelegatedAttestationRequest`. The attestation UID
    /// can be derived off-chain from the request parameters.
    ///
    /// Anyone can submit this transaction, paying the fees.
    ///
    /// # Arguments
    ///
    /// * `submitter` - The address submitting the transaction, which must authorize the invocation.
    /// * `request` - The `DelegatedAttestationRequest` struct containing the attestation details and the attester's signature.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` on success, or an error if the request is invalid or signature verification fails.
    pub fn attest_by_delegation(
        env: Env,
        submitter: Address,
        request: DelegatedAttestationRequest,
    ) -> Result<(), errors::Error> {
        attest_by_delegation(&env, submitter, request)
    }

    /// Revokes an attestation using a delegated signature.
    ///
    /// This method allows for gas-less revocations where a `submitter` can post a
    /// revocation on behalf of a `revoker`. The `revoker`'s authorization is
    /// verified through a signed `DelegatedRevocationRequest`.
    ///
    /// # Arguments
    ///
    /// * `submitter` - The address submitting the transaction, which must authorize the invocation.
    /// * `request` - The `DelegatedRevocationRequest` struct containing the revocation details and the revoker's signature.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` on success, or an error if the request is invalid or signature verification fails.
    pub fn revoke_by_delegation(
        env: Env,
        submitter: Address,
        request: DelegatedRevocationRequest,
    ) -> Result<(), errors::Error> {
        revoke_by_delegation(&env, submitter, request)
    }

    /// Gets the next nonce for an attester.
    ///
    /// Nonces are used in delegated requests to prevent replay attacks. Each delegated
    /// request from an attester must have a unique, sequential nonce.
    ///
    /// # Arguments
    ///
    /// * `attester` - The address of the attester.
    ///
    /// # Returns
    ///
    /// Returns the next expected nonce (`u64`) for the given attester.
    pub fn get_attester_nonce(env: Env, attester: Address) -> u64 {
        utils::get_next_nonce(&env, &attester)
    }

    /// Returns the next expected nonce for a delegated revoker.
    ///
    /// Independent of `get_attester_nonce` because revocation has its own
    /// nonce dimension (see `DataKey::RevokerNonce`). Off-chain clients
    /// constructing a `DelegatedRevocationRequest` MUST use this counter,
    /// not `get_attester_nonce`.
    ///
    /// Source: C-CONTRACT-1 (independent audit), extends HAL-03.
    pub fn get_revoker_nonce(env: Env, revoker: Address) -> u64 {
        env.storage()
            .persistent()
            .get::<state::DataKey, u64>(&state::DataKey::RevokerNonce(revoker))
            .unwrap_or(0)
    }

    /// Registers a BLS public key for an attester.
    ///
    /// This public key can be used to verify delegated attestations and revocations,
    /// enabling more advanced cryptographic operations. The attester must authorize this registration.
    ///
    /// # Arguments
    ///
    /// * `attester` - The address of the attester for whom the BLS key is being registered. Must authorize transaction.
    /// * `public_key` - The 192-byte BLS public key.
    ///
    /// # Returns
    ///
    /// Returns `Ok(())` on successful registration, or an error if one already exists or registration fails.
    pub fn register_bls_key(env: Env, attester: Address, public_key: BytesN<192>) -> Result<(), errors::Error> {
        register_bls_public_key(&env, attester, public_key)
    }

    /// Gets the BLS public key for an attester.
    ///
    /// # Arguments
    ///
    /// * `attester` - The address of the attester.
    ///
    /// # Returns
    ///
    /// Returns a `Result` containing the `BlsPublicKey` if found, or an error if no key
    /// is registered for the given attester.
    pub fn get_bls_key(env: Env, attester: Address) -> Result<BlsPublicKey, errors::Error> {
        get_bls_public_key(&env, &attester)
    }

    /// Gets the domain separation tag (DST) for delegated attestations.
    ///
    /// The DST is a unique byte string used to ensure that signatures created for one
    /// purpose cannot be repurposed for another. This is crucial for the security of
    /// delegated operations.
    ///
    /// # Returns
    ///
    /// Returns the `Bytes` slice representing the DST for delegated attestations.
    pub fn get_dst_for_attestation(env: Env) -> Bytes {
        Bytes::from_slice(&env, get_attest_dst())
    }

    /// Gets the domain separation tag (DST) for delegated revocations.
    ///
    /// The DST is a unique byte string used to ensure that signatures created for one
    /// purpose cannot be repurposed for another. This is crucial for the security of
    /// delegated operations.
    ///
    /// # Returns
    ///
    /// Returns the `Bytes` slice representing the DST for delegated revocations.
    pub fn get_dst_for_revocation(env: Env) -> Bytes {
        Bytes::from_slice(&env, get_revoke_dst())
    }
}
