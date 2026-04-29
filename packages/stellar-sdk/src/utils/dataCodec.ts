/**
 * Schema Encoding/Decoding Utilities
 *
 * Functions for encoding and decoding schema definitions to/from XDR format
 * compatible with the Stellar Attest Protocol.
 */

import { SorobanSchemaEncoder, StellarSchemaDefinition } from '../common/schemaEncoder'

/**
 * Encode a schema definition to XDR string format.
 *
 * @param schema - The schema definition object
 * @returns XDR-encoded string with "XDR:" prefix
 */
export function encodeSchema(schema: StellarSchemaDefinition): string {
  const encoder = new SorobanSchemaEncoder(schema)
  return encoder.toXDR()
}

/**
 * Maximum permitted size of an `XDR:`-prefixed schema payload.
 *
 * The previous implementation routed any string containing the substring
 * "AAAA" through the XDR decoder and additionally retried any non-JSON
 * payload as XDR, which let an attacker feed arbitrary input into a
 * deserializer reachable from public APIs (H-SDK-5). The cap below
 * bounds the work the XDR decoder may do on a single call.
 */
const MAX_XDR_PAYLOAD_LENGTH = 4096

/**
 * Decode a schema from XDR or JSON format.
 *
 * Routing rules (H-SDK-5):
 *  - Inputs that begin with the literal `XDR:` prefix go through the XDR decoder
 *    after being length-checked.
 *  - Anything else is parsed as JSON.
 *  - There is no longer a fallback that retries arbitrary text as XDR; this
 *    eliminates the "AAAA"/no-prefix gadget that previously fed untrusted
 *    bytes into the deserializer.
 *
 * @param encoded - The encoded schema string (XDR or JSON)
 * @returns The decoded schema definition
 */
export function decodeSchema(encoded: string): StellarSchemaDefinition {
  if (encoded.startsWith('XDR:')) {
    const payload = encoded.slice(4)
    if (payload.length > MAX_XDR_PAYLOAD_LENGTH) {
      throw new Error('XDR-encoded schema exceeds maximum permitted length')
    }
    const decodedEncoder = SorobanSchemaEncoder.fromXDR(encoded)
    return decodedEncoder.getSchema()
  }

  // Anything without the explicit XDR: prefix MUST parse as JSON.
  const parsed = JSON.parse(encoded)
  if (parsed.name && parsed.version && parsed.fields) {
    return parsed as StellarSchemaDefinition
  }
  throw new Error('Invalid JSON schema format')
}

/**
 * Validate a schema definition.
 *
 * @param schema - The schema definition to validate
 * @returns True if valid, throws error if invalid
 */
export function validateSchema(schema: StellarSchemaDefinition): boolean {
  // Creating the encoder will validate the schema
  new SorobanSchemaEncoder(schema)
  return true
}

/**
 * Create a simple schema definition for testing.
 *
 * @param name - Schema name
 * @param fields - Array of field definitions
 * @returns A schema definition object
 */
export function createSimpleSchema(
  name: string,
  fields: Array<{ name: string; type: string; optional?: boolean }>
): StellarSchemaDefinition {
  return {
    name,
    description: `Schema for ${name}`,
    fields: fields.map((field) => ({
      name: field.name,
      type: field.type as any, // Will be validated by encoder
      optional: field.optional ?? false,
    })),
  }
}
