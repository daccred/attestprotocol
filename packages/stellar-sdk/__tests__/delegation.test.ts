/**
 * Regression tests for H-SDK-1 (post-fix state).
 *
 * H-SDK-1 originally pointed at getAttestDST/getRevokeDST swallowing every
 * RPC error and returning a hard-coded default DST. Commit 7 removes those
 * helpers entirely — the contract id and network passphrase are now bound
 * into the BLS message preimage in createAttestMessage / createRevokeMessage,
 * so there is no DST to fetch and no error to swallow.
 *
 * The tests below pin the new invariant: callers must supply contractId
 * and networkPassphrase, and changing either flips the resulting message
 * point. The previous "DST simulation throws" tests are intentionally gone
 * because the call sites they covered no longer exist.
 */

import { describe, it, expect } from 'vitest'
import { createAttestMessage, createRevokeMessage } from '../src/delegation'

const baseAttest = {
  type: 'attest' as const,
  schema_uid: Buffer.alloc(32, 0xaa),
  subject: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  attester: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF',
  value: 'value',
  nonce: BigInt(1),
  deadline: BigInt(2),
  expiration_time: undefined,
}

const baseRevoke = {
  type: 'revoke' as const,
  schema_uid: Buffer.alloc(32, 0xaa),
  attestation_uid: Buffer.alloc(32, 0xbb),
  subject: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  revoker: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF',
  nonce: BigInt(1),
  deadline: BigInt(2),
}

const CONTRACT_A = 'CDJG5ZH7MU7KREGS256QAWO2QDKQJEZHBUJRF6S6ACG5BIS3M4D5WPQT'
const CONTRACT_B = 'CDEP3ZFV3AKATLVXD6Y2OICKIZH5KN2ESUY2EWMHXBXMARJHPEKXRLFT'

const PASSPHRASE_TESTNET = 'Test SDF Network ; September 2015'
const PASSPHRASE_PUBLIC = 'Public Global Stellar Network ; September 2015'

function pointHex(p: { toBytes(uncompressed?: boolean): Uint8Array }): string {
  return Buffer.from(p.toBytes(false)).toString('hex')
}

describe('H-SDK-1 / HAL-06: message preimage binds contract id and network', () => {
  it('createAttestMessage produces different points for different contracts', () => {
    const a = createAttestMessage(baseAttest, CONTRACT_A, PASSPHRASE_TESTNET)
    const b = createAttestMessage(baseAttest, CONTRACT_B, PASSPHRASE_TESTNET)
    expect(pointHex(a)).not.toBe(pointHex(b))
  })

  it('createAttestMessage produces different points for different networks', () => {
    const a = createAttestMessage(baseAttest, CONTRACT_A, PASSPHRASE_TESTNET)
    const b = createAttestMessage(baseAttest, CONTRACT_A, PASSPHRASE_PUBLIC)
    expect(pointHex(a)).not.toBe(pointHex(b))
  })

  it('createAttestMessage is deterministic for fixed inputs', () => {
    const a = createAttestMessage(baseAttest, CONTRACT_A, PASSPHRASE_TESTNET)
    const b = createAttestMessage(baseAttest, CONTRACT_A, PASSPHRASE_TESTNET)
    expect(pointHex(a)).toBe(pointHex(b))
  })

  it('createRevokeMessage produces different points for different contracts', () => {
    const a = createRevokeMessage(baseRevoke, CONTRACT_A, PASSPHRASE_TESTNET)
    const b = createRevokeMessage(baseRevoke, CONTRACT_B, PASSPHRASE_TESTNET)
    expect(pointHex(a)).not.toBe(pointHex(b))
  })

  it('createRevokeMessage produces different points for different networks', () => {
    const a = createRevokeMessage(baseRevoke, CONTRACT_A, PASSPHRASE_TESTNET)
    const b = createRevokeMessage(baseRevoke, CONTRACT_A, PASSPHRASE_PUBLIC)
    expect(pointHex(a)).not.toBe(pointHex(b))
  })

  it('attest and revoke messages are domain-separated even with otherwise-identical inputs', () => {
    const attestPoint = createAttestMessage(baseAttest, CONTRACT_A, PASSPHRASE_TESTNET)
    const revokePoint = createRevokeMessage(baseRevoke, CONTRACT_A, PASSPHRASE_TESTNET)
    expect(pointHex(attestPoint)).not.toBe(pointHex(revokePoint))
  })

  it('createAttestMessage rejects non-32-byte schema_uid', () => {
    expect(() =>
      createAttestMessage({ ...baseAttest, schema_uid: Buffer.alloc(16) }, CONTRACT_A, PASSPHRASE_TESTNET)
    ).toThrow(/32-byte/)
  })

  it('createRevokeMessage rejects non-32-byte attestation_uid', () => {
    expect(() =>
      createRevokeMessage({ ...baseRevoke, attestation_uid: Buffer.alloc(8) }, CONTRACT_A, PASSPHRASE_TESTNET)
    ).toThrow(/32-byte/)
  })
})
