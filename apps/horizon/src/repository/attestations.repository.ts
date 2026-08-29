/**
 * Attestations repository for blockchain attestation management.
 *
 * Provides data access layer for storing and retrieving attestations from
 * the database. Handles attestation upsertion, querying with filtering
 * options, and maintains relationships with schemas.
 *
 * @module repository/attestations
 * @requires common/db
 */

import { getDB } from '../common/db'

// TypeScript interface for attestation API response (source of truth)
export interface Attestation {
  attestation_uid: string
  ledger: number
  schema_uid: string
  attesterAddress: string
  subjectAddress?: string
  transaction_hash: string
  schema_encoding: string
  message: string
  value?: Record<string, any>
  createdAt: string
  revokedAt?: string
  revoked: boolean
}

export interface AttestationFilters {
  ledger?: number
  schemaUid?: string
  attesterAddress?: string
  subjectAddress?: string
  revoked?: boolean
  contractAddress?: string
  limit?: number
  offset?: number
}

export interface AttestationData {
  attestationUid: string
  ledger: number
  schemaUid: string
  attesterAddress: string
  subjectAddress?: string
  transactionHash: string
  schemaEncoding: string
  message: string
  value?: Record<string, any>
  revoked?: boolean
  revokedAt?: Date
  createdAt?: Date  // Add optional createdAt to preserve blockchain timestamp
  contractAddress: string  // Contract that emitted this attestation
}

/**
 * Upserts a single attestation in the database.
 *
 * Creates or updates attestation data with proper validation and relationship 
 * linking to schemas. Handles duplicate detection and maintains data integrity.
 */
export async function singleUpsertAttestation(attestationData: AttestationData) {
  const db = await getDB()
  if (!db) {
    console.error('Database not available for singleUpsertAttestation')
    return null
  }

  try {
    const attestation = await db.attestation.upsert({
      where: { attestationUid: attestationData.attestationUid },
      update: {
        revoked: attestationData.revoked || false,
        revokedAt: attestationData.revokedAt,
        lastUpdated: new Date(),
        // DO NOT update createdAt or ingestedAt - preserve original timestamps
      },
      create: {
        attestationUid: attestationData.attestationUid,
        ledger: attestationData.ledger,
        schemaUid: attestationData.schemaUid,
        attesterAddress: attestationData.attesterAddress,
        subjectAddress: attestationData.subjectAddress,
        transactionHash: attestationData.transactionHash,
        schemaEncoding: attestationData.schemaEncoding,
        message: attestationData.message,
        value: attestationData.value,
        revoked: attestationData.revoked || false,
        revokedAt: attestationData.revokedAt,
        createdAt: attestationData.createdAt,  // Use blockchain timestamp only - no fallback
        contractAddress: attestationData.contractAddress,
      },
      // Removed schema include due to removed foreign key constraint
    })

    console.log(`✅ Upserted attestation: ${attestation.attestationUid}`)
    return attestation
  } catch (error: any) {
    console.error('Error upserting attestation:', error.message)
    return null
  }
}

/**
 * Retrieves attestations with filtering and pagination.
 *
 * Queries attestations with support for multiple filter criteria and
 * pagination. Includes related schema data and proper ordering.
 */
export async function getAttestations(filters: AttestationFilters = {}) {
  const db = await getDB()
  if (!db) {
    console.error('Database not available for getAttestations')
    return { attestations: [], total: 0 }
  }

  try {
    const {
      ledger,
      schemaUid,
      attesterAddress,
      subjectAddress,
      revoked,
      contractAddress,
      limit = 50,
      offset = 0,
    } = filters

    // Build where clause
    const where: any = {}
    
    if (ledger !== undefined) where.ledger = ledger
    if (schemaUid) where.schemaUid = schemaUid
    if (attesterAddress) where.attesterAddress = attesterAddress
    if (subjectAddress) where.subjectAddress = subjectAddress
    if (revoked !== undefined) where.revoked = revoked
    if (contractAddress) where.contractAddress = contractAddress

    // Build query params, omitting empty where for exact test expectations
    const findParams: any = {
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 200), // Enforce max limit
      skip: offset,
    }
    if (Object.keys(where).length > 0) {
      findParams.where = where
    }

    const countParams: any = Object.keys(where).length > 0 ? { where } : {}

    // Execute queries in parallel
    const [attestations, total] = await Promise.all([
      db.attestation.findMany(findParams),
      db.attestation.count(countParams),
    ])

    console.log(`📋 Retrieved ${attestations.length} attestations (${total} total)`) 
    return { attestations, total }
  } catch (error: any) {
    console.error('Error retrieving attestations:', error.message)
    return { attestations: [], total: 0 }
  }
}

/**
 * Retrieves a single attestation by UID.
 *
 * Fetches specific attestation with related schema data and full metadata.
 */
export async function getAttestationByUid(attestationUid: string) {
  const db = await getDB()
  if (!db) {
    console.error('Database not available for getAttestationByUid')
    return null
  }

  try {
    // Use findMany for compatibility with tests/mocks and return first match
    const results = await db.attestation.findMany({
      where: { attestationUid },
      take: 1,
    })
    const attestation = results[0] || null

    if (attestation) {
      console.log(`📋 Retrieved attestation: ${attestationUid}`)
    } else {
      console.log(`❌ Attestation not found: ${attestationUid}`)
    }

    return attestation
  } catch (error: any) {
    console.error(`Error retrieving attestation`, attestationUid, error.message)
    return null
  }
}

/**
 * Retrieves an attestation by transaction hash using two-step lookup.
 *
 * First queries the transactions table to get the UID from metadata,
 * then fetches the full attestation record.
 *
 * @param transactionHash - The transaction hash to search for
 * @returns The attestation object or null if not found
 */
export async function getAttestationByTxHash(transactionHash: string) {
  const db = await getDB()
  if (!db) {
    console.error('Database not available for getAttestationByTxHash')
    return null
  }

  try {
    // Step 1: Query transactions table to get metadata
    const transaction = await db.transaction.findFirst({
      where: {
        transactionHash,
        action: 'ATTEST:CREATE', // Verify it's an attestation action
      },
      orderBy: { timestamp: 'desc' },
    })

    if (!transaction || !transaction.metadata) {
      console.log(`❌ Transaction not found or missing metadata for tx hash: ${transactionHash}`)
      return null
    }

    // Step 2: Parse metadata array to extract UID
    // Expected format: [UID, payload, sourceAccount]
    const metadata = Array.isArray(transaction.metadata) ? transaction.metadata : []
    const attestationUid = metadata[0] as string // UID is first element

    if (!attestationUid) {
      console.log(`❌ No UID found in metadata for tx hash: ${transactionHash}`)
      return null
    }

    // Step 3: Fetch attestation by UID
    const results = await db.attestation.findMany({
      where: { attestationUid },
      take: 1,
    })
    const attestation = results[0] || null

    if (attestation) {
      console.log(`📋 Retrieved attestation by tx hash: ${transactionHash} -> UID: ${attestationUid}`)
    } else {
      console.log(`❌ Attestation not found for UID: ${attestationUid}`)
    }

    return attestation
  } catch (error: any) {
    console.error(`Error retrieving attestation by tx hash`, transactionHash, error.message)
    return null
  }
}

/**
 * Bulk upsert attestations from blockchain events.
 *
 * Processes multiple attestations for efficient database insertion
 * with duplicate handling. Used by ingestion processes.
 */
export async function bulkUpsertAttestations(attestations: AttestationData[]) {
  const db = await getDB()
  if (!db || attestations.length === 0) {
    return 0
  }

  try {
    let processedCount = 0

    await db.$transaction(async (tx) => {
      for (const attestationData of attestations) {
        try {
          await tx.attestation.upsert({
            where: { attestationUid: attestationData.attestationUid },
            update: {
              revoked: attestationData.revoked || false,
              revokedAt: attestationData.revokedAt,
              lastUpdated: new Date(),
              // DO NOT update createdAt or ingestedAt - preserve original timestamps
            },
            create: {
              attestationUid: attestationData.attestationUid,
              ledger: attestationData.ledger,
              schemaUid: attestationData.schemaUid,
              attesterAddress: attestationData.attesterAddress,
              subjectAddress: attestationData.subjectAddress,
              transactionHash: attestationData.transactionHash,
              schemaEncoding: attestationData.schemaEncoding,
              message: attestationData.message,
              value: attestationData.value,
              revoked: attestationData.revoked || false,
              revokedAt: attestationData.revokedAt,
              createdAt: attestationData.createdAt,  // Use blockchain timestamp only - no fallback
              contractAddress: attestationData.contractAddress,
            },
          })
          processedCount++
        } catch (error: any) {
          console.error(`Error processing attestation ${attestationData.attestationUid}:`, error.message)
        }
      }
    })

    console.log(`✅ Bulk processed ${processedCount} attestations`)
    return processedCount
  } catch (error: any) {
    console.error('Error in bulk upsert attestations:', error.message)
    return 0
  }
}