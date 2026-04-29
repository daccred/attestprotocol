use crate::state::{Authority, DataKey, Schema};
use soroban_sdk::xdr::ToXdr;
use soroban_sdk::{Address, Bytes, BytesN, Env, String};

////////////////////////////////////////////////////////////////////////////////////
/// Generates a unique identifier (SHA256 hash) for a schema.
////////////////////////////////////////////////////////////////////////////////////
/// The UID is derived from the schema definition, the registering authority,
/// the optional resolver address, and the `revocable` flag.
///
/// Including `revocable` in the hash input is required (C-CONTRACT-3): without
/// it, two registrations with the same `(definition, authority, resolver)` but
/// different `revocable` settings collide on the same UID. The second
/// registration would then be rejected by the `SchemaAlreadyExists` guard,
/// preventing an authority from publishing parallel revocable / non-revocable
/// variants of the same schema.
///
/// Wire layout (concatenated, then sha256-hashed):
/// 1. XDR-encoded schema_definition string
/// 2. XDR-encoded authority address
/// 3. XDR-encoded resolver address (only if `Some`)
/// 4. `revocable` as a single byte: `0x01` if true, `0x00` otherwise
///
/// # Off-chain parity (W5)
/// `packages/stellar-sdk/src/utils/uidGenerator.ts:generateSchemaUid` must
/// append the `revocable` byte after the resolver bytes, before hashing. Until
/// that helper is updated, off-chain UIDs will diverge from on-chain UIDs.
///
/// # Arguments
/// * `env` - The Soroban environment providing access to cryptographic functions.
/// * `schema_definition` - The schema definition string (supports multiple formats).
/// * `authority` - The address of the authority registering the schema.
/// * `resolver` - An optional address of a resolver contract associated with the schema.
/// * `revocable` - Whether attestations under this schema may be revoked.
///
/// # Returns
/// * `BytesN<32>` - The unique 32-byte identifier (UID) for the schema.
///
pub fn generate_schema_uid(
    env: &Env,
    schema_definition: &String,
    authority: &Address,
    resolver: &Option<Address>,
    revocable: bool,
) -> BytesN<32> {
    let mut schema_data_to_hash = Bytes::new(env);
    schema_data_to_hash.append(&schema_definition.clone().to_xdr(env));
    schema_data_to_hash.append(&authority.clone().to_xdr(env));
    if let Some(resolver_addr) = resolver {
        schema_data_to_hash.append(&resolver_addr.clone().to_xdr(env));
    }
    // C-CONTRACT-3: revocable participates in identity. 0x01 if true, else 0x00.
    schema_data_to_hash.append(&Bytes::from_array(env, &[revocable as u8]));
    env.crypto().sha256(&schema_data_to_hash).into()
}
////////////////////////////////////////////////////////////////////////////////////
/// Generates a unique identifier (Keccak256 hash) for an attestation.
////////////////////////////////////////////////////////////////////////////////////
/// The UID is derived from a versioned domain prefix, the contract deployment
/// address, schema UID, subject, attester, and nonce. Including the contract
/// address prevents cross-deployment UID collisions, and including the attester
/// prevents two distinct attesters from producing the same UID for the same
/// (schema, subject, nonce) tuple.
///
/// Wire layout (concatenated, then keccak256-hashed):
/// 1. `b"ATTEST_UID_V1"` — domain separation prefix
/// 2. XDR-encoded current contract address
/// 3. XDR-encoded schema_uid
/// 4. XDR-encoded subject address
/// 5. XDR-encoded attester address
/// 6. nonce as 8 big-endian bytes
///
/// # Arguments
/// * `env` - The Soroban environment providing access to cryptographic functions.
/// * `schema_uid` - The 32-byte unique identifier of the schema this attestation uses.
/// * `subject` - The address that is the subject of the attestation.
/// * `attester` - The address that authored the attestation. Required to prevent
///   collisions when two distinct attesters target the same subject/nonce (HAL-01).
/// * `nonce` - The sequential nonce ensuring uniqueness for multiple attestations.
///
/// # Returns
/// * `BytesN<32>` - The unique 32-byte identifier (UID) for the attestation.
///
/// # Off-chain parity (W5)
/// The TypeScript helper `packages/stellar-sdk/src/utils/uidGenerator.ts:generateAttestationUid`
/// must construct the identical byte sequence (prefix || contractXdr || schemaUidXdr ||
/// subjectXdr || attesterXdr || nonce_be_8bytes) and hash with keccak256.
///
/// # Example
/// ```ignore
/// let attestation_uid = generate_attestation_uid(
///     &env,
///     &schema_uid,
///     &subject_address,
///     &attester_address,
///     nonce
/// );
/// ```
pub fn generate_attestation_uid(
    env: &Env,
    schema_uid: &BytesN<32>,
    subject: &Address,
    attester: &Address,
    nonce: u64,
) -> BytesN<32> {
    let mut hash_input = Bytes::new(env);

    // 1. Domain separation prefix — versioned to allow future formula upgrades.
    hash_input.extend_from_slice(b"ATTEST_UID_V1");

    // 2. Contract address binding — prevents UID reuse across deployments.
    hash_input.append(&env.current_contract_address().clone().to_xdr(env));

    // 3. Schema UID.
    hash_input.append(&schema_uid.clone().to_xdr(env));

    // 4. Subject.
    hash_input.append(&subject.clone().to_xdr(env));

    // 5. Attester — closes the HAL-01 collision where two distinct attesters
    //    produced identical UIDs for the same (schema, subject, nonce).
    hash_input.append(&attester.clone().to_xdr(env));

    // 6. Nonce in big-endian for cross-platform parity with the SDK.
    let nonce_bytes = nonce.to_be_bytes();
    hash_input.extend_from_array(&nonce_bytes);

    env.crypto().keccak256(&hash_input).into()
}

/// Retrieves an authority record by address.
///
/// **DEPRECATED**: This function is being deprecated in favor of the authority resolver
/// which is implemented as a separate contract outside of this protocol contract.
/// New implementations should use the authority resolver contract for authority
/// management and validation.
///
/// # Arguments
/// * `env` - The Soroban environment providing access to storage operations
/// * `address` - The address of the authority to retrieve
///
/// # Returns
/// * `Option<Authority>` - The `Authority` record if found, otherwise `None`
///
/// # Example
/// ```ignore
/// if let Some(authority) = _get_authority(&env, &authority_address) {
///     // Authority exists, can proceed with operations
/// } else {
///     // Authority not found, handle accordingly
/// }
/// ```
pub fn _get_authority(env: &Env, address: &Address) -> Option<Authority> {
    let key = DataKey::Authority(address.clone());
    env.storage().instance().get(&key)
}

/// Retrieves a schema record by its unique identifier (UID).
///
/// # Arguments
/// * `env` - The Soroban environment.
/// * `schema_uid` - The 32-byte unique identifier of the schema to retrieve.
///
/// # Returns
/// * `Option<Schema>` - The `Schema` record if found, otherwise None.
///
/// # Example
/// ```ignore
/// if let Some(schema) = get_schema(&env, &schema_uid) {
///     // Schema exists, use it
/// } else {
///     // Schema not found
/// }
/// ```
pub fn get_schema(env: &Env, schema_uid: &BytesN<32>) -> Option<Schema> {
    let key = DataKey::Schema(schema_uid.clone());
    env.storage().instance().get(&key)
}

/// Gets the next nonce for an attester.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `attester` - The address of the attester
///
/// # Returns
/// * `u64` - The next nonce to be used
pub fn get_next_nonce(env: &Env, attester: &Address) -> u64 {
    let nonce_key = DataKey::AttesterNonce(attester.clone());
    env.storage().persistent().get::<DataKey, u64>(&nonce_key).unwrap_or(0)
}

/// Creates a deterministic XDR-prefixed string from a Soroban string value.
///
/// This utility function takes a Soroban string, converts it to XDR bytes,
/// hashes those bytes using SHA256, and encodes the full hash as a hexadecimal
/// string prefixed with "XDR:". This produces a unique 68-character string
/// (4 prefix + 64 hex characters) that can be used as a deterministic identifier.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `value` - A Soroban string value to process
///
/// # Returns
/// * `String` - A Soroban string in format "XDR:{64-char-hex-hash}"
///
/// # Collision Resistance
/// Uses the full 256-bit SHA256 hash encoded as hex, providing cryptographic
/// collision resistance. The probability of collision is negligible (2^-128).
///
/// # Example
/// ```ignore
/// let some_string = String::from_str(&env, "hello world");
/// let xdr_string = create_xdr_string(&env, &some_string);
/// // Returns "XDR:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
/// ```
pub fn create_xdr_string(env: &Env, value: &String) -> String {
    // Convert the input string to XDR bytes
    let xdr_bytes = value.clone().to_xdr(env);

    // Hash the XDR bytes using SHA256 to create a deterministic identifier
    let hash: BytesN<32> = env.crypto().sha256(&xdr_bytes).into();
    let hash_array = hash.to_array();

    // Hex lookup table for efficient conversion
    const HEX_CHARS: &[u8; 16] = b"0123456789abcdef";

    // Build the result: "XDR:" prefix (4 bytes) + 64 hex characters = 68 bytes
    let mut result_str = [0u8; 68];
    result_str[0] = b'X';
    result_str[1] = b'D';
    result_str[2] = b'R';
    result_str[3] = b':';

    // Convert each byte of the hash to two hex characters
    for i in 0..32 {
        let byte = hash_array[i];
        result_str[4 + i * 2] = HEX_CHARS[(byte >> 4) as usize];
        result_str[4 + i * 2 + 1] = HEX_CHARS[(byte & 0x0f) as usize];
    }

    String::from_bytes(env, &result_str)
}
