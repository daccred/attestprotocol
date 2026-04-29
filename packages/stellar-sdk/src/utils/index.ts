/**
 * Utility functions for the Stellar Attest Protocol SDK
 *
 * This module exports all utility functions organized by category.
 */

// UID Generation utilities
export { generateAttestationUid, generateSchemaUid, formatUid, parseFormattedUid } from './uidGenerator'

// Schema encoding/decoding utilities
export { encodeSchema, decodeSchema, validateSchema, createSimpleSchema } from './dataCodec'

// Delegation utilities
export {
  createAttestMessage,
  createRevokeMessage,
  createDelegatedAttestationRequest,
  createDelegatedRevocationRequest,
} from '../delegation'

// BLS cryptography utilities
export {
  generateBlsKeys,
  signHashedMessage,
  verifySignature,
  validateG1PointFormat,
  aggregateSignatures,
  aggregatePublicKeys,
  verifyAggregateSignature,
  decompressPublicKey,
  compressPublicKey,
} from './bls'

// Horizon integration utilities
export {
  fetchAttestationsByLedger,
  fetchSchemasByLedger,
  fetchAttestationsByWallet,
  fetchSchemasByWallet,
  fetchLatestAttestations,
  fetchLatestSchemas,
  fetchRegistryDump,
  getAttestationByUid,
  getAttestationByTxHash,
  getSchemaByUid,
  getSchemaByTxHash,
  HORIZON_CONFIGS,
  REGISTRY_ENDPOINTS,
  type HorizonConfig,
  type RegistryDump,
} from './indexer'
