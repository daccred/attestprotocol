/*
==========================================================================================
    JavaScript & Off-Chain Integration Guide for BLS12-381 Signatures
==========================================================================================

This guide provides the necessary details for off-chain clients (wallets, backend services)
to correctly generate BLS12-381 signatures that are compatible with this contract's
on-chain verification logic.

------------------------------------------------------------------------------------------
    Key Concepts
------------------------------------------------------------------------------------------
- **Attester Signs, Not Subject**: Only the attester (the entity making a claim) needs
  to generate a signature. The subject of an attestation never interacts with the blockchain.
- **Delegated Submission**: The attester signs a request off-chain. Anyone can then take
  this signed request and submit it to the contract, paying the gas fees.
- **Key & Signature Formats (CRITICAL)**:
  - **Public Key**: Must be a **192-byte UNCOMPRESSED** G2 curve point.
  - **Signature**: Must be a **96-byte UNCOMPRESSED** G1 curve point. The Soroban
    host environment requires the uncompressed format for verification.

------------------------------------------------------------------------------------------
    Example: Signature Generation with @noble/curves (JavaScript/TypeScript)
------------------------------------------------------------------------------------------

```javascript
import { bls12_381 } from '@noble/curves/bls12-381.js';
import { sha256 } from '@noble/hashes/sha256.js';

// 1. Attester generates their keypair (done once).
const attesterPrivateKey = bls12_381.utils.randomPrivateKey();

// 2. Get the public key in the required 192-BYTE UNCOMPRESSED format.
const attesterPublicKey = bls12_381.G2.ProjectivePoint.fromPrivateKey(attesterBlsPrivateKey).toRawBytes(false);

// 3. Construct the exact message hash that the contract expects.
//    (See `create_attestation_message` in delegation.rs for the full implementation)
function createMessageHash(request) {
    const domainSeparator = new TextEncoder().encode("ATTEST_PROTOCOL_V1_DELEGATED");

    // Ensure all data is in the correct byte format
    const schemaBytes = new Uint8Array(request.schema_uid); // Should be 32 bytes
    const nonceBytes = new DataView(new ArrayBuffer(8));
    nonceBytes.setBigUint64(0, BigInt(request.nonce), false); // false for big-endian

    const deadlineBytes = new DataView(new ArrayBuffer(8));
    deadlineBytes.setBigUint64(0, BigInt(request.deadline), false);

    const valueBytes = new TextEncoder().encode(request.value);
    const valueLenBytes = new DataView(new ArrayBuffer(8));
    valueLenBytes.setBigUint64(0, BigInt(valueBytes.length), false);

    // Concatenate all fields in the exact order the contract expects.
    const messageParts = [
        domainSeparator,
        schemaBytes,
        new Uint8Array(nonceBytes.buffer),
        new Uint8Array(deadlineBytes.buffer),
    ];

    // Handle optional expiration_time
    if (request.expiration_time) {
        const expBytes = new DataView(new ArrayBuffer(8));
        expBytes.setBigUint64(0, BigInt(request.expiration_time), false);
        messageParts.push(new Uint8Array(expBytes.buffer));
    }

    messageParts.push(new Uint8Array(valueLenBytes.buffer));

    // A simple way to concatenate Uint8Arrays
    const message = new Uint8Array(messageParts.reduce((acc, val) => [...acc, ...val], []));

    return sha256(message);
}

// 4. Attester signs the message hash.
const messageHash = createMessageHash(attestationRequest);
const signaturePoint = bls12_381.sign(messageHash, attesterPrivateKey);

// 5. CRITICAL: Serialize the signature to its UNCOMPRESSED format for the contract.
const signature = signaturePoint.toRawBytes(false); // -> 96-byte Uint8Array

// 6. The resulting 96-byte `signature` can now be submitted to the contract.
```

------------------------------------------------------------------------------------------
    Domain Separation Tags (DSTs)
------------------------------------------------------------------------------------------
- **Attestation Message Prefix**: "ATTEST_PROTOCOL_V1_DELEGATED"
- **Revocation Message Prefix**: "REVOKE_PROTOCOL_V1_DELEGATED"
- **On-chain `hash_to_g1` DST**: "BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_"

------------------------------------------------------------------------------------------
    References
------------------------------------------------------------------------------------------
- **CAP-0059**: Stellar BLS12-381 Host Functions specification
  https://github.com/stellar/stellar-protocol/blob/master/core/cap-0059.md

*/
use crate::errors::Error;
use crate::state::{BlsPublicKey, DataKey};
use soroban_sdk::{
    crypto::bls12_381::{Bls12381G1Affine, Bls12381G2Affine},
    Address, Bytes, BytesN, Env, Vec,
};

/// Attest Protocol domain separation tag for BLS G1 signature hashing.
/// This is the standard DST for BLS signatures over G1.
const ATTEST_PROTOCOL_BLS_G1_DST: &[u8] = b"BLS_SIG_BLS12381G1_XMD:SHA-256_SSWU_RO_NUL_";

/// The uncompressed G2 generator point for the BLS12-381 curve. This is a standard,
/// well-known constant. It's the point against which signatures are verified.
///
/// Reference: https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-bls-signature-05#section-4.2.1
///
const G2_GENERATOR: [u8; 192] = [
    19, 224, 43, 96, 82, 113, 159, 96, 125, 172, 211, 160, 136, 39, 79, 101, 89, 107, 208, 208, 153, 32, 182, 26, 181,
    218, 97, 187, 220, 127, 80, 73, 51, 76, 241, 18, 19, 148, 93, 87, 229, 172, 125, 5, 93, 4, 43, 126, 2, 74, 162,
    178, 240, 143, 10, 145, 38, 8, 5, 39, 45, 197, 16, 81, 198, 228, 122, 212, 250, 64, 59, 2, 180, 81, 11, 100, 122,
    227, 209, 119, 11, 172, 3, 38, 168, 5, 187, 239, 212, 128, 86, 200, 193, 33, 189, 184, 6, 6, 196, 160, 46, 167, 52,
    204, 50, 172, 210, 176, 43, 194, 139, 153, 203, 62, 40, 126, 133, 167, 99, 175, 38, 116, 146, 171, 87, 46, 153,
    171, 63, 55, 13, 39, 92, 236, 29, 161, 170, 169, 7, 95, 240, 95, 121, 190, 12, 229, 213, 39, 114, 125, 110, 17,
    140, 201, 205, 198, 218, 46, 53, 26, 173, 253, 155, 170, 140, 189, 211, 167, 109, 66, 154, 105, 81, 96, 209, 44,
    146, 58, 201, 204, 59, 172, 162, 137, 225, 147, 84, 134, 8, 184, 40, 1,
];

// =======================================================================================
//
//                      BLS12-381 POINT VALIDATION
//
// =======================================================================================
//
// Every caller-supplied curve point is validated in two stages before it is
// used in a pairing.
//
// Stage 1 — encoding. For an uncompressed BLS12-381 point, byte 0 carries
// three flags in its top bits:
//   - bit 7 (0x80): compression flag — must be 0 for an uncompressed point
//   - bit 6 (0x40): infinity  flag — must be 0; the identity is neither a
//                                     valid public key nor a valid signature
//   - bit 5 (0x20): sort      flag — meaningful only when compressed, so 0
// `(byte_0 & 0xC0) != 0` is an O(1) gate that rejects compressed blobs,
// identity encodings and zero-padded blobs with the wrong flags, returning
// `Err(Error::InvalidSignaturePoint)`.
//
// Stage 2 — geometry. `from_bytes` performs no validation of its own: it
// reinterprets the bytes as field coordinates. The host's on-curve and
// subgroup predicates then reject points that are off the curve or in the
// wrong subgroup, again as `Err(Error::InvalidSignaturePoint)`. Both stages return a structured error
// rather than aborting, so a bad point costs the submitter a failed
// invocation instead of a trap.

/// Validates the structural flag byte of an uncompressed G1 point (96 bytes).
///
/// Checks that bit 7 (compression) and bit 6 (infinity) of byte 0 are both 0.
/// Returns `Err(Error::InvalidSignaturePoint)` if either flag is set.
///
/// This covers the encoding only. On-curve and subgroup membership are
/// checked separately by the host, after `from_bytes`.
fn validate_g1_point_bytes(bytes: &BytesN<96>) -> Result<(), Error> {
    // BytesN<96> is structurally guaranteed to be exactly 96 bytes long, so
    // index 0 is always in-bounds. `get_unchecked` returns the raw u8 byte.
    let b = bytes.get_unchecked(0);
    if (b & 0xC0) != 0 {
        return Err(Error::InvalidSignaturePoint);
    }
    Ok(())
}

/// Validates the structural flag byte of an uncompressed G2 point (192 bytes).
///
/// Same flag-bit semantics as [`validate_g1_point_bytes`]; geometry is
/// likewise checked separately by the host.
fn validate_g2_point_bytes(bytes: &BytesN<192>) -> Result<(), Error> {
    let b = bytes.get_unchecked(0);
    if (b & 0xC0) != 0 {
        return Err(Error::InvalidSignaturePoint);
    }
    Ok(())
}

/// Registers a BLS public key for an attester.
///
/// Each wallet address can register exactly one BLS public key.
/// Once registered, the key is immutable - cannot be updated or revoked.
/// To use a different key, use a different wallet address.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `attester` - The address of the attester registering the key
/// * `public_key` - The BLS12-381 G2 public key (192 bytes uncompressed)
///
/// # Returns
/// * `Result<(), Error>` - Success or error (fails if key already exists or is invalid)
///
/// # Security
/// The public key must be a well-encoded, on-curve G2 point in the correct
/// subgroup. A malformed encoding (compression or infinity flag set), a point
/// off the curve, or a point outside the subgroup all return
/// `Err(Error::InvalidSignaturePoint)`. Only a fully validated key is stored,
/// so signature verification never has to re-check it.
pub fn register_bls_public_key(env: &Env, attester: Address, public_key: BytesN<192>) -> Result<(), Error> {
    attester.require_auth();

    let pk_key = DataKey::AttesterPublicKey(attester.clone());

    // Check if this address already has a key registered
    if env.storage().persistent().has(&pk_key) {
        // Key already registered - immutable, cannot update
        return Err(Error::AlreadyInitialized);
    }

    // Encoding check: rejects compressed blobs, infinity encodings and
    // zero-padded blobs with the wrong flag byte.
    validate_g2_point_bytes(&public_key)?;

    // Geometry check: `from_bytes` only reinterprets the bytes as field
    // coordinates, so the host verifies on-curve and subgroup membership.
    let pk_point = Bls12381G2Affine::from_bytes(public_key.clone());
    let bls = env.crypto().bls12_381();
    if !bls.g2_is_on_curve(&pk_point) || !bls.g2_is_in_subgroup(&pk_point) {
        return Err(Error::InvalidSignaturePoint);
    }

    let timestamp = env.ledger().timestamp();
    let bls_key = BlsPublicKey {
        key: public_key.clone(),
        registered_at: timestamp,
    };

    env.storage().persistent().set(&pk_key, &bls_key);
    crate::events::publish_bls_key_registered(env, &attester, &public_key, timestamp);

    Ok(())
}

/// Gets the BLS public key for an attester.
///
/// # Arguments
/// * `env` - The Soroban environment
/// * `attester` - The address of the attester
///
/// # Returns
/// * `Option<BlsPublicKey>` - The public key if registered
pub fn get_bls_public_key(env: &Env, attester: &Address) -> Result<BlsPublicKey, Error> {
    let pk_key = DataKey::AttesterPublicKey(attester.clone());
    env.storage()
        .persistent()
        .get::<DataKey, BlsPublicKey>(&pk_key)
        .ok_or(Error::BlsPubKeyNotRegistered)
}

/// **CRITICAL CRYPTOGRAPHIC FUNCTION**: Verifies a BLS12-381 signature using a pairing check.
///
/// This is the core security function that validates signatures created off-chain for delegated
/// actions. It implements the BLS signature verification algorithm using an elliptic curve
/// pairing to prove that the attester's private key was used to sign the specific message hash.
/// This is the primary defense against unauthorized or forged delegated attestations.
///
/// # BLS Scheme: Minimal-Signature-Size
/// This contract implements the most common BLS signature scheme, which optimizes for the smallest
/// possible signature size.
/// - **Signature**: A point on the G1 curve (96 bytes compressed).
/// - **Public Key**: A point on the G2 curve (192 bytes uncompressed).
///
/// The verification is based on the BLS pairing equation `e(S, g2) == e(H(m), P)`, where `e`
/// is the pairing, `S` is the signature, `g2` is the G2 generator, `H(m)` is the message hash
/// on G1, and `P` is the public key on G2. This is checked efficiently using the rearranged
/// form `e(S, g2) * e(-H(m), P) == 1` via the `pairing_check` host function.
///
/// # Security Properties
/// - **Unforgeability**: Computationally infeasible to create a valid signature without the private key.
/// - **Message Binding**: The signature is cryptographically bound to the exact message hash.
/// - **Key Registration**: Verification is tied to a specific attester address via their
///   registered public key, preventing key substitution attacks.
/// - **Domain Separation**: The `hash_to_g1` operation uses a standard Domain Separation Tag (DST)
///   to ensure that a signature for this contract cannot be replayed in a different protocol.
///
/// # Parameters
/// * `env` - The Soroban environment for cryptographic host functions.
/// * `message` - The SHA256 hash of the signed message payload (32 bytes).
/// * `signature` - The BLS12-381 signature, as a 96-byte compressed point on the G1 curve.
/// * `attester` - The wallet address of the original signer, used to look up their registered
///   192-byte uncompressed G2 public key.
///
/// # Returns
/// * `Ok(())` if the signature is cryptographically valid for the given message and attester.
/// * `Err(Error::InvalidSignature)` if the pairing check fails (signature doesn't match).
/// * `Err(Error::InvalidSignaturePoint)` if the signature bytes have invalid encoding flags
///   (compression bit set, or infinity bit set on a non-identity point), or decode to a
///   point that is off the curve or outside the G1 subgroup.
/// * `Err(Error::BlsPubKeyNotRegistered)` if the attester has no registered key.
///
/// # Point validation
/// An invalid signature point is always a structured error, never a host abort: the
/// encoding is checked before decoding and the geometry after it. The registered public
/// key was validated the same way when it was stored, so it is not re-checked here.
///
/// # Cross-Platform Compatibility
/// This on-chain function is designed to verify signatures created by standard off-chain
/// libraries like `@noble/curves` in JavaScript.
///
/// ```javascript
/// // Off-chain signing logic:
/// const messageHash = new Uint8Array([...]); // 32 bytes
/// const signature = bls12_381.sign(messageHash, attesterPrivateKey); // 96-byte G1 point
/// // The `signature` is then submitted to the contract.
/// ```
pub fn verify_bls_signature(
    env: &Env,
    message: &BytesN<32>,
    signature: &BytesN<96>,
    attester: &Address,
) -> Result<(), Error> {
    let pk_key = DataKey::AttesterPublicKey(attester.clone());
    let bls_key = env
        .storage()
        .persistent()
        .get::<DataKey, BlsPublicKey>(&pk_key)
        .ok_or(Error::BlsPubKeyNotRegistered)?; // Fails if no key is registered.

    let hashed_message = env
        .crypto()
        .bls12_381()
        .hash_to_g1(&message.into(), &Bytes::from_slice(env, ATTEST_PROTOCOL_BLS_G1_DST));

    /*
     * STEP 1: Negate the message point for the pairing equation.
     * STEP 2: Deserialize the signature and public key into curve points.
     * The signature is a G1 point, and the public key is a G2 point.
     */
    let neg_hashed_message = -hashed_message;

    // Encoding check on the caller-supplied signature.
    validate_g1_point_bytes(signature)?;

    // Geometry check: `from_bytes` does not validate, so the host verifies the
    // decoded point is on the curve and in the G1 subgroup.
    let s = Bls12381G1Affine::from_bytes(signature.clone());
    let bls = env.crypto().bls12_381();
    if !bls.g1_is_on_curve(&s) || !bls.g1_is_in_subgroup(&s) {
        return Err(Error::InvalidSignaturePoint);
    }

    // The public key was fully validated when it was registered.
    let pk = Bls12381G2Affine::from_bytes(bls_key.key);

    /*
     * STEP 3: Prepare the points for the pairing check.
     * We are checking e(S, g2) * e(-H(m), P) == 1.
     */
    let g1_points = Vec::from_array(env, [s, neg_hashed_message]);

    let g2_generator = Bls12381G2Affine::from_bytes(BytesN::from_array(env, &G2_GENERATOR));

    let g2_points = Vec::from_array(env, [g2_generator, pk]);

    let is_valid = env.crypto().bls12_381().pairing_check(g1_points, g2_points);

    if is_valid {
        Ok(())
    } else {
        Err(Error::InvalidSignature)
    }
}
