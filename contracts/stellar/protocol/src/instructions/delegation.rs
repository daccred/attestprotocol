use crate::errors::Error;
use crate::events;
use crate::instructions::verify_bls_signature;
use crate::state::{Attestation, DataKey, DelegatedAttestationRequest, DelegatedRevocationRequest};
use crate::utils::{self, generate_attestation_uid};
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{Address, Bytes, BytesN, Env};

/// Domain separator for creating delegated attestation signatures.
/// This MUST be unique to prevent signature reuse in other contexts.
const ATTEST_DOMAIN_SEPARATOR: &[u8] = b"ATTEST_PROTOCOL_V1_DELEGATED";

/// Domain separator for creating delegated revocation signatures.
/// This MUST be unique and different from the attestation separator.
const REVOKE_DOMAIN_SEPARATOR: &[u8] = b"REVOKE_PROTOCOL_V1_DELEGATED";

/// Creates an attestation through delegated signature.
///
/// This function allows anyone to submit a pre-signed attestation request on-chain.
/// The original attester signs the attestation data off-chain, and any party can
/// submit it on-chain (paying the transaction fees).
///
/// Important: The BLS signature is created by the ATTESTER (the entity making
/// claims about subjects), not by the subject being attested. The subject never
/// needs to interact with the blockchain in this flow.
///
/// # Authorization
/// Requires authorization from the submitter (who pays fees), not the original attester.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `submitter` - The address submitting the transaction (pays fees)
/// * `request` - The delegated attestation request with signature
///
/// # Returns
/// * `Result<(), Error>` - Success or error
///
/// # Errors
/// * `Error::ExpiredSignature` - If the deadline has passed
/// * `Error::InvalidSignature` - If the signature verification fails
/// * `Error::BlsPubKeyNotRegistered` - If the BLS public key is not registered
/// * `Error::InvalidNonce` - If the nonce doesn't match expected value
/// * `Error::SchemaNotFound` - If the schema doesn't exist
pub fn attest_by_delegation(env: &Env, submitter: Address, request: DelegatedAttestationRequest) -> Result<(), Error> {
    submitter.require_auth();

    // Verify deadline hasn't passed
    let current_time = env.ledger().timestamp();
    if current_time > request.deadline {
        return Err(Error::ExpiredSignature);
    }

    // Verify schema exists
    let _schema = utils::get_schema(env, &request.schema_uid).ok_or(Error::SchemaNotFound)?;

    // Create message for signature verification
    let message = create_attestation_message(env, &request);

    // Enforce resolver
    let resolver_attestation = create_resolver_attestation(env, &request, &attester);

    if let Some(resolver) = _schema.resolver {
        let client = ResolverClient::new(env, &resolver);

        let allowed = client.onattest(&resolver_attestation);

        if !allowed {
            return Err(Error::ResolverRejected);
        }
    }

    // CRITICAL: Verify BLS12-381 signature BEFORE incrementing nonce.
    // If we increment nonce first, an attacker can submit invalid signatures
    // to permanently skip nonces, causing DoS on legitimate attesters.
    verify_bls_signature(env, &message, &request.signature, &request.attester)?;

    // Only increment nonce AFTER signature is verified to prevent DoS attacks
    verify_and_increment_nonce(env, &request.attester, request.nonce)?;

    let attestation_uid = generate_attestation_uid(env, &request.schema_uid, &request.subject, &request.attester, request.nonce);

    // Create attestation record
    let attestation = Attestation {
        uid: attestation_uid.clone(),
        schema_uid: request.schema_uid.clone(),
        subject: request.subject.clone(),
        attester: request.attester.clone(),
        value: request.value.clone(),
        nonce: request.nonce,
        timestamp: current_time,
        expiration_time: request.expiration_time,
        revoked: false,
        revocation_time: None,
    };

    // Store attestation
    let attest_key = DataKey::AttestationUID(attestation_uid);

    if env.storage().persisten().has(&key) {
        return Err(Error::UIDAlreadyExists);
    }

    env.storage().persistent().set(&attest_key, &attestation);

    if let Some(resolver) = _schema.resolver {
        let client = ResolverClient::new(env, &resolver);
        client.onresolve(&resolver_attestation);
    }

    // Emit event
    events::publish_attestation_event(env, &attestation);

    Ok(())
}

/// Revokes an attestation through delegated signature.
///
/// This function allows anyone to submit a pre-signed revocation request on-chain.
/// revocation also requires a signature from the original attester
/// to prevent unauthorized revocations.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `submitter` - The address submitting the transaction
/// * `request` - The delegated revocation request with signature
///
/// # Returns
/// * `Result<(), Error>` - Success or error
pub fn revoke_by_delegation(env: &Env, submitter: Address, request: DelegatedRevocationRequest) -> Result<(), Error> {
    submitter.require_auth();

    // Verify deadline hasn't passed
    let current_time = env.ledger().timestamp();
    if current_time > request.deadline {
        return Err(Error::ExpiredSignature);
    }

    // Get the attestation
    let attest_key = DataKey::AttestationUID(request.attestation_uid.clone());

    let mut attestation = env
        .storage()
        .persistent()
        .get::<DataKey, Attestation>(&attest_key)
        .ok_or(Error::AttestationNotFound)?;

    // Indicate if already revoked
    if attestation.revoked {
        return Err(Error::AlreadyRevoked)
    }

    // Verify the revoker is the original attester
    if attestation.attester != request.revoker {
        return Err(Error::NotAuthorized);
    }

    // CRITICAL: Verify the schema_uid in the request matches the attestation's actual schema.
    // This prevents an attacker from bypassing revocability by providing a different
    // revocable schema_uid while revoking an attestation from a non-revocable schema.
    if attestation.schema_uid != request.schema_uid {
        return Err(Error::InvalidReference);
    }

    // Verify schema is revocable
    let schema = utils::get_schema(env, &request.schema_uid).ok_or(Error::SchemaNotFound)?;
    if !schema.revocable {
        return Err(Error::AttestationNotRevocable);
    }

    let resolver_attestation = create_resolver_attestation(env, &request);

    if let Some(resolver) = schema.resolver {
        let client = ResolverClient::new(env, &resolver);

        let allowed = client.onrevoke(&resolver_attestation);

        if !allowed {
            return Err(Error::ResolverRejected);
        }
    }

    // Create message for signature verification
    let message = create_revocation_message(env, &request);

    // Verify BLS12-381 signature
    verify_bls_signature(env, &message, &request.signature, &request.revoker)?;

    // Update attestation
    attestation.revoked = true;
    attestation.revocation_time = Some(current_time);

    // Store updated attestation
    env.storage().persistent().set(&attest_key, &attestation);

    if let Some(resolver) = schema.resolver {
        let client = ResolverClient::new(env, &request);

        client.onresolve(&resolver_attestation);
    }

    // Emit revocation event
    events::publish_revocation_event(env, &attestation);

    Ok(())
}

/// Verifies and increments the nonce for an attester.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `attester` - The address of the attester
/// * `expected_nonce` - The expected nonce value
///
/// # Returns
/// * `Result<(), Error>` - Success or error
/// **CRITICAL SECURITY FUNCTION**: Verifies and increments the nonce for an attester
///
/// This function implements the core replay attack protection for delegated attestations.
/// Each attester has an independent nonce counter that MUST increment sequentially.
/// This prevents signature replay attacks and ensures attestation ordering.
///
/// # Security Model
/// - **Nonce Uniqueness**: Each attester has independent nonce sequence (0, 1, 2, ...)
/// - **Sequential Requirement**: Nonces must be used in exact order (no skipping)
/// - **One-Time Use**: Each nonce can only be used once per attester
/// - **Atomic Operation**: Verification and increment are atomic (either both succeed or both fail)
///
/// # Attack Prevention
/// - **Replay Attacks**: Same signature cannot be used twice
/// - **Nonce Skipping**: Cannot use future nonces to reserve slots
/// - **Parallel Processing**: Prevents race conditions in signature submission
/// - **Ordering Attacks**: Ensures attestations process in signed order
///
/// # Parameters
/// * `env` - Soroban environment for storage operations
/// * `attester` - Address whose nonce is being verified (original signer)
/// * `expected_nonce` - The nonce value from the signed request
///
/// # Returns
/// * `Ok(())` - Nonce verified and incremented successfully
/// * `Err(Error::InvalidNonce)` - Nonce doesn't match expected value (replay/skip attempt)
///
/// # Critical Invariants
/// 1. **Monotonic Increment**: Nonces always increase by exactly 1
/// 2. **No Rollback**: Once incremented, nonce cannot be reset or decreased
/// 3. **Per-Attester Isolation**: Different attesters have independent nonce sequences
/// 4. **Storage Consistency**: Nonce updates are persistent and atomic
///
/// # Attack Vectors & Mitigations
/// * **Signature Replay**: Using same signature multiple times
///   - *Mitigation*: Once nonce is used, it can never be used again
/// * **Nonce Front-Running**: Submitting signatures out of order
///   - *Mitigation*: Only exact next nonce is accepted
/// * **Parallel Submission**: Multiple parties submitting same signed request
///   - *Mitigation*: First submission wins, subsequent fail nonce check
/// * **Nonce Prediction**: Attempting to use future nonces
///   - *Mitigation*: Only current expected nonce accepted
///
/// # Implementation Notes
/// - Nonce starts at 0 for new attesters (first attestation uses nonce 0)
/// - Each successful verification increments nonce by exactly 1
/// - Failed verifications don't affect nonce state
/// - Storage operations are atomic (no partial state possible)
fn verify_and_increment_nonce(env: &Env, attester: &Address, expected_nonce: u64) -> Result<(), Error> {
    let nonce_key = DataKey::AttesterNonce(attester.clone());

    // Get current nonce (default to 0 for new attesters)
    // This creates the starting point for each attester's nonce sequence
    let current_nonce = env.storage().persistent().get::<DataKey, u64>(&nonce_key).unwrap_or(0);

    // CRITICAL SECURITY CHECK: Verify nonce matches expected value exactly
    // This prevents replay attacks and ensures sequential processing
    if current_nonce != expected_nonce {
        return Err(Error::InvalidNonce);
    }

    // ATOMIC OPERATION: Increment and store new nonce (using checked arithmetic to prevent overflow)
    // This ensures the nonce can never be used again
    let new_nonce = current_nonce.checked_add(1).ok_or(Error::IntegerOverflow)?;
    env.storage().persistent().set(&nonce_key, &new_nonce);

    Ok(())
}

/// **CRITICAL CRYPTOGRAPHIC FUNCTION**: Creates deterministic message for BLS signature verification
///
/// This function constructs the exact message that was signed off-chain by the attester.
/// The message construction MUST be deterministic and match exactly between:
/// 1. Off-chain signing (JavaScript/TypeScript with @noble/curves)
/// 2. On-chain verification (this Rust function)
/// Any mismatch will cause signature verification to fail.
///
/// # Cryptographic Security Model
/// - **Domain Separation**: Unique prefix prevents signature reuse across protocols
/// - **Deterministic Encoding**: Same inputs always produce same message hash
/// - **Field Ordering**: Fixed order prevents signature malleability
/// - **Type Safety**: Big-endian encoding ensures cross-platform consistency
///
/// # Message Structure
/// ```rust,ignore
/// Domain Separator: "ATTEST_PROTOCOL_V1_DELEGATED" (28 bytes)
/// Schema UID:       32 bytes
/// Subject Hash:     32 bytes (SHA256 of XDR-encoded subject address)
/// Nonce:            8 bytes (big-endian u64)
/// Deadline:         8 bytes (big-endian u64)
/// Expiration Time:  8 bytes (optional, big-endian u64)
/// Value Hash:       32 bytes (SHA256 of value content)
/// ```
///
/// # Cross-Platform Compatibility
/// This function's logic must be perfectly replicated by off-chain clients. The
/// signature submitted to the contract must be for the hash of this exact byte sequence.
/// The signature itself must be a 96-byte uncompressed G1 point.
///
/// # Parameters
/// * `env` - Soroban environment for crypto and data operations
/// * `request` - The delegated attestation request containing all signature data
///
/// # Returns
/// * `BytesN<32>` - SHA256 hash of the complete message (ready for BLS signature verification)
///
/// # Security Considerations
/// - **Immutable Structure**: Changing field order or encoding breaks compatibility
/// - **Domain Separation**: Prevents cross-protocol signature reuse attacks
/// - **Hash Finality**: Once hashed, message cannot be modified without detection
/// - **Deterministic Output**: Same request always produces same hash
///
/// # Attack Vectors & Mitigations
/// * **Message Malleability**: Changing field order to reuse signatures
///   - *Mitigation*: Fixed field order enforced in both platforms
/// * **Domain Confusion**: Reusing signatures from other protocols
///   - *Mitigation*: Unique domain separator prevents cross-protocol attacks
/// * **Encoding Attacks**: Different platforms producing different hashes
///   - *Mitigation*: Big-endian encoding standard across all platforms
/// * **Field Injection**: Adding extra fields to manipulate signature
///   - *Mitigation*: Complete field set defined and enforced
///
/// # Q/A Testing Focus
/// 1. **Cross-Platform Consistency**: Verify JavaScript and Rust produce identical hashes
/// 2. **Field Order Sensitivity**: Test that changing order breaks verification
/// 3. **Domain Separation**: Verify different domain separators produce different hashes
/// 4. **Edge Cases**: Test with optional fields present/absent
/// 5. **Encoding Validation**: Verify big-endian encoding consistency
pub fn create_attestation_message(env: &Env, request: &DelegatedAttestationRequest) -> BytesN<32> {
    let mut message = Bytes::new(env);

    // DOMAIN SEPARATION: Use the defined constant for clarity and safety.
    message.extend_from_slice(ATTEST_DOMAIN_SEPARATOR);

    // FIELD 1: Schema UID (32 bytes, deterministic order)
    message.extend_from_slice(&request.schema_uid.to_array());

    // FIELD 2: Subject (variable length, XDR serialized address)
    // CRITICAL: Binds the signature to the specific subject being attested.
    // Without this, an attacker could substitute any subject address.
    let subject_xdr = request.subject.clone().to_xdr(env);
    let subject_hash = env.crypto().sha256(&subject_xdr);
    message.extend_from_slice(&subject_hash.to_array());

    // FIELD 3: Nonce (8 bytes, big-endian for cross-platform consistency)
    // Big-endian ensures JavaScript/Rust produce identical byte sequences
    let nonce_bytes = request.nonce.to_be_bytes();
    message.extend_from_slice(&nonce_bytes);

    // FIELD 4: Deadline (8 bytes, big-endian)
    // Signature expiration time for temporal security
    let deadline_bytes = request.deadline.to_be_bytes();
    message.extend_from_slice(&deadline_bytes);

    // FIELD 5: Expiration Time (optional, 8 bytes if present)
    // Conditional inclusion must match JavaScript logic exactly
    if let Some(exp_time) = request.expiration_time {
        let exp_bytes = exp_time.to_be_bytes();
        message.extend_from_slice(&exp_bytes);
    }

    // FIELD 6: Value Hash (32 bytes, SHA256 of value content)
    // This ensures the exact value content is cryptographically bound to the signature.
    // Any modification to the value will invalidate the signature.
    let value_xdr = request.value.clone().to_xdr(env);
    let value_hash = env.crypto().sha256(&value_xdr);
    message.extend_from_slice(&value_hash.to_array());

    // CRYPTOGRAPHIC HASH: SHA256 of complete message
    // This hash is what gets signed by BLS private key off-chain
    env.crypto().sha256(&message).into()
}

/// Creates the message to be signed for revocation delegation.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `request` - The delegated revocation request
///
/// # Returns
/// * `BytesN<32>` - The hash of the message to be signed
///
/// # Message Structure
/// ```rust,ignore
/// Domain Separator:  "REVOKE_PROTOCOL_V1_DELEGATED" (28 bytes)
/// Schema UID:        32 bytes
/// Attestation UID:   32 bytes (binds signature to specific attestation)
/// Subject Hash:      32 bytes (SHA256 of XDR-encoded subject address)
/// Nonce:             8 bytes (big-endian u64)
/// Deadline:          8 bytes (big-endian u64)
/// ```
pub fn create_revocation_message(env: &Env, request: &DelegatedRevocationRequest) -> BytesN<32> {
    let mut message = Bytes::new(env);

    // DOMAIN SEPARATION: Use the defined constant.
    message.extend_from_slice(REVOKE_DOMAIN_SEPARATOR);

    // FIELD 1: Schema UID (32 bytes)
    message.extend_from_slice(&request.schema_uid.to_array());

    // FIELD 2: Attestation UID (32 bytes)
    // CRITICAL: Binds the signature to the specific attestation being revoked.
    // Without this, an attacker could reuse a revocation signature to revoke
    // any attestation under the same schema.
    message.extend_from_slice(&request.attestation_uid.to_array());

    // FIELD 3: Subject Hash (32 bytes, SHA256 of XDR-encoded subject address)
    // CRITICAL: Explicitly binds the signature to the attestation subject.
    // Defense in depth - even though attestation_uid includes subject, we
    // bind it explicitly for additional protection against collision attacks.
    let subject_xdr = request.subject.clone().to_xdr(env);
    let subject_hash = env.crypto().sha256(&subject_xdr);
    message.extend_from_slice(&subject_hash.to_array());

    // FIELD 4: Nonce (8 bytes, big-endian)
    let nonce_bytes = request.nonce.to_be_bytes();
    message.extend_from_slice(&nonce_bytes);

    // FIELD 5: Deadline (8 bytes, big-endian)
    let deadline_bytes = request.deadline.to_be_bytes();
    message.extend_from_slice(&deadline_bytes);

    // Return hash of the complete message
    env.crypto().sha256(&message).into()
}

/// Returns the domain separation tag used for creating delegated attestation signatures.
///
/// This is a public utility function for clients to ensure they are using the exact,
/// correct domain separator when constructing messages for off-chain signing.
///
/// # Returns
/// * `&[u8]` - The byte slice for the attestation domain separator.
pub fn get_attest_dst() -> &'static [u8] {
    ATTEST_DOMAIN_SEPARATOR
}

/// Returns the domain separation tag used for creating delegated revocation signatures.
///
/// This is a public utility function for clients to ensure they are using the exact,
/// correct domain separator when constructing messages for off-chain signing.
///
/// # Returns
/// * `&[u8]` - The byte slice for the revocation domain separator.
pub fn get_revoke_dst() -> &'static [u8] {
    REVOKE_DOMAIN_SEPARATOR
}
