/**
 * BLS (Boneh-Lynn-Shacham) Cryptography Utilities
 *
 * Functions for BLS key generation, signing, and verification
 * using the BLS12-381 curve for delegated attestations.
 * @packageDocumentation
 */

import { bls12_381 } from '@noble/curves/bls12-381.js'
import { VerificationResult, BlsKeyPair } from '../types'
import { WeierstrassPoint } from '@noble/curves/abstract/weierstrass.js'

/**
 * The core BLS pairing curve we support is short signatures.
 * @internal
 */
const curve = bls12_381.shortSignatures

/**
 * @internal
 */
type VerifyAggregateSignatureParams = {
  message: Buffer
  publicKey: Buffer
}

/**
 * Generate a new BLS key pair for delegation.
 *
 * @returns {BlsKeyPair} A BLS key pair with uncompressed public key (192 bytes) and private key (32 bytes).
 * @example
 * ```typescript
 * const { privateKey, publicKey } = generateBlsKeys();
 * ```
 */
export function generateBlsKeys(): BlsKeyPair {
  const { secretKey, publicKey } = curve.keygen()
  return {
    privateKey: Buffer.from(secretKey),
    publicKey: Buffer.from(publicKey.toBytes(false)),
  }
}

/**
 * Sign a hashed message with a BLS private key.
 * The message should be pre-hashed and mapped to a point on the curve.
 *
 * @param {WeierstrassPoint<bigint>} message - The message to sign (as a point on the G1 curve).
 * @param {Uint8Array} privateKey - The BLS private key.
 * @returns {Buffer} The signature as a Buffer.
 * @see {@link createAttestationMessage}
 * @see {@link createRevocationMessage}
 * @example
 * ```typescript
 * import { createAttestationMessage } from 'common/utils';
 *
 * const { privateKey } = generateBlsKeys();
 * const attestationData = {
 *   schemaId: 'schema123',
 *   recipient: 'GABCDEF...',
 *   data: Buffer.from('attestation data')
 * };
 *
 * // Generate the message point using createAttestationMessage
 * const messagePoint = createAttestationMessage(attestationData);
 * const signature = signHashedMessage(messagePoint, privateKey);
 * console.log('Signature:', signature.toString('hex'));
 * ```
 */
export function signHashedMessage(message: WeierstrassPoint<bigint>, privateKey: Uint8Array): Buffer {
  const signature = curve.sign(message, privateKey)
  return Buffer.from(signature.toBytes(false))
}

/**
 * Validate that a buffer is a syntactically valid BLS12-381 G1 point.
 *
 * This is a pure format check — it does NOT prove a signature was produced
 * by any specific key over any specific message. Callers must use
 * {@link verifySignature} (with an expectedMessage) for authenticity.
 *
 * @param {Buffer} signature - Candidate signature bytes.
 * @returns {boolean} `true` if the bytes parse as a G1 point, otherwise `false`.
 */
export function validateG1PointFormat(signature: Buffer): boolean {
  try {
    bls12_381.G1.Point.fromHex(signature.toString('hex'))
    return true
  } catch {
    return false
  }
}

/**
 * Verify a BLS signature against a given message and public key.
 *
 * `expectedMessage` is REQUIRED. Calling this without an expected message
 * point cannot establish authenticity, so the function returns
 * `{ isValid: false }` rather than silently succeeding on a format check.
 * For a pure format check, use {@link validateG1PointFormat}.
 *
 * @param {Buffer} signature - The signature to verify.
 * @param {WeierstrassPoint<bigint>} expectedMessage - The hashed message that is to be verified.
 * @param {Buffer} publicKey - The BLS public key (192 bytes uncompressed).
 * @returns {VerificationResult} An object containing the validity status and optional metadata.
 */
export function verifySignature(params: {
  signature: Buffer
  expectedMessage: WeierstrassPoint<bigint>
  publicKey: Buffer
}): VerificationResult
export function verifySignature({
  signature,
  expectedMessage,
  publicKey,
}: {
  signature: Buffer
  expectedMessage: WeierstrassPoint<bigint>
  publicKey: Buffer
}): VerificationResult {
  if (!expectedMessage) {
    return { isValid: false }
  }

  try {
    const isValid = curve.verify(signature, expectedMessage, publicKey)

    return {
      isValid,
      metadata: isValid
        ? {
            originalMessage: Buffer.from(expectedMessage.toBytes(false)),
            inputs: {},
          }
        : undefined,
    }
  } catch {
    return { isValid: false }
  }
}

/**
 * Aggregate multiple BLS signatures into a single signature.
 * All signatures must be for distinct messages from distinct signers.
 *
 * @param {Buffer[]} signatures - An array of signatures to aggregate.
 * @returns {Buffer} The single aggregated signature.
 * @throws {Error} If the signatures array is empty.
 * @example
 * ```typescript
 * // Assuming signature1, signature2 are valid BLS signatures
 * const aggregatedSignature = aggregateSignatures([signature1, signature2]);
 * ```
 */
export function aggregateSignatures(signatures: Buffer[]): Buffer {
  if (signatures.length === 0) {
    throw new Error('Cannot aggregate empty signature array')
  }

  const aggregated = curve.aggregateSignatures(signatures)
  return Buffer.from(aggregated.toBytes(false))
}

/**
 * Aggregate multiple BLS public keys into a single public key.
 *
 * @param {Buffer[]} publicKeys - An array of public keys to aggregate.
 * @returns {Buffer} The single aggregated public key.
 * @throws {Error} If the publicKeys array is empty.
 * @example
 * ```typescript
 * const { publicKey: pk1 } = generateBlsKeys();
 * const { publicKey: pk2 } = generateBlsKeys();
 * const aggregatedPublicKey = aggregatePublicKeys([Buffer.from(pk1), Buffer.from(pk2)]);
 * ```
 */
export function aggregatePublicKeys(publicKeys: Buffer[]): Buffer {
  if (publicKeys.length === 0) {
    throw new Error('Cannot aggregate empty public key array')
  }

  const points = publicKeys.map((pk) => bls12_381.G2.Point.fromHex(pk.toString('hex')))

  let aggregated = points[0]
  for (let i = 1; i < points.length; i++) {
    aggregated = aggregated.add(points[i])
  }
  return Buffer.from(aggregated.toBytes(false))
}

/**
 * Verify an aggregated signature against multiple messages and public keys.
 * This is used for batch verification, which is more efficient than verifying signatures one by one.
 *
 * @param {Buffer} aggregatedSignature - The aggregated signature.
 * @param {VerifyAggregateSignatureParams[]} params - An array of message-publicKey pairs.
 * @returns {boolean} `true` if the aggregated signature is valid, otherwise `false`.
 * @example
 * ```typescript
 * // Assuming you have an aggregated signature, and arrays of messages and public keys
 * const isValid = verifyAggregateSignature(aggregatedSig, [
 *   { message: msg1, publicKey: pk1 },
 *   { message: msg2, publicKey: pk2 },
 * ]);
 * console.log('Is aggregate signature valid?', isValid);
 * ```
 */
export function verifyAggregateSignature(
  aggregatedSignature: Buffer,
  params: VerifyAggregateSignatureParams[]
): boolean {
  const paramsArray = params.map((param) => ({
    message: bls12_381.G1.Point.fromHex(param.message.toString('hex')),
    publicKey: bls12_381.G2.Point.fromHex(param.publicKey.toString('hex')),
  }))
  try {
    return curve.verifyBatch(aggregatedSignature, paramsArray)
  } catch {
    return false
  }
}

/**
 * Convert a BLS public key from compressed to uncompressed format.
 *
 * @param {Buffer} compressedKey - The compressed public key (96 bytes on G2).
 * @returns {Uint8Array} The uncompressed public key (192 bytes on G2).
 * @throws {Error} if the compressed key is not 96 bytes.
 * @example
 * ```typescript
 * const { publicKey } = generateBlsKeys(); // uncompressed
 * const compressed = compressPublicKey(Buffer.from(publicKey));
 * const decompressed = decompressPublicKey(Buffer.from(compressed));
 * console.log(Buffer.from(publicKey).equals(Buffer.from(decompressed))); // true
 * ```
 */
export function decompressPublicKey(compressedKey: Buffer): Uint8Array {
  if (compressedKey.length !== 96) {
    throw new Error('Compressed G2 public key must be 96 bytes')
  }

  const point = bls12_381.G2.Point.fromHex(compressedKey.toString('hex'))
  return point.toBytes(false)
}

/**
 * Convert a BLS public key from uncompressed to compressed format.
 *
 * @param {Buffer} uncompressedKey - The uncompressed public key (192 bytes on G2).
 * @returns {Uint8Array} The compressed public key (96 bytes on G2).
 * @throws {Error} if the uncompressed key is not 192 bytes.
 * @example
 * ```typescript
 * const { publicKey } = generateBlsKeys(); // uncompressed by default
 * const compressedKey = compressPublicKey(Buffer.from(publicKey));
 * console.log('Compressed key length:', compressedKey.length); // 96
 * ```
 */
export function compressPublicKey(uncompressedKey: Buffer): Uint8Array {
  if (uncompressedKey.length !== 192) {
    throw new Error('Uncompressed G2 public key must be 192 bytes')
  }

  const point = bls12_381.G2.Point.fromHex(uncompressedKey.toString('hex'))
  return point.toBytes(true)
}
