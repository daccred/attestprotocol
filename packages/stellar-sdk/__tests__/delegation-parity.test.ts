/**
 * Byte-for-byte parity between the SDK's delegated attest/revoke message
 * points and the reference implementation in
 * contracts/stellar/__test__/testutils.ts, which is verified against the
 * deployed v2 contract on testnet.
 */

import { describe, it, expect } from 'vitest'
import { createAttestMessage, createRevokeMessage } from '../src/delegation'
import {
  createAttestationMessage as referenceAttestMessage,
  createRevocationMessage as referenceRevokeMessage,
} from '../../../contracts/stellar/__test__/testutils'

const CONTRACT_V2 = 'CA2QET2KOUGAECEVYQEQT3SLDDZRUMAQHI7MMDTFVJY62WTHUTERAUCD'
const PASSPHRASE_TESTNET = 'Test SDF Network ; September 2015'

const ATTEST_DST = Buffer.from('ATTEST_PROTOCOL_V1_DELEGATED', 'utf8')
const REVOKE_DST = Buffer.from('REVOKE_PROTOCOL_V1_DELEGATED', 'utf8')

const SCHEMA_UID = Buffer.alloc(32, 0x5a)
const ATTESTATION_UID = Buffer.alloc(32, 0x3c)
const SUBJECT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
const ATTESTER = 'GBRHC2QOPZC2GM2EKGEXJSDPLXGXBHHHRAQQ5MFLAS2AST4ZKM6NCCUB'

function pointHex(p: { toBytes(uncompressed?: boolean): Uint8Array }): string {
  return Buffer.from(p.toBytes(false)).toString('hex')
}

const attestCases: Array<[string, bigint | undefined]> = [
  ['without expiration', undefined],
  ['with expiration', BigInt(1893456000)],
]

describe('delegated attest message parity with the contract reference helper', () => {
  for (const [label, expiration] of attestCases) {
    it(`matches the reference ${label}`, () => {
      const request = {
        type: 'attest' as const,
        schema_uid: SCHEMA_UID,
        subject: SUBJECT,
        attester: ATTESTER,
        value: 'parity-fixture',
        nonce: BigInt(3),
        deadline: BigInt(1800000000),
        expiration_time: expiration,
      }

      const mine = createAttestMessage(request, CONTRACT_V2, PASSPHRASE_TESTNET)
      const theirs = referenceAttestMessage(
        { ...request, signature: Buffer.alloc(96) },
        ATTEST_DST,
        CONTRACT_V2,
        PASSPHRASE_TESTNET
      )

      expect(pointHex(mine)).toBe(pointHex(theirs))
    })
  }

  it('matches the reference at nonce 0', () => {
    const request = {
      type: 'attest' as const,
      schema_uid: SCHEMA_UID,
      subject: SUBJECT,
      attester: ATTESTER,
      value: '',
      nonce: BigInt(0),
      deadline: BigInt(0),
      expiration_time: undefined,
    }

    expect(pointHex(createAttestMessage(request, CONTRACT_V2, PASSPHRASE_TESTNET))).toBe(
      pointHex(
        referenceAttestMessage(
          { ...request, signature: Buffer.alloc(96) },
          ATTEST_DST,
          CONTRACT_V2,
          PASSPHRASE_TESTNET
        )
      )
    )
  })
})

describe('delegated revoke message parity with the contract reference helper', () => {
  it('matches the reference', () => {
    const request = {
      type: 'revoke' as const,
      schema_uid: SCHEMA_UID,
      attestation_uid: ATTESTATION_UID,
      subject: SUBJECT,
      revoker: ATTESTER,
      nonce: BigInt(9),
      deadline: BigInt(1800000000),
    }

    const mine = createRevokeMessage(request, CONTRACT_V2, PASSPHRASE_TESTNET)
    const theirs = referenceRevokeMessage(
      { ...request, signature: Buffer.alloc(96) },
      REVOKE_DST,
      CONTRACT_V2,
      PASSPHRASE_TESTNET
    )

    expect(pointHex(mine)).toBe(pointHex(theirs))
  })

  it('is bound to the contract address', () => {
    const request = {
      type: 'revoke' as const,
      schema_uid: SCHEMA_UID,
      attestation_uid: ATTESTATION_UID,
      subject: SUBJECT,
      revoker: ATTESTER,
      nonce: BigInt(9),
      deadline: BigInt(1800000000),
    }
    const other = 'CDJG5ZH7MU7KREGS256QAWO2QDKQJEZHBUJRF6S6ACG5BIS3M4D5WPQT'
    expect(pointHex(createRevokeMessage(request, CONTRACT_V2, PASSPHRASE_TESTNET))).not.toBe(
      pointHex(createRevokeMessage(request, other, PASSPHRASE_TESTNET))
    )
  })
})
