/**
 * Regression tests for H-SDK-5.
 *
 * Pre-fix behaviour:
 *   - `encoded.includes('AAAA')` routed any string containing the substring
 *     "AAAA" through the XDR decoder.
 *   - Non-JSON, non-XDR-prefixed input was retried as raw XDR by prepending
 *     `XDR:` and re-invoking the decoder — i.e. arbitrary attacker-controlled
 *     bytes always reached the deserializer.
 *
 * Post-fix behaviour:
 *   - Only the `XDR:` prefix selects the XDR path.
 *   - The XDR path enforces a 4096-byte cap on the payload.
 *   - Anything else is required to parse as JSON; bad input throws cleanly.
 */

import { describe, it, expect } from 'vitest'
import { decodeSchema, encodeSchema } from '../src/utils/dataCodec'

describe('H-SDK-5: decodeSchema only uses XDR: prefix', () => {
  it('does not route a string containing AAAA through the XDR decoder', () => {
    const attackerInput = 'GAAAABBBCCCDDD1234'
    expect(() => decodeSchema(attackerInput)).toThrow()
    try {
      decodeSchema(attackerInput)
    } catch (e: any) {
      // Failure must come from the JSON parser, not from the XDR decoder.
      expect(String(e?.message)).not.toMatch(/XDR/i)
    }
  })

  it('correctly decodes a legitimately XDR:-prefixed schema', () => {
    const schema = {
      name: 'TestSchema',
      description: 'A test schema',
      fields: [{ name: 'age', type: 'u64' as any, optional: false }],
    }
    const encoded = encodeSchema(schema)
    expect(encoded.startsWith('XDR:')).toBe(true)

    const decoded = decodeSchema(encoded)
    expect(decoded.name).toBe('TestSchema')
    expect(decoded.fields[0].name).toBe('age')
  })

  it('rejects XDR-prefixed payloads exceeding 4096 bytes', () => {
    const longPayload = 'XDR:' + 'A'.repeat(4097)
    expect(() => decodeSchema(longPayload)).toThrow(/maximum permitted length/)
  })

  it('parses well-formed JSON schemas with name+version+fields', () => {
    const json = JSON.stringify({
      name: 'JsonOnly',
      version: '1.0',
      fields: [{ name: 'x', type: 'string' }],
    })
    const decoded = decodeSchema(json)
    expect(decoded.name).toBe('JsonOnly')
  })

  it('throws on JSON missing required marker fields rather than silently falling back to XDR', () => {
    const json = JSON.stringify({ foo: 'bar' })
    expect(() => decodeSchema(json)).toThrow(/Invalid JSON schema format/)
  })
})
