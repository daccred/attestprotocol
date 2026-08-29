/**
 * Byte-for-byte parity between the SDK's attestation UID and the reference
 * implementation in contracts/stellar/__test__/testutils.ts, which is itself
 * verified against the deployed v2 contract on testnet.
 */

import { describe, it, expect } from 'vitest'
import { Address, nativeToScVal } from '@stellar/stellar-sdk'
import { keccak_256 } from '@noble/hashes/sha3.js'
import { generateAttestationUid } from '../src/utils/uidGenerator'
import { generateAttestationUid as referenceUid } from '../../../contracts/stellar/__test__/testutils'

const CONTRACT_V2 = 'CA2QET2KOUGAECEVYQEQT3SLDDZRUMAQHI7MMDTFVJY62WTHUTERAUCD'
const SCHEMA_UID = Buffer.from(
  '9f2a1c4e6b8d0f13579bdf2468ace013579bdf2468ace013579bdf2468ace013',
  'hex'
)
const SUBJECT = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
const ATTESTER = 'GBRHC2QOPZC2GM2EKGEXJSDPLXGXBHHHRAQQ5MFLAS2AST4ZKM6NCCUB'

const NONCES = [BigInt(0), BigInt(1), BigInt(2) ** BigInt(40)]

describe('attestation UID parity with the contract reference helper', () => {
  for (const nonce of NONCES) {
    it(`matches the reference for nonce ${nonce}`, () => {
      const mine = generateAttestationUid(CONTRACT_V2, SCHEMA_UID, SUBJECT, ATTESTER, nonce)
      const theirs = referenceUid(CONTRACT_V2, SCHEMA_UID, SUBJECT, ATTESTER, nonce)
      expect(mine.toString('hex')).toBe(theirs.toString('hex'))
      expect(mine).toHaveLength(32)
    })
  }

  it('matches the reference when subject and attester are swapped', () => {
    const nonce = BigInt(7)
    const mine = generateAttestationUid(CONTRACT_V2, SCHEMA_UID, ATTESTER, SUBJECT, nonce)
    const theirs = referenceUid(CONTRACT_V2, SCHEMA_UID, ATTESTER, SUBJECT, nonce)
    expect(mine.toString('hex')).toBe(theirs.toString('hex'))
  })

  it('no longer produces the pre-fix bare-length-prefix digest', () => {
    const addressXdr = (a: string) => new Address(a).toScVal().toXDR()
    const nonceBuffer = Buffer.alloc(8)
    nonceBuffer.writeBigUInt64BE(BigInt(0), 0)
    const legacy = Buffer.from(
      keccak_256(
        Buffer.concat([
          Buffer.from('ATTEST_UID_V1', 'utf8'),
          addressXdr(CONTRACT_V2),
          Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x20]), SCHEMA_UID]),
          addressXdr(SUBJECT),
          addressXdr(ATTESTER),
          nonceBuffer,
        ])
      )
    )
    const current = generateAttestationUid(CONTRACT_V2, SCHEMA_UID, SUBJECT, ATTESTER, BigInt(0))
    expect(current.toString('hex')).not.toBe(legacy.toString('hex'))
  })

  it('encodes the schema UID as ScVal::Bytes, not a bare length prefix', () => {
    const scval = nativeToScVal(SCHEMA_UID).toXDR()
    expect(scval.subarray(0, 4).toString('hex')).not.toBe('00000020')
    expect(scval.subarray(scval.length - 32).toString('hex')).toBe(SCHEMA_UID.toString('hex'))
  })
})
