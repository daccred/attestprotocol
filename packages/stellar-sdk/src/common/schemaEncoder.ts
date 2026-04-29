/**
 * Stellar Schema Encoder - Standardized schema definition and data encoding for Stellar attestations
 * Provides type-safe schema definitions and encoding/decoding utilities.
 */

import { Address, xdr } from '@stellar/stellar-sdk'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { sha256 } from '@noble/hashes/sha2.js'

/**
 * Supported Stellar attestation data types
 */
export enum StellarDataType {
  STRING = 'string',
  BOOL = 'bool',
  U32 = 'u32',
  U64 = 'u64',
  I32 = 'i32',
  I64 = 'i64',
  I128 = 'i128',
  NUMBER = 'number',
  ADDRESS = 'address',
  BYTES = 'bytes',
  SYMBOL = 'symbol',
  ARRAY = 'array',
  MAP = 'map',
  TIMESTAMP = 'timestamp',
  AMOUNT = 'amount',
}

/**
 * Schema field definition
 */
export interface SchemaField {
  name: string
  type: StellarDataType | string
  optional?: boolean
  description?: string
  validation?: {
    min?: number
    max?: number
    pattern?: string
    enum?: string[]
  }
}

/**
 * Complete schema definition with metadata
 */
export interface StellarSchemaDefinition {
  name: string
  description?: string
  fields: SchemaField[]
  metadata?: {
    category?: string
    tags?: string[]
    revocable?: boolean
    expirable?: boolean
  }
}

/**
 * Encoded attestation data ready for contract submission
 */
export interface EncodedAttestationData {
  schemaHash: string
  encodedData: string
  decodedData: Record<string, any>
  schema: StellarSchemaDefinition
}

/**
 * Schema validation error
 */
export class SchemaValidationError extends Error {
  constructor(
    message: string,
    public field?: string
  ) {
    super(message)
    this.name = 'SchemaValidationError'
  }
}

/**
 * Stellar Schema Encoder - Provides standardized schema definition and data encoding
 */
export class SorobanSchemaEncoder {
  private schema: StellarSchemaDefinition
  private ajv: Ajv
  private validator: any // AJV validator function

  constructor(schema: StellarSchemaDefinition) {
    this.validateSchema(schema)
    this.schema = schema
    this.ajv = this.createAjvInstance()
    this.validator = this.ajv.compile(this.toJSONSchema())
  }

  /**
   * Get the schema definition
   */
  getSchema(): StellarSchemaDefinition {
    return { ...this.schema }
  }

  /**
   * Generate a unique hash for this schema.
   *
   * Returns the lowercase hex SHA-256 digest of the canonical JSON form
   * (name + ordered fields). Pre-fix this method returned a hex
   * encoding of the first 32 raw UTF-8 bytes of the JSON string, which
   * is not a hash at all: identical prefixes produced identical "hashes"
   * and the value did not depend on later bytes of the schema (H-SDK-6).
   *
   * Output: 64 lowercase hex characters.
   */
  getSchemaHash(): string {
    const schemaString = JSON.stringify({
      name: this.schema.name,
      fields: this.schema.fields.map((f) => ({ name: f.name, type: f.type, optional: f.optional })),
    })
    const digest = sha256(Buffer.from(schemaString, 'utf8'))
    return Buffer.from(digest).toString('hex')
  }

  /**
   * Encode schema to XDR format for efficient storage and privacy
   */
  toXDR(): string {
    try {
      // Convert schema to XDR-encodable values
      const fieldsXdr = this.schema.fields.map((field) => {
        // Convert field to XDR Value
        const fieldObj = xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('name'),
            val: xdr.ScVal.scvString(field.name),
          }),
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('type'),
            val: xdr.ScVal.scvString(field.type),
          }),
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('optional'),
            val: xdr.ScVal.scvBool(field.optional || false),
          }),
          ...(field.description
            ? [
                new xdr.ScMapEntry({
                  key: xdr.ScVal.scvSymbol('description'),
                  val: xdr.ScVal.scvString(field.description),
                }),
              ]
            : []),
          ...(field.validation
            ? [
                new xdr.ScMapEntry({
                  key: xdr.ScVal.scvSymbol('validation'),
                  val: this.validationToXdr(field.validation),
                }),
              ]
            : []),
        ])
        return fieldObj
      })

      // Create main schema XDR structure
      const schemaXdr = xdr.ScVal.scvMap([
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol('name'),
          val: xdr.ScVal.scvString(this.schema.name),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol('description'),
          val: xdr.ScVal.scvString(this.schema.description || this.schema.name),
        }),
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol('fields'),
          val: xdr.ScVal.scvVec(fieldsXdr),
        }),
      ])

      // Convert to XDR string
      const xdrString = schemaXdr.toXDR('base64')
      return `XDR:${xdrString}`
    } catch (error) {
      throw new SchemaValidationError(`Failed to encode schema to XDR: ${error}`)
    }
  }

  /**
   * Helper to convert validation rules to XDR
   */
  private validationToXdr(validation: any): xdr.ScVal {
    const entries: xdr.ScMapEntry[] = []

    if (validation.min !== undefined) {
      entries.push(
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol('min'),
          val: xdr.ScVal.scvI128(
            new xdr.Int128Parts({
              hi: xdr.Uint64.fromString('0'),
              lo: xdr.Uint64.fromString(validation.min.toString()),
            })
          ),
        })
      )
    }

    if (validation.max !== undefined) {
      entries.push(
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol('max'),
          val: xdr.ScVal.scvI128(
            new xdr.Int128Parts({
              hi: xdr.Uint64.fromString('0'),
              lo: xdr.Uint64.fromString(validation.max.toString()),
            })
          ),
        })
      )
    }

    if (validation.pattern) {
      entries.push(
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol('pattern'),
          val: xdr.ScVal.scvString(validation.pattern),
        })
      )
    }

    if (validation.enum && validation.enum.length > 0) {
      const enumValues = validation.enum.map((val: string) => xdr.ScVal.scvString(val))
      entries.push(
        new xdr.ScMapEntry({
          key: xdr.ScVal.scvSymbol('enum'),
          val: xdr.ScVal.scvVec(enumValues),
        })
      )
    }

    return xdr.ScVal.scvMap(entries)
  }

  /**
   * Create schema encoder from XDR format
   */
  static fromXDR(xdrString: string): SorobanSchemaEncoder {
    try {
      if (!xdrString.startsWith('XDR:')) {
        throw new Error('Invalid XDR format - missing XDR: prefix')
      }

      const xdrData = xdrString.substring(4)

      // Parse XDR back to ScVal
      const schemaScVal = xdr.ScVal.fromXDR(xdrData, 'base64')

      if (schemaScVal.switch() !== xdr.ScValType.scvMap()) {
        throw new Error('XDR data is not a map')
      }

      const schemaMap = schemaScVal.map()
      if (!schemaMap) {
        throw new Error('Invalid XDR schema map')
      }

      const schema: Partial<StellarSchemaDefinition> = {}

      // Extract schema properties from XDR map
      for (const entry of schemaMap) {
        const key = entry.key().sym().toString()
        const val = entry.val()

        switch (key) {
          case 'name':
            if (val.switch() === xdr.ScValType.scvString()) {
              schema.name = val.str().toString()
            }
            break
          case 'description':
            if (val.switch() === xdr.ScValType.scvString()) {
              schema.description = val.str().toString()
            }
            break
          case 'fields':
            if (val.switch() === xdr.ScValType.scvVec()) {
              schema.fields = this.parseFieldsFromXdr(val.vec() || [])
            }
            break
        }
      }

      // Validate required fields
      if (!schema.name || !schema.fields) {
        throw new Error('Missing required schema fields')
      }

      return new SorobanSchemaEncoder(schema as StellarSchemaDefinition)
    } catch (error) {
      throw new SchemaValidationError(`Failed to decode XDR schema: ${error}`)
    }
  }

  /**
   * Helper to parse fields array from XDR
   */
  private static parseFieldsFromXdr(fieldsXdr: xdr.ScVal[]): SchemaField[] {
    return fieldsXdr.map((fieldXdr) => {
      if (fieldXdr.switch() !== xdr.ScValType.scvMap()) {
        throw new Error('Field is not a map')
      }

      const fieldMap = fieldXdr.map()
      if (!fieldMap) {
        throw new Error('Invalid field map')
      }

      const field: Partial<SchemaField> = {}

      for (const entry of fieldMap) {
        const key = entry.key().sym().toString()
        const val = entry.val()

        switch (key) {
          case 'name':
            if (val.switch() === xdr.ScValType.scvString()) {
              field.name = val.str().toString()
            }
            break
          case 'type':
            if (val.switch() === xdr.ScValType.scvString()) {
              field.type = val.str().toString()
            }
            break
          case 'optional':
            if (val.switch() === xdr.ScValType.scvBool()) {
              field.optional = val.b()
            }
            break
          case 'description':
            if (val.switch() === xdr.ScValType.scvString()) {
              field.description = val.str().toString()
            }
            break
          case 'validation':
            if (val.switch() === xdr.ScValType.scvMap()) {
              const validationMap = val.map()
              if (validationMap) {
                field.validation = this.parseValidationFromXdr(validationMap)
              }
            }
            break
        }
      }

      if (!field.name || !field.type) {
        throw new Error('Missing required field properties')
      }

      return field as SchemaField
    })
  }

  /**
   * Helper to parse validation rules from XDR
   */
  private static parseValidationFromXdr(validationMap: xdr.ScMapEntry[]): any {
    const validation: any = {}

    for (const entry of validationMap) {
      const key = entry.key().sym().toString()
      const val = entry.val()

      switch (key) {
        case 'min':
          if (val.switch() === xdr.ScValType.scvI128()) {
            validation.min = parseInt(val.i128().toString())
          }
          break
        case 'max':
          if (val.switch() === xdr.ScValType.scvI128()) {
            validation.max = parseInt(val.i128().toString())
          }
          break
        case 'pattern':
          if (val.switch() === xdr.ScValType.scvString()) {
            validation.pattern = val.str().toString()
          }
          break
        case 'enum':
          if (val.switch() === xdr.ScValType.scvVec()) {
            validation.enum = (val.vec() || [])
              .map((enumVal) => {
                if (enumVal.switch() === xdr.ScValType.scvString()) {
                  return enumVal.str().toString()
                }
                return ''
              })
              .filter((v) => v)
          }
          break
      }
    }

    return validation
  }

  /**
   * Encode attestation data according to the schema
   */
  async encodeData(data: Record<string, any>): Promise<EncodedAttestationData> {
    this.validateData(data)

    const encodedData = JSON.stringify(this.processDataForEncoding(data))
    const schemaHash = this.getSchemaHash()

    return {
      schemaHash,
      encodedData,
      decodedData: { ...data },
      schema: this.getSchema(),
    }
  }

  /**
   * Decode attestation data from encoded format
   */
  decodeData(encodedData: string): Record<string, any> {
    try {
      const parsed = JSON.parse(encodedData)
      return this.processDataForDecoding(parsed)
    } catch (error) {
      throw new SchemaValidationError(`Failed to decode data: ${error}`)
    }
  }

  /**
   * Create and configure AJV instance with custom formats for Stellar types
   */
  private createAjvInstance(): Ajv {
    const ajv = new Ajv({ 
      allErrors: true,
      verbose: true,
      strict: false, // Allow custom formats
      validateSchema: false // Don't validate the schema itself
    })
    
    // Add standard formats (date, time, email, etc.)
    addFormats(ajv)
    
    // Add custom Stellar formats
    ajv.addFormat('stellar-address', {
      type: 'string',
      validate: (value: string) => this.isValidStellarAddress(value)
    })
    
    ajv.addFormat('stellar-amount', {
      validate: (value: any) => {
        if (typeof value === 'number') return Number.isFinite(value) && value >= 0
        if (typeof value === 'string') return /^\d+$/.test(value)
        return false
      }
    })
    
    ajv.addFormat('stellar-i128', {
      validate: (value: any) => {
        if (typeof value === 'number') return Number.isInteger(value)
        if (typeof value === 'string') return /^-?\d+$/.test(value)
        return false
      }
    })
    
    ajv.addFormat('stellar-timestamp', {
      validate: (value: any) => {
        if (typeof value === 'number') return Number.isInteger(value) && value > 0
        if (typeof value === 'string') {
          const timestamp = new Date(value).getTime()
          return !isNaN(timestamp)
        }
        return false
      }
    })
    
    return ajv
  }

  /**
   * Validate data against the schema using AJV
   */
  validateData(data: Record<string, any>): void {
    const isValid = this.validator(data)
    
    if (!isValid && this.validator.errors) {
      // Convert AJV errors to our custom error format
      const error = this.validator.errors[0] // Get first error
      const fieldPath = error.instancePath.replace(/^\//, '') || error.params?.missingProperty
      const fieldName = fieldPath || 'unknown'
      
      let message: string
      switch (error.keyword) {
        case 'required':
          message = `Required field '${error.params.missingProperty}' is missing`
          break
        case 'type':
          message = `Field '${fieldName}' must be a ${error.params.type}`
          break
        case 'format':
          message = `Field '${fieldName}' has invalid format`
          break
        case 'enum':
          message = `Field '${fieldName}' must be one of: ${error.params.allowedValues.join(', ')}`
          break
        case 'minimum':
          message = `Field '${fieldName}' is below minimum value`
          break
        case 'maximum':
          message = `Field '${fieldName}' exceeds maximum value`
          break
        case 'pattern':
          message = `Field '${fieldName}' does not match pattern`
          break
        case 'additionalProperties':
          message = `Unknown field '${error.params.additionalProperty}'`
          break
        default:
          message = error.message || `Validation failed for field '${fieldName}'`
      }
      
      throw new SchemaValidationError(message, fieldName)
    }
  }

  /**
   * Generate default values for a schema
   */
  generateDefaults(): Record<string, any> {
    const defaults: Record<string, any> = {}

    for (const field of this.schema.fields) {
      if (field.optional) continue

      defaults[field.name] = this.getDefaultValue(field.type)
    }

    return defaults
  }

  /**
   * Convert schema to JSON Schema format for external compatibility
   */
  toJSONSchema(): object {
    const properties: Record<string, any> = {}
    const required: string[] = []

    for (const field of this.schema.fields) {
      properties[field.name] = {
        type: this.stellarTypeToJSONSchemaType(field.type),
        description: field.description,
      }

      // Add custom format hints for Stellar types
      if (field.type === StellarDataType.ADDRESS) {
        properties[field.name].format = 'stellar-address'
        properties[field.name].contentEncoding = 'base32'
        properties[field.name].contentMediaType = 'application/vnd.daccred.address; chain=stellar'
      } else if (field.type === StellarDataType.AMOUNT) {
        properties[field.name].format = 'stellar-amount'
      } else if (field.type === StellarDataType.I128) {
        properties[field.name].format = 'stellar-i128'
      } else if (field.type === StellarDataType.TIMESTAMP) {
        properties[field.name].format = 'stellar-timestamp'
      }

      if (field.validation) {
        // Convert our validation format to JSON Schema format
        const jsonSchemaValidation: any = {}
        if (field.validation.min !== undefined) jsonSchemaValidation.minimum = field.validation.min
        if (field.validation.max !== undefined) jsonSchemaValidation.maximum = field.validation.max
        if (field.validation.pattern) jsonSchemaValidation.pattern = field.validation.pattern
        if (field.validation.enum) jsonSchemaValidation.enum = field.validation.enum
        
        Object.assign(properties[field.name], jsonSchemaValidation)
      }

      if (!field.optional) {
        required.push(field.name)
      }
    }

    return {
      type: 'object',
      title: this.schema.name,
      description: this.schema.description,
      properties,
      required,
      additionalProperties: false,
    }
  }

  /**
   * Create a schema encoder from JSON Schema
   */
  static fromJSONSchema(jsonSchema: any): SorobanSchemaEncoder {
    const fields: SchemaField[] = []

    for (const [name, prop] of Object.entries(jsonSchema.properties || {})) {
      const property = prop as any
      const baseType = SorobanSchemaEncoder.jsonSchemaTypeToStellarType(property.type)

      // Detect Stellar address strictly by base32 encoding hint or custom media type
      const isBase32Encoded = property.contentEncoding === 'base32'
      const mediaType: string | undefined = property.contentMediaType
      const isWalletAddress = typeof mediaType === 'string' && mediaType.startsWith('application/vnd.daccred.address')
      const resolvedType =
        baseType === StellarDataType.STRING && (isBase32Encoded || isWalletAddress) ? StellarDataType.ADDRESS : baseType

      fields.push({
        name,
        type: resolvedType,
        optional: !jsonSchema.required?.includes(name),
        description: property.description,
        validation: {
          min: property.minimum,
          max: property.maximum,
          pattern: property.pattern,
          enum: property.enum,
        },
      })
    }

    const schema: StellarSchemaDefinition = {
      name: jsonSchema.title || 'Untitled Schema',
      description: jsonSchema.description || '',
      fields,
    }

    return new SorobanSchemaEncoder(schema)
  }

  /**
   * Validate schema definition
   */
  private validateSchema(schema: StellarSchemaDefinition): void {
    if (!schema.name || typeof schema.name !== 'string') {
      throw new SchemaValidationError('Schema must have a valid name')
    }

    if (!schema.fields || !Array.isArray(schema.fields) || schema.fields.length === 0) {
      throw new SchemaValidationError('Schema must have at least one field')
    }

    // Validate each field
    const fieldNames = new Set<string>()
    for (const field of schema.fields) {
      if (!field.name || typeof field.name !== 'string') {
        throw new SchemaValidationError('Each field must have a valid name')
      }

      if (fieldNames.has(field.name)) {
        throw new SchemaValidationError(`Duplicate field name: ${field.name}`)
      }
      fieldNames.add(field.name)

      if (!this.isValidStellarType(field.type)) {
        throw new SchemaValidationError(`Invalid type '${field.type}' for field '${field.name}'`)
      }
    }
  }



  /**
   * Process data for encoding (type conversions, etc.)
   */
  private processDataForEncoding(data: Record<string, any>): Record<string, any> {
    const processed: Record<string, any> = {}

    for (const [key, value] of Object.entries(data)) {
      const field = this.schema.fields.find((f) => f.name === key)
      if (!field) continue

      switch (field.type) {
        case StellarDataType.ADDRESS:
          // Ensure address is in proper format
          processed[key] = typeof value === 'string' ? value : value.toString()
          break

        case StellarDataType.TIMESTAMP:
          // Convert to Unix timestamp
          processed[key] = typeof value === 'string' ? new Date(value).getTime() : value
          break

        case StellarDataType.I128:
        case StellarDataType.AMOUNT:
          // Handle big numbers
          processed[key] = typeof value === 'bigint' ? value.toString() : value
          break

        default:
          processed[key] = value
      }
    }

    return processed
  }

  /**
   * Process data for decoding (reverse of encoding)
   */
  private processDataForDecoding(data: Record<string, any>): Record<string, any> {
    const processed: Record<string, any> = {}

    for (const [key, value] of Object.entries(data)) {
      const field = this.schema.fields.find((f) => f.name === key)
      if (!field) {
        processed[key] = value
        continue
      }

      switch (field.type) {
        case StellarDataType.I128:
        case StellarDataType.AMOUNT:
          // Convert back to BigInt if it was a string
          processed[key] = typeof value === 'string' && /^\d+$/.test(value) ? BigInt(value) : value
          break

        default:
          processed[key] = value
      }
    }

    return processed
  }

  /**
   * Get default value for a type
   */
  private getDefaultValue(type: string): any {
    switch (type) {
      case StellarDataType.STRING:
      case StellarDataType.SYMBOL:
        return ''
      case StellarDataType.BOOL:
        return false
      case StellarDataType.U32:
      case StellarDataType.U64:
      case StellarDataType.I32:
      case StellarDataType.I64:
      case StellarDataType.AMOUNT:
        return 0
      case StellarDataType.I128:
        return BigInt(0)
      case StellarDataType.ADDRESS:
        return 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
      case StellarDataType.TIMESTAMP:
        return Date.now()
      case StellarDataType.BYTES:
        return new Uint8Array(0)
      case StellarDataType.ARRAY:
        return []
      case StellarDataType.MAP:
        return {}
      default:
        return null
    }
  }

  /**
   * Check if a type is valid Stellar type
   */
  private isValidStellarType(type: string): boolean {
    return (
      Object.values(StellarDataType).includes(type as StellarDataType) ||
      type.startsWith('array<') ||
      type.startsWith('option<') ||
      type.startsWith('map<')
    )
  }

  /**
   * Convert Stellar type to a coarse JSON Schema "type".
   *
   * Key considerations:
   * - Numeric types (u32/u64/i32/i64/i128/amount/timestamp) map to 'number' to maximize
   *   interoperability with generic JSON Schema tooling, even though several are conceptually
   *   integers. Callers should treat them as integers where applicable.
   * - Values that can exceed JavaScript's safe integer range (i128/amount) are encoded as strings
   *   at runtime (see processDataForEncoding). Downstream validators may want to add a 'pattern'
   *   or custom 'format' to communicate this constraint.
   * - 'address' and 'symbol' are represented as 'string'. Schema authors can provide a 'pattern'
   *   to constrain an address, since JSON Schema does not natively know about Stellar addresses.
   * - 'array' and 'map' are generic container types; element/key/value types are not preserved by
   *   this mapping. For stronger typing, model nested fields explicitly or extend with metadata.
   */
  private stellarTypeToJSONSchemaType(stellarType: string): string {
    switch (stellarType) {
      case StellarDataType.STRING:
      case StellarDataType.SYMBOL:
      case StellarDataType.ADDRESS:
        return 'string'
      case StellarDataType.BOOL:
        return 'boolean'
      case StellarDataType.U32:
      case StellarDataType.U64:
      case StellarDataType.I32:
      case StellarDataType.I64:
      case StellarDataType.I128:
      case StellarDataType.NUMBER:
      case StellarDataType.AMOUNT:
      case StellarDataType.TIMESTAMP:
        return 'number'
      case StellarDataType.ARRAY:
        return 'array'
      case StellarDataType.MAP:
        return 'object'
      default:
        return 'string'
    }
  }

  /**
   * Convert a JSON Schema "type" into a Stellar type.
   *
   * Key considerations:
   * - JSON Schema collapses many specialized types into 'string' or 'number'. Without additional
   *   hints (e.g., 'format', 'pattern', or custom metadata), we default to the broadest sensible
   *   Stellar types.
   *   - 'number' and 'integer' default to i64.
   *   - 'string' remains a generic string (we do not assume 'address' or 'symbol').
   * - Arrays/objects map to generic 'array'/'map'; element types are not inferred.
   * - If you need address, amount, i128, or timestamp fidelity, provide explicit Stellar types in
   *   the schema definition or pre-process JSON Schema using metadata before calling this method.
   */
  private static jsonSchemaTypeToStellarType(jsonType: string): string {
    switch (jsonType) {
      case 'string':
        return StellarDataType.STRING
      case 'boolean':
        return StellarDataType.BOOL
      case 'number':
      case 'integer':
        return StellarDataType.I64
      case 'array':
        return StellarDataType.ARRAY
      case 'object':
        return StellarDataType.MAP
      default:
        return StellarDataType.STRING
    }
  }

  /**
   * Validate Stellar address format
   */
  private isValidStellarAddress(address: string): boolean {
    try {
      Address.fromString(address)
      return true
    } catch {
      return false
    }
  }
}
