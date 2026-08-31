/**
 * Schemas repository for blockchain schema management.
 *
 * Provides data access layer for storing and retrieving schemas from
 * the database. Handles schema upsertion, querying with filtering options,
 * and maintains relationships with attestations.
 *
 * @module repository/schemas
 * @requires common/db
 */

import { getDB } from '../common/db'

// TypeScript interface for schema API response (source of truth)
export interface Schema {
  uid: string
  ledger: number
  schema_definition: string
  parsed_schema_definition?: Record<string, any>
  resolverAddress: string | null
  revocable: boolean
  deployerAddress: string
  createdAt: string
  type: string
  transaction_hash: string
}

export interface SchemaFilters {
  ledger?: number
  deployerAddress?: string
  type?: string
  revocable?: boolean
  contractAddress?: string
  limit?: number
  offset?: number
}

export interface SchemaData {
  uid: string
  ledger: number
  schemaDefinition: string
  parsedSchemaDefinition?: Record<string, any>
  resolverAddress?: string | null
  revocable?: boolean
  deployerAddress: string
  type?: string
  transactionHash: string
  createdAt?: Date  // Add optional createdAt to preserve blockchain timestamp
  contractAddress: string  // Contract that registered this schema
}

/**
 * Upserts a single schema in the database.
 *
 * Creates or updates schema data with proper validation and indexing for 
 * efficient querying. Handles duplicate detection and maintains data integrity.
 */
export async function singleUpsertSchema(schemaData: SchemaData) {
  const db = await getDB()
  if (!db) {
    console.error('Database not available for singleUpsertSchema')
    return null
  }

  try {
    const schema = await db.schema.upsert({
      where: { uid: schemaData.uid },
      update: {
        parsedSchemaDefinition: schemaData.parsedSchemaDefinition,
        lastUpdated: new Date(),
        // DO NOT update createdAt or ingestedAt - preserve original timestamps
      },
      create: {
        uid: schemaData.uid,
        ledger: schemaData.ledger,
        schemaDefinition: schemaData.schemaDefinition,
        parsedSchemaDefinition: schemaData.parsedSchemaDefinition,
        resolverAddress: schemaData.resolverAddress,
        revocable: schemaData.revocable !== false,
        deployerAddress: schemaData.deployerAddress,
        type: schemaData.type || 'default',
        transactionHash: schemaData.transactionHash,
        createdAt: schemaData.createdAt,  // Use blockchain timestamp only - no fallback
        contractAddress: schemaData.contractAddress,
      },
      // Removed attestations include due to removed foreign key constraint
    })

    console.log(`✅ Upserted schema: ${schema.uid}`)
    return schema
  } catch (error: any) {
    console.error('Error upserting schema:', error.message)
    return null
  }
}

/**
 * Retrieves schemas with filtering and pagination.
 *
 * Queries schemas with support for multiple filter criteria and
 * pagination. Includes related attestation counts and proper ordering.
 */
export async function getSchemas(filters: SchemaFilters = {}) {
  const db = await getDB()
  if (!db) {
    console.error('Database not available for getSchemas')
    return { schemas: [], total: 0 }
  }

  try {
    const {
      ledger,
      deployerAddress,
      type,
      revocable,
      contractAddress,
      limit = 50,
      offset = 0,
    } = filters

    // Build where clause
    const where: any = {}
    
    if (ledger !== undefined) where.ledger = ledger
    if (deployerAddress) where.deployerAddress = deployerAddress
    if (type) where.type = type
    if (revocable !== undefined) where.revocable = revocable
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
    const [schemas, total] = await Promise.all([
      db.schema.findMany(findParams),
      db.schema.count(countParams),
    ])

    console.log(`📋 Retrieved ${schemas.length} schemas (${total} total)`) 
    return { schemas, total }
  } catch (error: any) {
    console.error('Error retrieving schemas:', error.message)
    return { schemas: [], total: 0 }
  }
}

/**
 * Retrieves a single schema by UID.
 *
 * Fetches specific schema with related attestation data and full metadata.
 */
export async function getSchemaByUid(uid: string, includeAttestations: boolean = false) {
  const db = await getDB()
  if (!db) {
    console.error('Database not available for getSchemaByUid')
    return null
  }

  try {
    // Use findMany for compatibility with tests/mocks and return first match
    const results = await db.schema.findMany({
      where: { uid },
      take: 1,
    })
    const schema = results[0] || null

    if (schema) {
      console.log(`📋 Retrieved schema: ${uid}`)
    } else {
      console.log(`❌ Schema not found: ${uid}`)
    }

    return schema
  } catch (error: any) {
    console.error(`Error retrieving schema UID`, uid, error.message)
    return null
  }
}

/**
 * Retrieves a schema by transaction hash using two-step lookup.
 *
 * First queries the transactions table to get the UID from metadata,
 * then fetches the full schema record.
 *
 * @param transactionHash - The transaction hash to search for
 * @param includeAttestations - Whether to include related attestations (not used currently)
 * @returns The schema object or null if not found
 */
export async function getSchemaByTxHash(transactionHash: string, includeAttestations: boolean = false) {
  const db = await getDB()
  if (!db) {
    console.error('Database not available for getSchemaByTxHash')
    return null
  }

  
  try {
    // Step 1: Query transactions table to get metadata
    const transaction = await db.transaction.findFirst({
      where: {
        transactionHash,
        action: 'SCHEMA:REGISTER', // Verify it's a schema registration action
      },
      orderBy: { timestamp: 'desc' },
    })

    if (!transaction || !transaction.metadata) {
      console.log(`❌ Transaction not found or missing metadata for tx hash: ${transactionHash}`)
      return null
    }

    // Step 2: Parse metadata array to extract UID
    // Expected format: [UID, { resolver, authority, revocable, definition }, sourceAccount]
    const metadata = Array.isArray(transaction.metadata) ? transaction.metadata : []

    console.log({metadata}, "metadata")
    const schemaUid = metadata[0] as string// UID is first element

    if (!schemaUid) {
      console.log(`❌ No UID found in metadata for tx hash: ${transactionHash}`)
      return null
    }

    // Step 3: Fetch schema by UID
    const results = await db.schema.findMany({
      where: { uid: schemaUid },
      take: 1,
    })
    const schema = results[0] || null

    if (schema) {
      console.log(`📋 Retrieved schema by tx hash: ${transactionHash} -> UID: ${schemaUid}`)
    } else {
      console.log(`❌ Schema not found for UID: ${schemaUid}`)
    }

    return schema
  } catch (error: any) {
    console.error(`Error retrieving schema by tx hash`, transactionHash, error.message)
    return null
  }
}

/**
 * Bulk upsert schemas from blockchain events.
 *
 * Processes multiple schemas for efficient database insertion
 * with duplicate handling. Used by ingestion processes.
 */
export async function bulkUpsertSchemas(schemas: SchemaData[]) {
  const db = await getDB()
  if (!db || schemas.length === 0) {
    return 0
  }

  try {
    let processedCount = 0

    await db.$transaction(async (tx) => {
      for (const schemaData of schemas) {
        try {
          await tx.schema.upsert({
            where: { uid: schemaData.uid },
            update: {
              parsedSchemaDefinition: schemaData.parsedSchemaDefinition,
              lastUpdated: new Date(),
              // DO NOT update createdAt or ingestedAt - preserve original timestamps
            },
            create: {
              uid: schemaData.uid,
              ledger: schemaData.ledger,
              schemaDefinition: schemaData.schemaDefinition,
              parsedSchemaDefinition: schemaData.parsedSchemaDefinition,
              resolverAddress: schemaData.resolverAddress,
              revocable: schemaData.revocable !== false,
              deployerAddress: schemaData.deployerAddress,
              type: schemaData.type || 'default',
              transactionHash: schemaData.transactionHash,
              createdAt: schemaData.createdAt,  // Use blockchain timestamp only - no fallback
              contractAddress: schemaData.contractAddress,
            },
          })
          processedCount++
        } catch (error: any) {
          console.error(`Error processing schema ${schemaData.uid}:`, error.message)
        }
      }
    })

    console.log(`✅ Bulk processed ${processedCount} schemas`)
    return processedCount
  } catch (error: any) {
    console.error('Error in bulk upsert schemas:', error.message)
    return 0
  }
}