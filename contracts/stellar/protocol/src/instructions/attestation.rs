use crate::errors::Error;
use crate::state::{Attestation, DataKey};
use soroban_sdk::{xdr::ToXdr, Address, Bytes, BytesN, Env, String};

use crate::events;
use crate::interfaces::resolver::{ResolverAttestation, ResolverClient};
use crate::utils::{self, generate_attestation_uid};

// ══════════════════════════════════════════════════════════════════════════════
// ► Resolver Cross-Contract Call Helpers
// ══════════════════════════════════════════════════════════════════════════════

/// Calls onattest on a resolver contract
/// Returns true if the attestation should be allowed, false otherwise
fn call_resolver_onattest(
    env: &Env,
    resolver_address: &Address,
    attestation: &ResolverAttestation,
) -> Result<bool, Error> {
    let resolver_client = ResolverClient::new(env, resolver_address);

    match resolver_client.try_onattest(attestation) {
        Ok(result) => match result {
            Ok(allowed) => Ok(allowed),
            Err(_) => Err(Error::ResolverCallFailed),
        },
        Err(_) => Err(Error::ResolverCallFailed),
    }
}

/// Calls onrevoke on a resolver contract
/// Returns true if the revocation should be allowed, false otherwise
fn call_resolver_onrevoke(
    env: &Env,
    resolver_address: &Address,
    attestation: &ResolverAttestation,
) -> Result<bool, Error> {
    let resolver_client = ResolverClient::new(env, resolver_address);

    match resolver_client.try_onrevoke(attestation) {
        Ok(result) => match result {
            Ok(allowed) => Ok(allowed),
            Err(_) => Err(Error::ResolverCallFailed),
        },
        Err(_) => Err(Error::ResolverCallFailed),
    }
}

/// Calls onresolve on a resolver contract
/// Failures are logged but don't revert the attestation or revocation
fn call_resolver_onresolve(env: &Env, resolver_address: &Address, attestation: &ResolverAttestation) {
    let resolver_client = ResolverClient::new(env, resolver_address);

    // Ignore failures in onresolve - they're non-critical side effects
    let _ = resolver_client.try_onresolve(attestation);
}

// ══════════════════════════════════════════════════════════════════════════════
// ► Helper Functions for Resolver Integration
// ══════════════════════════════════════════════════════════════════════════════

/// Creates a ResolverAttestation from protocol Attestation data
/// This converts between the protocol's internal format and the resolver interface format
fn create_resolver_attestation(
    env: &Env,
    attestation: &Attestation,
    schema_uid: &BytesN<32>,
    revocable: bool,
) -> ResolverAttestation {
    // Generate a UID for this attestation (protocol doesn't store UIDs currently)
    let uid = generate_attestation_uid(env, schema_uid, &attestation.subject, &attestation.attester, attestation.nonce);

    // Convert attestation value (String) to Bytes for the resolver interface
    // We use XDR serialization to ensure consistent encoding across platforms
    let data = attestation.value.clone().to_xdr(env);

    ResolverAttestation {
        uid,
        schema_uid: schema_uid.clone(),
        recipient: attestation.subject.clone(),
        attester: attestation.attester.clone(),
        time: attestation.timestamp,
        expiration_time: attestation.expiration_time.unwrap_or(0), // Flattened: 0 = not set
        revocation_time: attestation.revocation_time.unwrap_or(0), // Flattened: 0 = not set
        revocable,
        ref_uid: Bytes::new(env), // Flattened: empty bytes = not set
        data,                     // XDR-encoded attestation value
        value: 0,                 // Flattened: 0 = not set (protocol doesn't support numeric value field yet)
    }
}

/// Creates a new attestation using nonce-based system for unique identification.
///
/// This function follows the security pattern of using nonces to allow multiple
/// attestations for the same schema/subject pair. Each attestation is uniquely
/// identified by (schema_uid, subject, nonce).
///
/// # Authorization
/// Requires authorization from the caller (attester).
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `attester` - The address creating the attestation. This address will also be the subject of the attestation.
/// * `schema_uid` - The unique identifier of the schema
/// * `value` - The attestation data
/// * `expiration_time` - Optional expiration timestamp
///
/// # Returns
/// * `Result<u64, Error>` - The nonce of the created attestation or error
pub fn attest(
    env: &Env,
    attester: Address,
    schema_uid: BytesN<32>,
    value: String,
    expiration_time: Option<u64>,
) -> Result<BytesN<32>, Error> {
    attester.require_auth();

    // Verify schema exists and get resolver info
    let schema = utils::get_schema(env, &schema_uid).ok_or(Error::SchemaNotFound)?;

    // Get next nonce for this attester
    let nonce = utils::get_next_nonce(env, &attester);

    // Create attestation record
    let current_time = env.ledger().timestamp();

    // Check if expiration time is valid (if provided)
    if current_time > request.deadline {
        return Err(Error::ExpiredSignature);
    }

    if let Some(exp_time) = expiration_time {
        if exp_time != 0 && exp_time <= current_time {
            return Err(Error::InvalidExpirationTime);
        }
    }

    let subject = attester.clone();
    let attestation_uid = generate_attestation_uid(env, &schema_uid, &subject, nonce);

    let attestation = Attestation {
        uid: attestation_uid.clone(),
        schema_uid: schema_uid.clone(),
        subject,
        attester: attester.clone(),
        value: value.clone(),
        nonce,
        timestamp: current_time,
        expiration_time,
        revoked: false,
        revocation_time: None,
    };

    let key = DataKey::AttestationUID(attestation_uid.clone());

    if env.storage().persistent().has(&key) {
        return Err(Error::UIDAlreadyExists);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ► RESOLVER INTEGRATION: Before Attest Hook
    // ═══════════════════════════════════════════════════════════════════════════

    // Call resolver onattest hook if schema has a resolver
    if let Some(resolver_address) = &schema.resolver {
        // Create resolver attestation format
        let resolver_attestation =
            create_resolver_attestation(env, &attestation, &schema_uid, schema.revocable);

        // Call onattest hook - this is CRITICAL for access control
        let allowed = call_resolver_onattest(env, resolver_address, &resolver_attestation)?;

        if !allowed {
            return Err(Error::ResolverError); // Resolver rejected the attestation
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ► CORE PROTOCOL: Store Attestation
    // ═══════════════════════════════════════════════════════════════════════════

    // Store the attestation by its UID
    let attest_uid_key = DataKey::AttestationUID(attestation_uid.clone());
    env.storage().persistent().set(&attest_uid_key, &attestation);

    // Increment nonce for next attestation (using checked arithmetic to prevent overflow)
    let nonce_key = DataKey::AttesterNonce(attester.clone());
    let new_nonce = nonce.checked_add(1).ok_or(Error::IntegerOverflow)?;
    env.storage().persistent().set(&nonce_key, &new_nonce);

    // ═══════════════════════════════════════════════════════════════════════════
    // ► RESOLVER INTEGRATION: After Attest Hook
    // ═══════════════════════════════════════════════════════════════════════════

    // Call resolver onresolve hook if schema has a resolver
    if let Some(resolver_address) = &schema.resolver {
        // Create resolver attestation format
        let resolver_attestation =
            create_resolver_attestation(env, &attestation, &schema_uid, schema.revocable);

        // Call onresolve hook for side effects (rewards, registration, etc.)
        // Note: Failures here don't revert the attestation
        call_resolver_onresolve(env, resolver_address, &resolver_attestation);
    }

    // Emit event
    events::publish_attestation_event(env, &attestation);

    Ok(attestation_uid)
}

/// Retrieves an attestation using the nonce-based system.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `attestation_uid` - The unique identifier of the attestation
///
/// # Returns
/// * `Result<Attestation, Error>` - The attestation record or error
///
/// # Errors
/// * `Error::AttestationNotFound` - If the attestation does not exist
/// * `Error::AttestationExpired` - If the attestation has expired
///
/// # Note
/// This function does NOT delete expired attestations. Read operations should be
/// idempotent and free of side effects. Expired attestations remain in storage
/// for historical reference - use a separate cleanup process if deletion is needed.
pub fn get_attestation_record(env: &Env, attestation_uid: BytesN<32>) -> Result<Attestation, Error> {
    // Get attestation
    let attest_key = DataKey::AttestationUID(attestation_uid);
    let attestation = env
        .storage()
        .persistent()
        .get::<DataKey, Attestation>(&attest_key)
        .ok_or(Error::AttestationNotFound)?;

    // Check if attestation is expired (read-only check, no deletion)
    if let Some(exp_time) = attestation.expiration_time {
        if env.ledger().timestamp() > exp_time {
            return Err(Error::AttestationExpired);
        }
    }

    Ok(attestation)
}

/// Revokes an attestation using the nonce-based system.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `revoker` - The address revoking the attestation (must be the original attester)
/// * `schema_uid` - The unique identifier of the schema
/// * `subject` - The address that is the subject of the attestation
/// * `nonce` - The nonce of the attestation to revoke
///
/// # Returns
/// * `Result<(), Error>` - Success or error
pub fn revoke_attestation(env: &Env, revoker: Address, attestation_uid: BytesN<32>) -> Result<(), Error> {
    revoker.require_auth();

    // Get the attestation
    let attest_key = DataKey::AttestationUID(attestation_uid);
    let mut attestation = env
        .storage()
        .persistent()
        .get::<DataKey, Attestation>(&attest_key)
        .ok_or(Error::AttestationNotFound)?;

    // Verify the revoker is the original attester
    if attestation.attester != revoker {
        return Err(Error::NotAuthorized);
    }

    // Verify the attestation isn't already revoked
    if attestation.revoked {
        return Err(Error::AlreadyRevoked);
    }

    // Verify schema is revocable
    let schema = utils::get_schema(env, &attestation.schema_uid).ok_or(Error::SchemaNotFound)?;
    if !schema.revocable {
        return Err(Error::AttestationNotRevocable);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ► RESOLVER INTEGRATION: Before Revoke Hook
    // ═══════════════════════════════════════════════════════════════════════════

    // Call resolver onrevoke hook if schema has a resolver
    if let Some(resolver_address) = &schema.resolver {
        // Create resolver attestation format
        let resolver_attestation = create_resolver_attestation(
            env,
            &attestation,
            &attestation.schema_uid,
            schema.revocable,
        );

        // Call onrevoke hook - this is CRITICAL for access control
        let allowed = call_resolver_onrevoke(env, resolver_address, &resolver_attestation)?;

        if !allowed {
            return Err(Error::ResolverError); // Resolver rejected the revocation
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // ► CORE PROTOCOL: Update Attestation
    // ═══════════════════════════════════════════════════════════════════════════

    // Update attestation
    attestation.revoked = true;
    attestation.revocation_time = Some(env.ledger().timestamp());

    // Store updated attestation
    env.storage().persistent().set(&attest_key, &attestation);

    // ═══════════════════════════════════════════════════════════════════════════
    // ► RESOLVER INTEGRATION: After Revoke Hook
    // ═══════════════════════════════════════════════════════════════════════════

    // Call resolver onresolve hook if schema has a resolver
    if let Some(resolver_address) = &schema.resolver {
        // Create resolver attestation format with updated revocation status
        let resolver_attestation = create_resolver_attestation(
            env,
            &attestation,
            &attestation.schema_uid,
            schema.revocable,
        );

        // Call onresolve hook for side effects (cleanup, notifications, etc.)
        // Note: Failures here don't revert the revocation
        call_resolver_onresolve(env, resolver_address, &resolver_attestation);
    }

    // Emit revocation event
    events::publish_revocation_event(env, &attestation);

    Ok(())
}
