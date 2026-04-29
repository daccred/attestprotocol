/**
 * Regression tests for H-SDK-6.
 *
 * Pre-fix behaviour: getSchemaHash returned the hex of the first 32 UTF-8
 * bytes of the schema's JSON form. Two schemas sharing those first 32
 * bytes hashed to the same value and any change beyond byte 32 was
 * invisible to consumers using the hash for identity or change detection.
 *
 * Post-fix behaviour: getSchemaHash returns the SHA-256 digest of the
 * canonical JSON form, encoded as 64 lowercase hex characters.
 */

import { describe, it, expect } from 'vitest'
import { sha256 } from '@noble/hashes/sha2.js'
import { SorobanSchemaEncoder } from '../src/common/schemaEncoder'

describe('H-SDK-6: getSchemaHash returns sha256, not a truncation', () => {
  it('returns a 64-char lowercase hex string', () => {
    const encoder = new SorobanSchemaEncoder({
      name: 'TestSchema',
      description: 'desc',
      fields: [{ name: 'field1', type: 'string' as any, optional: false }],
    })
    const hash = encoder.getSchemaHash()
    expect(hash).toHaveLength(64)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('schemas differing only in 33rd char of JSON produce different hashes', () => {
    // Construct two schemas whose serialised JSON forms share an identical
    // 32-byte prefix and only diverge afterwards. Under the old truncation
    // implementation these collided; under SHA-256 they cannot.
    const base = 'x'.repeat(32)
    const schema1 = new SorobanSchemaEncoder({
      name: base + 'A',
      description: 'desc',
      fields: [{ name: 'f', type: 'string' as any, optional: false }],
    })
    const schema2 = new SorobanSchemaEncoder({
      name: base + 'B',
      description: 'desc',
      fields: [{ name: 'f', type: 'string' as any, optional: false }],
    })
    expect(schema1.getSchemaHash()).not.toBe(schema2.getSchemaHash())
  })

  it('hash value matches independently-computed sha256', () => {
    const schemaObj = {
      name: 'KYCSchema',
      description: 'KYC verification',
      fields: [{ name: 'verified', type: 'bool' as any, optional: false }],
    }
    const encoder = new SorobanSchemaEncoder(schemaObj)
    const hash = encoder.getSchemaHash()

    const canonical = JSON.stringify({
      name: schemaObj.name,
      fields: schemaObj.fields.map((f) => ({ name: f.name, type: f.type, optional: f.optional })),
    })
    const expected = Buffer.from(sha256(Buffer.from(canonical, 'utf8'))).toString('hex')
    expect(hash).toBe(expected)
  })

  it('is deterministic across calls', () => {
    const encoder = new SorobanSchemaEncoder({
      name: 'Determinism',
      description: 'desc',
      fields: [{ name: 'f', type: 'u32' as any, optional: false }],
    })
    expect(encoder.getSchemaHash()).toBe(encoder.getSchemaHash())
  })
})
