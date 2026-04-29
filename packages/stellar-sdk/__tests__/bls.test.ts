/**
 * Regression tests for C-SDK-3.
 *
 * Pre-fix behaviour: when called without an `expectedMessage`, verifySignature
 * fell back to a syntactic G1 format check and returned isValid:true for any
 * well-formed signature, allowing forged signatures to pass verification.
 *
 * Post-fix behaviour: verifySignature short-circuits to isValid:false when
 * expectedMessage is undefined; format-only checks are exposed via the
 * separately-named validateG1PointFormat helper that returns a plain boolean.
 */

import { describe, it, expect } from 'vitest'
import { bls12_381 } from '@noble/curves/bls12-381.js'
import { sha256 } from '@noble/hashes/sha2.js'
import {
  verifySignature,
  validateG1PointFormat,
  generateBlsKeys,
  signHashedMessage,
} from '../src/utils/bls'

describe('C-SDK-3: verifySignature does not bypass when expectedMessage is absent', () => {
  it('returns isValid:false when expectedMessage is undefined', () => {
    const { publicKey, privateKey } = generateBlsKeys()
    const msgPoint = bls12_381.shortSignatures.hash(sha256(Buffer.from('any')))
    const sig = signHashedMessage(msgPoint, privateKey)

    const result = verifySignature({
      signature: sig,
      // Force the runtime-undefined case the previous implementation accepted.
      expectedMessage: undefined as any,
      publicKey: Buffer.from(publicKey),
    })
    expect(result.isValid).toBe(false)
    expect(result.metadata).toBeUndefined()
  })

  it('returns isValid:true only when signature genuinely matches message and key', () => {
    const { privateKey, publicKey } = generateBlsKeys()
    const msgPoint = bls12_381.shortSignatures.hash(sha256(Buffer.from('real message')))
    const sig = signHashedMessage(msgPoint, privateKey)

    const result = verifySignature({
      signature: sig,
      expectedMessage: msgPoint,
      publicKey: Buffer.from(publicKey),
    })
    expect(result.isValid).toBe(true)
    expect(result.metadata?.originalMessage).toBeInstanceOf(Buffer)
  })

  it('returns isValid:false when signature is for a different message', () => {
    const { privateKey, publicKey } = generateBlsKeys()
    const realMsg = bls12_381.shortSignatures.hash(sha256(Buffer.from('real message')))
    const wrongMsg = bls12_381.shortSignatures.hash(sha256(Buffer.from('different message')))
    const sig = signHashedMessage(realMsg, privateKey)

    const result = verifySignature({
      signature: sig,
      expectedMessage: wrongMsg,
      publicKey: Buffer.from(publicKey),
    })
    expect(result.isValid).toBe(false)
  })

  it('validateG1PointFormat returns plain boolean without isValid field', () => {
    const { privateKey } = generateBlsKeys()
    const msgPoint = bls12_381.shortSignatures.hash(sha256(Buffer.from('anything')))
    const sig = signHashedMessage(msgPoint, privateKey)

    const isFormatValid: boolean = validateG1PointFormat(sig)
    expect(isFormatValid).toBe(true)
    expect(typeof isFormatValid).toBe('boolean')
  })

  it('validateG1PointFormat returns false for garbage bytes', () => {
    const garbage = Buffer.alloc(96, 0xff)
    expect(validateG1PointFormat(garbage)).toBe(false)
  })
})
