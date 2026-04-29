/**
 * Delegation Utilities
 *
 * Functions for creating delegated attestation/revocation requests and the
 * BLS message points they sign over. Layouts C and D below mirror the Rust
 * `delegation::create_attestation_message` / `create_revocation_message`
 * functions byte-for-byte. Reference vectors live in __tests__/parity.test.ts.
 *
 * HAL-06 / C-SDK-1 / C-CONTRACT-3:
 *   - The contract address and the network identifier are now part of the
 *     signed preimage so a request signed for one chain or one deployed
 *     contract cannot be replayed against a different one.
 *   - The DST is no longer a separate buffer fetched from the contract;
 *     a fixed UTF-8 domain separator is concatenated inline.
 */

import { Client as ProtocolClient } from '@attestprotocol/stellar-contracts/protocol'
import { Address, nativeToScVal } from '@stellar/stellar-sdk'
import { bls12_381 } from '@noble/curves/bls12-381.js'
import { sha256 } from '@noble/hashes/sha2.js'
import { DelegatedAttestationRequest, DelegatedRevocationRequest } from './types'
import { WeierstrassPoint } from '@noble/curves/abstract/weierstrass.js'

const ATTEST_DOMAIN_SEPARATOR = Buffer.from('ATTEST_PROTOCOL_V1_DELEGATED', 'utf8')
const REVOKE_DOMAIN_SEPARATOR = Buffer.from('REVOKE_PROTOCOL_V1_DELEGATED', 'utf8')

/**
 * Encode a Stellar address as `Address::to_xdr(env)` (raw ScAddress XDR).
 */
function encodeAddressXdr(address: string): Buffer {
  return new Address(address).toScVal().toXDR()
}

/**
 * Compute the 32-byte network id matching `env.ledger().network_id().to_array()`.
 *
 * Soroban derives the network id as `sha256(network_passphrase)` and emits the
 * raw 32 bytes (not the XDR `BytesN<32>` wrapper) when the contract appends it
 * via `extend_from_slice(&network_id.to_array())`.
 */
function networkIdBytes(networkPassphrase: string): Buffer {
  return Buffer.from(sha256(Buffer.from(networkPassphrase, 'utf8')))
}

/**
 * Hash an address to match the contract's subject hash computation.
 * The contract uses: sha256(address.to_xdr(env))
 */
function hashAddress(address: string): Buffer {
  return Buffer.from(sha256(encodeAddressXdr(address)))
}

/**
 * Hash a string value to match the contract's value hash computation.
 * The contract uses: sha256(value.to_xdr(env))
 */
function hashValue(value: string): Buffer {
  const xdrBytes = nativeToScVal(value, { type: 'string' }).toXDR()
  return Buffer.from(sha256(xdrBytes))
}

function be8(value: bigint): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeBigUInt64BE(value, 0)
  return buf
}

/**
 * Create the BLS G1 point a delegated attestation request must be signed over.
 *
 * Layout C (sha256 preimage, then mapped to G1):
 *   "ATTEST_PROTOCOL_V1_DELEGATED" || contract_xdr || network_id_32 ||
 *   schema_uid_raw_32             || subject_hash || nonce_be8     ||
 *   deadline_be8                  || [expiration_be8]?            || value_hash
 *
 * Note: `schema_uid` is the RAW 32 bytes (matching Rust `request.schema_uid.to_array()`),
 * not the BytesN<32> XDR form used in Layout A.
 *
 * @param request - The delegated attestation request (signature field unused)
 * @param contractId - The deployed protocol contract address
 * @param networkPassphrase - The network passphrase (e.g. Networks.TESTNET)
 */
export function createAttestMessage(
  request: Omit<DelegatedAttestationRequest, 'signature'>,
  contractId: string,
  networkPassphrase: string
): WeierstrassPoint<bigint> {
  if (!(request.schema_uid instanceof Buffer) || request.schema_uid.length !== 32) {
    throw new Error('request.schema_uid must be a 32-byte Buffer')
  }

  const components: Buffer[] = [
    ATTEST_DOMAIN_SEPARATOR,
    encodeAddressXdr(contractId),
    networkIdBytes(networkPassphrase),
    request.schema_uid,
    hashAddress(request.subject),
    be8(request.nonce),
    be8(request.deadline),
  ]

  if (request.expiration_time !== undefined) {
    components.push(be8(BigInt(request.expiration_time)))
  }

  components.push(hashValue(request.value))

  const message = Buffer.concat(components)
  return bls12_381.shortSignatures.hash(sha256(message))
}

/**
 * Create the BLS G1 point a delegated revocation request must be signed over.
 *
 * Layout D (sha256 preimage, then mapped to G1):
 *   "REVOKE_PROTOCOL_V1_DELEGATED" || contract_xdr     || network_id_32 ||
 *   schema_uid_raw_32             || attestation_uid_32 || subject_hash ||
 *   nonce_be8                     || deadline_be8
 *
 * @param request - The delegated revocation request (signature field unused)
 * @param contractId - The deployed protocol contract address
 * @param networkPassphrase - The network passphrase (e.g. Networks.TESTNET)
 */
export function createRevokeMessage(
  request: Omit<DelegatedRevocationRequest, 'signature'>,
  contractId: string,
  networkPassphrase: string
): WeierstrassPoint<bigint> {
  if (!(request.schema_uid instanceof Buffer) || request.schema_uid.length !== 32) {
    throw new Error('request.schema_uid must be a 32-byte Buffer')
  }
  if (!(request.attestation_uid instanceof Buffer) || request.attestation_uid.length !== 32) {
    throw new Error('request.attestation_uid must be a 32-byte Buffer')
  }

  const components: Buffer[] = [
    REVOKE_DOMAIN_SEPARATOR,
    encodeAddressXdr(contractId),
    networkIdBytes(networkPassphrase),
    request.schema_uid,
    request.attestation_uid,
    hashAddress(request.subject),
    be8(request.nonce),
    be8(request.deadline),
  ]

  const message = Buffer.concat(components)
  return bls12_381.shortSignatures.hash(sha256(message))
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
