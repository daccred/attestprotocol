/**
 * Registry API router for managing attestations and schemas.
 *
 * Provides endpoints for querying attestations and schemas stored in the
 * database. Supports filtering, pagination, and detailed metadata access
 * for both attestation and schema objects.
 *
 * @module router/registry
 * @requires express
 * @requires repository/attestations
 * @requires repository/schemas
 */

import { Router, Request, Response } from 'express'
import {
  getAttestations,
  getAttestationByUid,
  getAttestationByTxHash,
  Attestation,
} from '../repository/attestations.repository'
import {
  getSchemas,
  getSchemaByUid,
  getSchemaByTxHash,
  Schema,
} from '../repository/schemas.repository'
import { resolveContractFilter } from '../common/registry'
import { STELLAR_NETWORK } from '../common/constants'

// Route constants for registry endpoints
const ATTESTATIONS_LIST_ROUTE = '/attestations'
const ATTESTATIONS_BY_UID_ROUTE = '/attestations/:uid'
const ATTESTATIONS_BY_TX_ROUTE = '/attestations/tx/:txHash'
const SCHEMAS_LIST_ROUTE = '/schemas'
const SCHEMAS_BY_UID_ROUTE = '/schemas/:uid'
const SCHEMAS_BY_TX_ROUTE = '/schemas/tx/:txHash'

const router = Router()

// Re-export interfaces from repositories (source of truth)
export type { Attestation } from '../repository/attestations.repository'
export type { Schema } from '../repository/schemas.repository'

/**
 * Helper function to transform attestation for API response
 */
function transformAttestationForAPI(attestation: any) {
  const valueString = typeof attestation?.value === 'string'
    ? attestation.value
    : attestation?.value != null
      ? JSON.stringify(attestation.value)
      : attestation?.message

  return {
    // Compatibility keys expected by tests/SDK
    uid: attestation.attestationUid,
    schemaUid: attestation.schemaUid,
    attesterAddress: attestation.attesterAddress,
    subjectAddress: attestation.subjectAddress,
    value: valueString,
    createdAt: attestation.createdAt?.toISOString(),
    revoked: attestation.revoked,
    ledger: attestation.ledger,
    // Legacy/supplemental fields kept for completeness
    attestation_uid: attestation.attestationUid,
    schema_uid: attestation.schemaUid,
    transaction_hash: attestation.transactionHash,
    schema_encoding: attestation.schemaEncoding,
    message: attestation.message,
    revokedAt: attestation.revokedAt?.toISOString(),
  }
}

/**
 * Helper function to transform schema for API response
 */
function transformSchemaForAPI(schema: any) {
  if (!schema) return schema
  return {
    // Compatibility keys expected by tests/SDK
    uid: schema.uid,
    ledger: schema.ledger,
    schemaDefinition: schema.schemaDefinition,
    parsedSchemaDefinition: schema.parsedSchemaDefinition,
    resolverAddress: schema.resolverAddress,
    revocable: schema.revocable,
    deployerAddress: schema.deployerAddress,
    attesterAddress: schema.deployerAddress, // alias for test expectations
    createdAt: schema.createdAt?.toISOString(),
    type: schema.type,
    transactionHash: schema.transactionHash,
    // Legacy/supplemental keys
    schema_definition: schema.schemaDefinition,
    parsed_schema_definition: schema.parsedSchemaDefinition,
    transaction_hash: schema.transactionHash,
  }
}

/**
 * GET /registry/attestations - Fetch a list of attestations.
 *
 * Retrieves attestations from the database with support for filtering
 * by ledger, schema, and attester. Results are paginated and include
 * comprehensive attestation metadata.
 *
 * @route GET /registry/attestations
 * @param {number} [by_ledger] - Filter attestations by ledger number
 * @param {number} [limit=50] - Number of results to return (max: 200)
 * @param {number} [offset=0] - Pagination offset
 * @param {string} [schema_uid] - Filter by schema UID
 * @param {string} [attester] - Filter by attester address
 * @param {string} [subject] - Filter by subject address
 * @param {boolean} [revoked] - Filter by revocation status
 * @returns {Object} Paginated attestations response
 * @returns {boolean} response.success - Operation success indicator
 * @returns {Array} response.data - Array of attestation objects
 * @returns {Object} response.pagination - Pagination metadata
 * @status 200 - Success with attestation data
 * @status 400 - Invalid parameters
 * @status 500 - Internal server error
 */
router.get(ATTESTATIONS_LIST_ROUTE, async (req: Request, res: Response) => {
  try {
    const {
      by_ledger,
      ledger,
      limit = '50',
      offset = '0',
      schema_uid,
      schemaUid,
      attester,
      subject,
      revoked,
      contract,
      version,
    } = req.query as any

    // Input validation
    const limitNum = Math.min(parseInt(limit as string) || 50, 200)
    const offsetNum = parseInt(offset as string) || 0
    
    if (limitNum < 1 || offsetNum < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid limit or offset parameters'
      })
    }

    // Build filters object
    const filters: any = {
      limit: limitNum,
      offset: offsetNum,
    }

    const ledgerParam = (ledger ?? by_ledger) as string | undefined
    if (ledgerParam) {
      const ledgerNum = parseInt(ledgerParam)
      if (isNaN(ledgerNum)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ledger parameter. Must be a number.'
        })
      }
      filters.ledger = ledgerNum
    }

    const schemaUidParam = (schemaUid ?? schema_uid) as string | undefined
    if (schemaUidParam) filters.schemaUid = schemaUidParam
    if (attester) filters.attesterAddress = attester as string
    if (subject) filters.subjectAddress = subject as string
    if (revoked !== undefined) filters.revoked = String(revoked) === 'true'

    let contractAddress: string | undefined
    try {
      contractAddress = resolveContractFilter(STELLAR_NETWORK, contract, version)
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message })
    }
    if (contractAddress) filters.contractAddress = contractAddress

    // Get attestations from repository
    const { attestations, total } = await getAttestations(filters)

    // Transform for API response
    const transformedAttestations = (attestations || []).filter(Boolean).map(transformAttestationForAPI)

    res.json({
      success: true,
      data: transformedAttestations,
      pagination: {
        total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: total > offsetNum + transformedAttestations.length,
      },
    })
  } catch (error: any) {
    console.error('Error fetching attestations:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch attestations' 
    })
  }
})

/**
 * GET /registry/attestations/:uid - Fetch a single attestation by UID.
 *
 * Retrieves a specific attestation by its unique identifier with full
 * metadata including schema details and current status.
 *
 * @route GET /registry/attestations/:uid
 * @param {string} uid - Attestation UID
 * @returns {Object} Attestation response
 * @returns {boolean} response.success - Operation success indicator
 * @returns {Object} response.data - Single attestation object
 * @status 200 - Success with attestation data
 * @status 404 - Attestation not found
 * @status 500 - Internal server error
 */
router.get(ATTESTATIONS_BY_UID_ROUTE, async (req: Request, res: Response) => {
  try {
    const { uid } = req.params

    const attestation = await getAttestationByUid(uid)

    if (!attestation) {
      return res.status(404).json({
        success: false,
        error: 'Attestation not found'
      })
    }

    const transformedAttestation = transformAttestationForAPI(attestation)

    res.json({
      success: true,
      data: transformedAttestation,
    })
  } catch (error: any) {
    console.error('Error fetching attestation:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch attestation'
    })
  }
})

/**
 * GET /registry/attestations/tx/:txHash - Fetch an attestation by transaction hash.
 *
 * Retrieves a specific attestation by its transaction hash with full
 * metadata including schema details and current status.
 *
 * @route GET /registry/attestations/tx/:txHash
 * @param {string} txHash - Transaction hash
 * @returns {Object} Attestation response
 * @returns {boolean} response.success - Operation success indicator
 * @returns {Object} response.data - Single attestation object
 * @status 200 - Success with attestation data
 * @status 404 - Attestation not found
 * @status 500 - Internal server error
 */
router.get(ATTESTATIONS_BY_TX_ROUTE, async (req: Request, res: Response) => {
  try {
    const { txHash } = req.params

    const attestation = await getAttestationByTxHash(txHash)

    if (!attestation) {
      return res.status(404).json({
        success: false,
        error: 'Attestation not found for transaction hash'
      })
    }

    const transformedAttestation = transformAttestationForAPI(attestation)

    res.json({
      success: true,
      data: transformedAttestation,
    })
  } catch (error: any) {
    console.error('Error fetching attestation by tx hash:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch attestation by transaction hash'
    })
  }
})

/**
 * GET /registry/schemas - Fetch a list of schemas.
 *
 * Retrieves schema definitions from the database with support for
 * filtering by ledger, deployer, and schema type. Results include
 * parsed schema definitions and related attestation counts.
 *
 * @route GET /registry/schemas
 * @param {number} [by_ledger] - Filter schemas by ledger number
 * @param {number} [limit=50] - Number of results to return (max: 200)
 * @param {number} [offset=0] - Pagination offset
 * @param {string} [deployer] - Filter by deployer address
 * @param {string} [type] - Filter by schema type
 * @param {boolean} [revocable] - Filter by revocable status
 * @returns {Object} Paginated schemas response
 * @returns {boolean} response.success - Operation success indicator
 * @returns {Array} response.data - Array of schema objects
 * @returns {Object} response.pagination - Pagination metadata
 * @status 200 - Success with schema data
 * @status 400 - Invalid parameters
 * @status 500 - Internal server error
 */
router.get(SCHEMAS_LIST_ROUTE, async (req: Request, res: Response) => {
  try {
    const {
      by_ledger,
      ledger,
      limit = '50',
      offset = '0',
      deployer,
      authority,
      type,
      context,
      revocable,
      contract,
      version,
    } = req.query as any

    // Input validation
    const limitNum = Math.min(parseInt(limit as string) || 50, 200)
    const offsetNum = parseInt(offset as string) || 0
    
    if (limitNum < 1 || offsetNum < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid limit or offset parameters'
      })
    }

    // Build filters object (search functionality removed as not needed)
    const filters: any = {
      limit: limitNum,
      offset: offsetNum,
    }

    const ledgerParam = (ledger ?? by_ledger) as string | undefined
    if (ledgerParam) {
      const ledgerNum = parseInt(ledgerParam)
      if (isNaN(ledgerNum)) {
        return res.status(400).json({
          success: false,
          error: 'Invalid ledger parameter. Must be a number.'
        })
      }
      filters.ledger = ledgerNum
    }

    const deployerParam = (authority ?? deployer) as string | undefined
    const typeParam = (context ?? type) as string | undefined

    if (deployerParam) filters.deployerAddress = deployerParam
    if (typeParam) filters.type = typeParam
    if (revocable !== undefined) filters.revocable = String(revocable) === 'true'

    let contractAddress: string | undefined
    try {
      contractAddress = resolveContractFilter(STELLAR_NETWORK, contract, version)
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message })
    }
    if (contractAddress) filters.contractAddress = contractAddress

    const result = await getSchemas(filters)

    // Transform for API response
    const transformedSchemas = (result.schemas || []).filter(Boolean).map(transformSchemaForAPI)

    res.json({
      success: true,
      data: transformedSchemas,
      pagination: {
        total: result.total,
        limit: limitNum,
        offset: offsetNum,
        hasMore: result.total > offsetNum + transformedSchemas.length,
      },
    })
  } catch (error: any) {
    console.error('Error fetching schemas:', error)
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to fetch schemas' 
    })
  }
})

/**
 * GET /registry/schemas/:uid - Fetch a single schema by UID.
 *
 * Retrieves a specific schema by its unique identifier with full
 * definition, parsed fields, deployment metadata, and related attestations.
 *
 * @route GET /registry/schemas/:uid
 * @param {string} uid - Schema UID
 * @param {boolean} [include_attestations=false] - Include full attestation data
 * @returns {Object} Schema response
 * @returns {boolean} response.success - Operation success indicator
 * @returns {Object} response.data - Single schema object
 * @status 200 - Success with schema data
 * @status 404 - Schema not found
 * @status 500 - Internal server error
 */
router.get(SCHEMAS_BY_UID_ROUTE, async (req: Request, res: Response) => {
  try {
    const { uid } = req.params
    const { include_attestations } = req.query

    const includeAttestations = include_attestations === 'true'
    const schema = await getSchemaByUid(uid, includeAttestations)

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found'
      })
    }

    const transformedSchema = transformSchemaForAPI(schema)

    res.json({
      success: true,
      data: transformedSchema,
    })
  } catch (error: any) {
    console.error('Error fetching schema:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch schema'
    })
  }
})

/**
 * GET /registry/schemas/tx/:txHash - Fetch a schema by transaction hash.
 *
 * Retrieves a specific schema by its transaction hash with full
 * definition, parsed fields, and deployment metadata.
 *
 * @route GET /registry/schemas/tx/:txHash
 * @param {string} txHash - Transaction hash
 * @param {boolean} [include_attestations=false] - Include full attestation data
 * @returns {Object} Schema response
 * @returns {boolean} response.success - Operation success indicator
 * @returns {Object} response.data - Single schema object
 * @status 200 - Success with schema data
 * @status 404 - Schema not found
 * @status 500 - Internal server error
 */
router.get(SCHEMAS_BY_TX_ROUTE, async (req: Request, res: Response) => {
  try {
    const { txHash } = req.params
    const { include_attestations } = req.query

    const includeAttestations = include_attestations === 'true'
    const schema = await getSchemaByTxHash(txHash, includeAttestations)

    if (!schema) {
      return res.status(404).json({
        success: false,
        error: 'Schema not found for transaction hash'
      })
    }

    const transformedSchema = transformSchemaForAPI(schema)

    res.json({
      success: true,
      data: transformedSchema,
    })
  } catch (error: any) {
    console.error('Error fetching schema by tx hash:', error)
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch schema by transaction hash'
    })
  }
})

export default router