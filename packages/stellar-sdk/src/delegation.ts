/**
 * Delegation Utilities
 *
 * Functions for creating and managing delegated attestations and revocations,
 * including message creation and domain separator tag retrieval.
 */

import { Client as ProtocolClient } from '@attestprotocol/stellar-contracts/protocol'
import { Address, nativeToScVal, scValToNative } from '@stellar/stellar-sdk'
import { bls12_381 } from '@noble/curves/bls12-381.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { DelegatedAttestationRequest, DelegatedRevocationRequest } from './types'
import { WeierstrassPoint } from '@noble/curves/abstract/weierstrass.js'

/**
 * Hash an address to match the contract's subject hash computation.
 * The contract uses: sha256(address.to_xdr(env))
 *
 * @param address - Stellar address string (G... format)
 * @returns 32-byte hash of the XDR-encoded address
 */
function hashAddress(address: string): Buffer {
  const addr = new Address(address)
  const scVal = addr.toScVal()
  const xdrBytes = scVal.toXDR()
  return Buffer.from(sha256(xdrBytes))
}

/**
 * Hash a string value to match the contract's value hash computation.
 * The contract uses: sha256(value.to_xdr(env))
 *
 * @param value - String value to hash
 * @returns 32-byte hash of the XDR-encoded string
 */
function hashValue(value: string): Buffer {
  const scVal = nativeToScVal(value, { type: 'string' })
  const xdrBytes = scVal.toXDR()
  return Buffer.from(sha256(xdrBytes))
}

/**
 * Create a message for signing delegated attestations.
 * Must match the exact format from `delegation.rs::create_attestation_message`.
 *
 * Message Structure:
 * - Domain Separator: 28 bytes ("ATTEST_PROTOCOL_V1_DELEGATED")
 * - Schema UID: 32 bytes
 * - Subject Hash: 32 bytes (SHA256 of XDR-encoded subject address)
 * - Nonce: 8 bytes (big-endian u64)
 * - Deadline: 8 bytes (big-endian u64)
 * - Expiration Time: 8 bytes (optional, big-endian u64)
 * - Value Hash: 32 bytes (SHA256 of XDR-encoded value)
 *
 * @param request - The delegated attestation request
 * @param dst - The domain separation tag for attestations
 * @returns A hash of the message, ready to be signed
 */
export function createAttestMessage(request: Omit<DelegatedAttestationRequest, 'signature'>, dst: Buffer): WeierstrassPoint<bigint> {
  const components: Buffer[] = []

  // Domain separation tag (28 bytes)
  components.push(dst)

  // Schema UID (32 bytes)
  components.push(request.schema_uid)

  // Subject Hash (32 bytes) - SHA256 of XDR-encoded subject address
  // CRITICAL: Binds the signature to the specific subject being attested
  components.push(hashAddress(request.subject))

  // Nonce (8 bytes, big-endian u64)
  const nonceBuffer = Buffer.allocUnsafe(8)
  nonceBuffer.writeBigUInt64BE(request.nonce, 0)
  components.push(nonceBuffer)

  // Deadline (8 bytes, big-endian u64)
  const deadlineBuffer = Buffer.allocUnsafe(8)
  deadlineBuffer.writeBigUInt64BE(request.deadline, 0)
  components.push(deadlineBuffer)

  // Optional expiration time (8 bytes if present)
  if (request.expiration_time !== undefined) {
    const expirationBuffer = Buffer.allocUnsafe(8)
    expirationBuffer.writeBigUInt64BE(BigInt(request.expiration_time), 0)
    components.push(expirationBuffer)
  }

  // Value Hash (32 bytes) - SHA256 of XDR-encoded value
  // CRITICAL: Binds the exact value content to the signature
  components.push(hashValue(request.value))

  // Concatenate and hash
  const message = Buffer.concat(components)
  return bls12_381.shortSignatures.hash(sha256(message))
}

/**
 * Create a message for signing delegated revocations.
 * Must match the exact format from `delegation.rs::create_revocation_message`.
 *
 * Message Structure:
 * - Domain Separator: 28 bytes ("REVOKE_PROTOCOL_V1_DELEGATED")
 * - Schema UID: 32 bytes
 * - Attestation UID: 32 bytes
 * - Subject Hash: 32 bytes (SHA256 of XDR-encoded subject address)
 * - Nonce: 8 bytes (big-endian u64)
 * - Deadline: 8 bytes (big-endian u64)
 *
 * @param request - The delegated revocation request
 * @param dst - The domain separation tag for revocations
 * @returns A hash of the message, ready to be signed
 */
export function createRevokeMessage(request: Omit<DelegatedRevocationRequest, 'signature'>, dst: Buffer): WeierstrassPoint<bigint> {
  const components: Buffer[] = []

  // Domain separation tag (28 bytes)
  components.push(dst)

  // Schema UID (32 bytes)
  // CRITICAL: Binds the signature to the specific schema
  components.push(request.schema_uid)

  // Attestation UID (32 bytes)
  // CRITICAL: Binds the signature to the specific attestation being revoked
  components.push(request.attestation_uid)

  // Subject Hash (32 bytes) - SHA256 of XDR-encoded subject address
  // Defense in depth - explicitly binds signature to the attestation subject
  components.push(hashAddress(request.subject))

  // Nonce (8 bytes, big-endian u64)
  const nonceBuffer = Buffer.allocUnsafe(8)
  nonceBuffer.writeBigUInt64BE(request.nonce, 0)
  components.push(nonceBuffer)

  // Deadline (8 bytes, big-endian u64)
  const deadlineBuffer = Buffer.allocUnsafe(8)
  deadlineBuffer.writeBigUInt64BE(request.deadline, 0)
  components.push(deadlineBuffer)

  // Concatenate and hash
  const message = Buffer.concat(components)
  return bls12_381.shortSignatures.hash(sha256(message))
}

/**
 * Get the domain separator tag for attestations from the contract.
 *
 * @param client - The protocol client instance
 * @returns The domain separator tag as a Buffer
 */
export async function getAttestDST(client: ProtocolClient): Promise<Buffer> {
  try {
    const tx = await client.get_dst_for_attestation()
    const result = await tx.simulate()

    // @ts-ignore - Different result structures across contract methods
    const dst = scValToNative(result.result)
    return Buffer.from(dst)
  } catch (error: any) {
    // Fallback to default DST if contract doesn't have the method
    return Buffer.from('ATTEST_PROTOCOL_V1_DELEGATED', 'utf8')
  }
}

/**
 * Get the domain separator tag for revocations from the contract.
 *
 * @param client - The protocol client instance
 * @returns The domain separator tag as a Buffer
 */
export async function getRevokeDST(client: ProtocolClient): Promise<Buffer> {
  try {
    const tx = await client.get_dst_for_revocation()
    const result = await tx.simulate()

    // @ts-ignore - Different result structures across contract methods
    const dst = scValToNative(result.result)
    return Buffer.from(dst)
  } catch (error: any) {
    // Fallback to default DST if contract doesn't have the method
    return Buffer.from('REVOKE_PROTOCOL_V1_DELEGATED', 'utf8')
  }
}

export async function getAttesterNonce(client: ProtocolClient, attester: string): Promise<bigint> {
  const tx = await client.get_attester_nonce({
    attester,
  })
  const result = await tx.simulate()

  // @ts-ignore - Different result structures across contract methods
  return BigInt(result.result)
}

/**
 * Create a delegated attestation request object.
 *
 * @param params - Parameters for the attestation
 * @returns A delegated attestation request ready for signing
 */
export async function createDelegatedAttestationRequest(
  client: ProtocolClient,
  params: {
    schemaUid: Buffer
    subject: string
    attester: string
    value: string
    nonce?: bigint
    deadline: bigint
    expirationTime?: number
  }
): Promise<Omit<DelegatedAttestationRequest, 'signature'>> {
  return {
    type: 'attest',
    schema_uid: params.schemaUid,
    subject: params.subject,
    attester: params.attester,
    value: params.value,
    deadline: params.deadline,
    nonce: await getAttesterNonce(client, params.attester),
    expiration_time: params.expirationTime ? BigInt(params.expirationTime) : undefined,
  }
}

/**
 * Create a delegated revocation request object.
 *
 * @param params - Parameters for the revocation
 * @returns A delegated revocation request ready for signing
 */
export async function createDelegatedRevocationRequest(
  client: ProtocolClient,
  params: {
    attestation_uid: Buffer
    schema_uid: Buffer
    subject: string
    revoker: string
    nonce?: bigint
    deadline: bigint
  }
): Promise<Omit<DelegatedRevocationRequest, 'signature'>> {
  return {
    type: 'revoke',
    attestation_uid: params.attestation_uid,
    schema_uid: params.schema_uid,
    subject: params.subject,
    revoker: params.revoker,
    deadline: params.deadline,
    nonce: await getAttesterNonce(client, params.revoker),
  }
}
