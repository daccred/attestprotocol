/**
 * UID Generation Utilities
 *
 * Functions for generating deterministic UIDs for attestations and schemas
 * that match the Rust contract implementation byte-for-byte.
 *
 * Layout references (HAL-06 / C-SDK-1 / C-CONTRACT-3):
 *  - Layout A — Attestation UID input (keccak256 preimage)
 *  - Layout B — Schema UID input (sha256 preimage with revocable flag)
 *
 * Reference vectors live in __tests__/parity.test.ts and are filled by W1.
 */

import { Address, nativeToScVal } from '@stellar/stellar-sdk'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { sha256 } from '@noble/hashes/sha2.js'

const ATTEST_UID_PREFIX = Buffer.from('ATTEST_UID_V1', 'utf8')

/**
 * Encode a 32-byte buffer the way Soroban's `BytesN<32>::to_xdr(env)` does.
 *
 * In soroban-sdk 27 `ToXdr` is implemented for any value convertible to `Val`,
 * so `to_xdr` serializes the full `ScVal::Bytes` wrapper — not a bare 4-byte
 * length prefix. Verified against the deployed contract: the bare-prefix form
 * produced UIDs that no on-chain attestation matched.
 */
function encodeBytesN32Xdr(buf: Buffer): Buffer {
  if (buf.length !== 32) {
    throw new Error('BytesN<32> XDR encoding requires exactly 32 bytes of input')
  }
  return nativeToScVal(buf).toXDR()
}

/**
 * Encode a Stellar address as `Address::to_xdr(env)` (raw ScAddress XDR).
 *
 * Equivalent to `new Address(addr).toScVal().toXDR()` (which defaults to
 * the `'raw'` format and returns a Buffer matching Soroban's wire form).
 */
function encodeAddressXdr(addr: string): Buffer {
  return new Address(addr).toScVal().toXDR()
}

/**
 * Generate an attestation UID matching the Rust contract implementation.
 *
 * Layout A (keccak256 preimage):
 *   "ATTEST_UID_V1"  || contract_xdr || schema_uid_xdr_36 ||
 *   subject_xdr      || attester_xdr || nonce_be8
 *
 * Hash: keccak256 of the concatenation.
 *
 * @param contractAddress - Stellar address of the deployed protocol contract
 *   (`env.current_contract_address()` on the Rust side).
 * @param schemaUid - 32-byte schema UID
 * @param subject - Stellar account/contract address being attested
 * @param attester - Stellar account/contract address producing the attestation
 * @param nonce - u64 attester nonce
 * @returns 32-byte attestation UID
 */
export function generateAttestationUid(
  contractAddress: string,
  schemaUid: Buffer,
  subject: string,
  attester: string,
  nonce: bigint
): Buffer {
  if (typeof contractAddress !== 'string' || contractAddress.length === 0) {
    throw new Error('contractAddress must be a non-empty Stellar address string')
  }
  if (!(schemaUid instanceof Buffer) || schemaUid.length !== 32) {
    throw new Error('schemaUid must be a 32-byte Buffer')
  }
  if (typeof subject !== 'string' || !subject.startsWith('G')) {
    throw new Error('subject must be a valid Stellar public key string')
  }
  if (typeof attester !== 'string' || !attester.startsWith('G')) {
    throw new Error('attester must be a valid Stellar public key string')
  }
  if (typeof nonce !== 'bigint') {
    throw new Error('nonce must be a BigInt')
  }

  const contractXdr = encodeAddressXdr(contractAddress)
  const schemaUidXdr = encodeBytesN32Xdr(schemaUid)
  const subjectXdr = encodeAddressXdr(subject)
  const attesterXdr = encodeAddressXdr(attester)

  const nonceBuffer = Buffer.alloc(8)
  nonceBuffer.writeBigUInt64BE(nonce, 0)

  const hashInput = Buffer.concat([
    ATTEST_UID_PREFIX,
    contractXdr,
    schemaUidXdr,
    subjectXdr,
    attesterXdr,
    nonceBuffer,
  ])

  return Buffer.from(keccak_256(hashInput))
}

/**
 * Generate a schema UID matching the Rust contract implementation.
 *
 * Layout B (sha256 preimage):
 *   schema_definition_xdr || authority_xdr || [resolver_xdr]? || revocable_byte
 *
 * `revocable_byte` is `0x01` for true and `0x00` for false. The resolver
 * component is omitted entirely when no resolver is supplied (matching
 * the Rust `Option<Address>::None` branch which writes nothing).
 *
 * @param definition - Schema definition string (Soroban String XDR is computed)
 * @param authority - Stellar address registering the schema
 * @param resolver - Optional resolver contract address
 * @param revocable - Whether attestations against this schema may be revoked
 * @returns 32-byte schema UID
 */
export function generateSchemaUid(
  definition: string,
  authority: string,
  resolver: string | undefined,
  revocable: boolean
): Buffer {
  if (!definition || typeof definition !== 'string') {
    throw new Error('definition must be a non-empty string')
  }
  if (!authority || typeof authority !== 'string') {
    throw new Error('authority must be a non-empty string')
  }
  if (typeof revocable !== 'boolean') {
    throw new Error('revocable must be a boolean')
  }

  const components: Buffer[] = []

  components.push(nativeToScVal(definition).toXDR())

  try {
    components.push(encodeAddressXdr(authority))
  } catch {
    components.push(nativeToScVal(authority).toXDR())
  }

  if (resolver) {
    try {
      components.push(encodeAddressXdr(resolver))
    } catch {
      components.push(nativeToScVal(resolver).toXDR())
    }
  }

  components.push(Buffer.from([revocable ? 0x01 : 0x00]))

  return Buffer.from(sha256(Buffer.concat(components)))
}

/**
 * Format a UID for display (with dashes for readability).
 *
 * @param uid - The 32-byte buffer or 64-character hex string
 * @returns Formatted UID string
 */
export function formatUid(uid: Buffer | string): string {
  const hexString = typeof uid === 'string' ? uid : uid.toString('hex')

  if (hexString.length !== 64) {
    return hexString
  }

  return `${hexString.slice(0, 8)}-${hexString.slice(8, 16)}-${hexString.slice(16, 24)}-${hexString.slice(24, 32)}-${hexString.slice(32)}`
}

/**
 * Parse a formatted UID back to raw buffer.
 *
 * @param formattedUid - The formatted UID with dashes
 * @returns Raw 32-byte buffer
 */
export function parseFormattedUid(formattedUid: string): Buffer {
  const hexString = formattedUid.replace(/-/g, '')
  return Buffer.from(hexString, 'hex')
}
