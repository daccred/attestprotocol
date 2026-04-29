/**
 * @attestprotocol/stellar-sdk
 *
 * Stellar implementation of the Attest Protocol SDK
 */
import './common/buffer'

export { getAttesterNonce } from './delegation'

// Export the new StellarAttestationClient (main entry point for SDK requirements)
export { StellarAttestationClient } from './client'

// Export service classes for direct use
export { StellarSchemaRegistry } from './schema'

// Export standardized schema encoder
export {
  SorobanSchemaEncoder,
  SorobanSchemaEncoder as StellarSchemaEncoder, // Alias for backward compatibility
  StellarDataType,
  SchemaValidationError,
  type StellarSchemaDefinition,
  type SchemaField,
  type EncodedAttestationData,
} from './common/schemaEncoder'

// Export Stellar-specific types
export * from './types'

// Export error handling utilities
export * from './common/errors'

// Re-export specific utilities at top level for convenience
export {
  generateBlsKeys,
  encodeSchema,
  decodeSchema,
  validateSchema,
  createAttestMessage,
  createRevokeMessage,
  generateAttestationUid,
  generateSchemaUid,
  formatUid,
  parseFormattedUid,
  createDelegatedAttestationRequest,
  createDelegatedRevocationRequest,
  createSimpleSchema,
  fetchRegistryDump,
  getAttestationByUid,
  getAttestationByTxHash,
  signHashedMessage,
  verifySignature,
  validateG1PointFormat,
  aggregateSignatures,
  aggregatePublicKeys,
  verifyAggregateSignature,
  decompressPublicKey,
  compressPublicKey,
  getSchemaByUid,
  getSchemaByTxHash,
  REGISTRY_ENDPOINTS,
} from './utils'

// Re-export core types for convenience
export {
  type AttestProtocolResponse,
  type Authority,
  type Schema,
  type Attestation,
  type SchemaDefinition,
  type AttestationDefinition,
  type RevocationDefinition,
  type IAttestProtocol,
  AttestProtocolErrorType,
  createSuccessResponse,
  createErrorResponse,
  createAttestProtocolError,
} from '@attestprotocol/core'


// Re-export contract bindings for advanced usage
export {
  Client as ProtocolClient,
  networks as ProtocolNetworks,
  type ResolverAttestation,
  type Schema as ProtocolSchema,
  type Authority as ProtocolAuthority,
  type Attestation as ProtocolAttestationRecord,
} from '@attestprotocol/stellar-contracts/protocol'

// Internal utilities (for advanced usage and testing)
export * as common from './common'
