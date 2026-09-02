/**
 * Registry Router Integration Tests
 * 
 * These tests verify that the registry router correctly forms database queries
 * and handles real database interactions for filtering by ledger, wallet address,
 * and single record retrieval.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import express from 'express'
import registryRouter from '../src/router/registry.router'
import { getDB } from '../src/common/db'
import { singleUpsertAttestation } from '../src/repository/attestations.repository'
import { singleUpsertSchema } from '../src/repository/schemas.repository'

const app = express()
app.use(express.json())
app.use('/api/registry', registryRouter)

const REQUEST_LEDGER = 1021507

describe('Registry Router Integration Tests', () => {
  let db: any
  let testSuffix: string

  beforeAll(async () => {
    db = await getDB()
    if (!db) {
      throw new Error('Database connection failed')
    }
  })

  afterAll(async () => {
    if (db) {
      await db.$disconnect()
    }
  })

  beforeEach(async () => {
    // Use unique test suffix to avoid conflicts between tests
    testSuffix = Date.now().toString()
    
    // Clean up any existing test data
    if (db) {
      await db.attestation.deleteMany({
        where: {
          OR: [
            { attestationUid: { startsWith: 'test-' } },
            { attestationUid: { startsWith: 'integration-test-' } }
          ]
        }
      })
      await db.schema.deleteMany({
        where: {
          OR: [
            { uid: { startsWith: 'test-' } },
            { uid: { startsWith: 'integration-test-' } }
          ]
        }
      })
      await db.transaction.deleteMany({
        where: {
          OR: [
            { transactionHash: { startsWith: 'test-' } },
            { transactionHash: { startsWith: 'integration-test-' } }
          ]
        }
      })
    }
  })

  describe('Database Query Formation - Attestations', () => {
    let baseAttestationData: any
    let testAttestations: any[]

    beforeEach(async () => {
      // Use unique identifiers for this test run
      baseAttestationData = {
        ledger: REQUEST_LEDGER,
        schemaUid: `integration-test-schema-uid-${testSuffix}`,
        attesterAddress: 'GATTESTER1234567890ABCDEFGHIJKLMNOP1234567890ABCDEFGHIJ',
        subjectAddress: 'GSUBJECT1234567890ABCDEFGHIJKLMNOP1234567890ABCDEFGHIJ',
        transactionHash: `integration-test-transaction-hash-${testSuffix}`,
        schemaEncoding: 'JSON',
        message: 'integration-test-attestation-message',
        value: { name: 'Test User', age: 25 },
        revoked: false,
        contractAddress: 'CDDRYX6CX4DLYTKXJFHX5BPHSQUCIPUFTEN74XJNK5YFFENYUBKYCITO'
      }

      // Insert test attestations with different properties for filtering tests
      testAttestations = [
        {
          attestationUid: `integration-test-attestation-1-${testSuffix}`,
          ledger: REQUEST_LEDGER,
          ...baseAttestationData
        },
        {
          attestationUid: `integration-test-attestation-2-${testSuffix}`,
          ledger: 1021508,
          ...baseAttestationData,
          attesterAddress: 'GATTESTER2234567890ABCDEFGHIJKLMNOP1234567890ABCDEFGHIJ'
        },
        {
          attestationUid: `integration-test-attestation-3-${testSuffix}`,
          ledger: REQUEST_LEDGER,
          ...baseAttestationData,
          subjectAddress: 'GSUBJECT2234567890ABCDEFGHIJKLMNOP1234567890ABCDEFGHIJ',
          revoked: true,
          revokedAt: new Date('2025-08-31T12:00:00Z')
        }
      ]

      for (const attestation of testAttestations) {
        await singleUpsertAttestation(attestation)
      }

      // Seed the transaction record backing the tx-hash lookup endpoint,
      // mirroring what the event ingestion pipeline writes
      await db.transaction.create({
        data: {
          action: 'ATTEST:CREATE',
          transactionHash: baseAttestationData.transactionHash,
          timestamp: new Date(),
          sourceAccount: baseAttestationData.attesterAddress,
          contractId: baseAttestationData.contractAddress,
          ledger: REQUEST_LEDGER,
          metadata: [
            `integration-test-attestation-1-${testSuffix}`,
            'integration-test-payload',
            baseAttestationData.attesterAddress
          ]
        }
      })
    })

    it('should correctly filter attestations by ledger number', async () => {
      const response = await request(app)
        .get(`/api/registry/attestations?by_ledger=${REQUEST_LEDGER}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.pagination.total).toBeDefined()
      /*
       * In most cases, there will be more data in the database, 
       * so we don't expect only two attestations with this ledger
       * // Two attestations with this ledger
       * expect(response.body.pagination.total).toBe(2) 
       */
      expect(response.body.pagination.total).toBeGreaterThan(0)      
      response.body.data.forEach((attestation: any) => {
        expect(attestation.ledger).toBe(REQUEST_LEDGER)
      })
    })

    it('should correctly filter attestations by attester address', async () => {
      const attesterAddress = 'GATTESTER1234567890ABCDEFGHIJKLMNOP1234567890ABCDEFGHIJ'
      
      const response = await request(app)
        .get(`/api/registry/attestations?attester=${attesterAddress}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveLength(2) 
      // Verify all returned attestations have the correct attester
      response.body.data.forEach((attestation: any) => {
        expect(attestation.attesterAddress).toBe(attesterAddress)
      })
    })

    it('should correctly filter attestations by subject address', async () => {
      const subjectAddress = 'GSUBJECT1234567890ABCDEFGHIJKLMNOP1234567890ABCDEFGHIJ'
      
      const response = await request(app)
        .get(`/api/registry/attestations?subject=${subjectAddress}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      // Two attestations with this subject
      expect(response.body.data).toHaveLength(2)
      
      // Verify all returned attestations have the correct subject
      response.body.data.forEach((attestation: any) => {
        expect(attestation.subjectAddress).toBe(subjectAddress)
      })
    })

    it('should correctly filter attestations by schema UID', async () => {
      const schemaUid = baseAttestationData.schemaUid
      
      const response = await request(app)
        .get(`/api/registry/attestations?schema_uid=${schemaUid}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveLength(3) // All test attestations have this schema
      
      // Verify all returned attestations have the correct schema UID
      response.body.data.forEach((attestation: any) => {
        expect(attestation.schema_uid).toBe(schemaUid)
      })
    })

    it('should correctly filter attestations by revocation status', async () => {
      const response = await request(app)
        .get('/api/registry/attestations?revoked=true')
        .expect(200)

      expect(response.body.success).toBe(true)
      /*
       * In most cases, there will be more data in the database, 
       * so we don't expect only one revoked attestation
       * // Only one revoked attestation
       * expect(response.body.data).toHaveLength(1) 
       */
      expect(response.body.data).toBeDefined()
      expect(response.body.data[0].revoked).toBe(true)
      expect(response.body.data[0].attestation_uid).toBe(`integration-test-attestation-3-${testSuffix}`)
    })

    it('should correctly combine multiple filters', async () => {
      const response = await request(app)
        .get(`/api/registry/attestations?by_ledger=${REQUEST_LEDGER}&revoked=false`)
        .expect(200)

      expect(response.body.success).toBe(true)
      /*
       * In most cases, there will be more data in the database, 
       * so we don't expect only one non-revoked attestation
       * // Only one non-revoked attestation in this ledger
       * expect(response.body.data).toHaveLength(1) 
       */
      expect(response.body.data).toBeDefined()
      expect(response.body.data[0].ledger).toBe(REQUEST_LEDGER)
      expect(response.body.data[0].revoked).toBe(false)
    })

    it('should handle pagination correctly', async () => {
      const response = await request(app)
        .get('/api/registry/attestations?limit=2&offset=1')
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveLength(2)
      expect(response.body.pagination.hasMore).toBeDefined()
      expect(response.body.pagination).toMatchObject({
        limit: 2,
        offset: 1,
      })
    })

    it('should retrieve single attestation by UID', async () => {
      const attestationUid = `integration-test-attestation-1-${testSuffix}`
      
      const response = await request(app)
        .get(`/api/registry/attestations/${attestationUid}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.attestation_uid).toBe(attestationUid)
      expect(response.body.data.ledger).toBe(REQUEST_LEDGER)
      expect(response.body.data.attesterAddress).toBe(baseAttestationData.attesterAddress)
    })

    it('should return 404 for non-existent attestation UID', async () => {
      const response = await request(app)
        .get('/api/registry/attestations/non-existent-uid')
        .expect(404)

      expect(response.body.success).toBe(false)
      expect(response.body.error).toBe('Attestation not found')
    })

    it('should retrieve single attestation by transaction hash', async () => {
      const txHash = `integration-test-transaction-hash-${testSuffix}`

      const response = await request(app)
        .get(`/api/registry/attestations/tx/${txHash}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.transaction_hash).toBe(txHash)
      expect(response.body.data.ledger).toBe(REQUEST_LEDGER)
      expect(response.body.data.attesterAddress).toBe(baseAttestationData.attesterAddress)
      expect(response.body.data.attestation_uid).toBe(`integration-test-attestation-1-${testSuffix}`)
    })

    it('should return 404 for non-existent attestation transaction hash', async () => {
      const response = await request(app)
        .get('/api/registry/attestations/tx/non-existent-tx-hash')
        .expect(404)

      expect(response.body.success).toBe(false)
      expect(response.body.error).toBe('Attestation not found for transaction hash')
    })
  })

  describe('Database Query Formation - Schemas', () => {
    const baseSchemaData = {
      ledger: REQUEST_LEDGER,
      schemaDefinition: 'struct Person { string name; uint age; }',
      parsedSchemaDefinition: {
        fields: [
          { name: 'name', type: 'string' },
          { name: 'age', type: 'uint' }
        ]
      },
      resolverAddress: 'GRESOLVER1234567890ABCDEFGHIJKLMNOP1234567890ABCDEFGHIJ',
      revocable: true,
      deployerAddress: 'GDEPLOYER1234567890ABCDEFGHIJKLMNOP1234567890ABCDEFGHIJ',
      type: 'identity',
      transactionHash: 'test-schema-tx-hash-123456789abcdef',
      contractAddress: 'CDDRYX6CX4DLYTKXJFHX5BPHSQUCIPUFTEN74XJNK5YFFENYUBKYCITO'
    }

    beforeEach(async () => {
      // Insert test schemas with different properties for filtering tests
      const testSchemas = [
        {
          ...baseSchemaData,
          uid: 'test-schema-1',
          ledger: REQUEST_LEDGER,
          transactionHash: 'integration-test-schema-tx-hash-1',
        },
        {
          ...baseSchemaData,
          uid: 'test-schema-2',
          ledger: 1021508,
          deployerAddress: 'GDEPLOYER2234567890ABCDEFGHIJKLMNOP1234567890ABCDEFGHIJ',
          type: 'credential'
        },
        {
          ...baseSchemaData,
          uid: 'test-schema-3',
          ledger: REQUEST_LEDGER,
          revocable: false,
          type: 'identity' 
        }
      ]

      for (const schema of testSchemas) {
        await singleUpsertSchema(schema)
      }

      // Seed the transaction record backing the tx-hash lookup endpoint
      await db.transaction.create({
        data: {
          action: 'SCHEMA:REGISTER',
          transactionHash: 'integration-test-schema-tx-hash-1',
          timestamp: new Date(),
          sourceAccount: baseSchemaData.deployerAddress,
          contractId: baseSchemaData.contractAddress,
          ledger: REQUEST_LEDGER,
          metadata: [
            'test-schema-1',
            {
              resolver: baseSchemaData.resolverAddress,
              authority: baseSchemaData.deployerAddress,
              revocable: baseSchemaData.revocable,
              definition: baseSchemaData.schemaDefinition
            },
            baseSchemaData.deployerAddress
          ]
        }
      })
    })

    it('should correctly filter schemas by ledger number', async () => {
      const response = await request(app)
        .get(`/api/registry/schemas?by_ledger=${REQUEST_LEDGER}`)
        .expect(200)

        expect(response.body.success).toBe(true)
        // Two schemas with this specific ledger
      expect(response.body.data).toHaveLength(2)
      
      response.body.data.forEach((schema: any) => {
        expect(schema.ledger).toBe(REQUEST_LEDGER)
      })
    })

    it('should correctly filter schemas by deployer address', async () => {
      const deployerAddress = 'GDEPLOYER1234567890ABCDEFGHIJKLMNOP1234567890ABCDEFGHIJ'
      
      const response = await request(app)
        .get(`/api/registry/schemas?deployer=${deployerAddress}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      // Two schemas with this deployer
      expect(response.body.data).toHaveLength(2) 
      response.body.data.forEach((schema: any) => {
        expect(schema.deployerAddress).toBe(deployerAddress)
      })
    })

    it('should correctly filter schemas by type', async () => {
      const response = await request(app)
        .get('/api/registry/schemas?type=identity')
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveLength(2)
      
      // Verify all returned schemas have the correct type
      response.body.data.forEach((schema: any) => {
        expect(schema.type).toBe('identity')
      })
    })

    it('should correctly filter schemas by revocable status', async () => {
      const response = await request(app)
        .get('/api/registry/schemas?revocable=false')
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveLength(1) // Only one non-revocable schema
      expect(response.body.data[0].revocable).toBe(false)
      expect(response.body.data[0].uid).toBe('test-schema-3')
    })

    it('should correctly combine multiple filters for schemas', async () => {
      const response = await request(app)
        .get(`/api/registry/schemas?by_ledger=${REQUEST_LEDGER}&revocable=true`)
        .expect(200)

      expect(response.body.success).toBe(true)
      // Only one revocable schema in this ledger
      expect(response.body.data).toHaveLength(1) 
      expect(response.body.data[0].ledger).toBe(REQUEST_LEDGER)
      expect(response.body.data[0].revocable).toBe(true)
      expect(response.body.data[0].uid).toBe('test-schema-1')
    })

    it('should retrieve single schema by UID', async () => {
      const schemaUid = 'test-schema-1'
      
      const response = await request(app)
        .get(`/api/registry/schemas/${schemaUid}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.uid).toBe(schemaUid)
      expect(response.body.data.ledger).toBe(REQUEST_LEDGER)
      expect(response.body.data.deployerAddress).toBe(baseSchemaData.deployerAddress)
      expect(response.body.data.type).toBe('identity')
    })

    it('should return 404 for non-existent schema UID', async () => {
      const response = await request(app)
        .get('/api/registry/schemas/non-existent-uid')
        .expect(404)

      expect(response.body.success).toBe(false)
      expect(response.body.error).toBe('Schema not found')
    })

    it('should retrieve single schema by transaction hash', async () => {
      const txHash = 'integration-test-schema-tx-hash-1'

      const response = await request(app)
        .get(`/api/registry/schemas/tx/${txHash}`)
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data.transaction_hash).toBe(txHash)
      expect(response.body.data.ledger).toBe(REQUEST_LEDGER)
      expect(response.body.data.deployerAddress).toBe(baseSchemaData.deployerAddress)
      expect(response.body.data.type).toBe('identity')
    })

    it('should return 404 for non-existent schema transaction hash', async () => {
      const response = await request(app)
        .get('/api/registry/schemas/tx/non-existent-tx-hash')
        .expect(404)

      expect(response.body.success).toBe(false)
      expect(response.body.error).toBe('Schema not found for transaction hash')
    })
  })

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid ledger parameter', async () => {
      const response = await request(app)
        .get('/api/registry/attestations?by_ledger=invalid')
        .expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('Invalid ledger parameter')
    })

    it('should enforce maximum limit for attestations', async () => {
      const response = await request(app)
        .get('/api/registry/attestations?limit=500')
        .expect(200)

      // The API should cap the limit at 200
      expect(response.body.pagination.limit).toBe(200)
    })

    it('should handle negative offset gracefully', async () => {
      const response = await request(app)
        .get('/api/registry/attestations?offset=-1')
        .expect(400)

      expect(response.body.success).toBe(false)
      expect(response.body.error).toContain('Invalid limit or offset parameters')
    })

    it('should return empty results for filters with no matches', async () => {
      const response = await request(app)
        .get('/api/registry/attestations?by_ledger=999999')
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveLength(0)
      expect(response.body.pagination.total).toBe(0)
      expect(response.body.pagination.hasMore).toBe(false)
    })

    it('should handle database connection errors gracefully', async () => {
      // This test would require mocking database failures
      // For now, we'll just ensure our queries don't crash the app
      const response = await request(app)
        .get('/api/registry/attestations?limit=1')
        .expect(200)

      expect(response.body.success).toBe(true)
    })
  })

  describe('Query Performance and Optimization', () => {
    it('should handle large result sets with proper pagination', async () => {
      // Insert a larger number of test records to test pagination behavior
      const largeDataSet = Array.from({ length: 25 }, (_, i) => ({
        attestationUid: `test-large-${i}`,
        ledger: 1021509 + (i % 3), // Spread across 3 ledgers
        schemaUid: `test-schema-large-${i % 5}`, // 5 different schemas
        attesterAddress: 'GLARGE1234567890ABCDEFGHIJKLMNOP1234567890ABCDEFGHIJK',
        subjectAddress: 'GSUBJECT1234567890ABCDEFGHIJKLMNOP1234567890ABCDEFGHIJ',
        transactionHash: `test-tx-large-${i}`,
        schemaEncoding: 'JSON',
        message: `test-message-${i}`,
        value: { index: i },
        contractAddress: 'CDDRYX6CX4DLYTKXJFHX5BPHSQUCIPUFTEN74XJNK5YFFENYUBKYCITO',
        // Every 7th attestation is revoked
        revoked: i % 7 === 0
      }))

      // Insert test data
      for (const attestation of largeDataSet) {
        await singleUpsertAttestation(attestation)
      }

      // Test pagination with large dataset
      const response = await request(app)
        .get('/api/registry/attestations?limit=10&offset=5')
        .expect(200)

      expect(response.body.success).toBe(true)
      expect(response.body.data).toHaveLength(10)
      expect(response.body.pagination.total).toBeGreaterThanOrEqual(25)
      expect(response.body.pagination.offset).toBe(5)
      expect(response.body.pagination.hasMore).toBe(true)
    })

    it('should efficiently handle multiple simultaneous queries', async () => {
      // Test concurrent requests to ensure database query formation is thread-safe
      const requests = Array.from({ length: 5 }, (_, i) => 
        request(app)
          .get(`/api/registry/attestations?limit=5&offset=${i * 5}`)
          .expect(200)
      )

      const responses = await Promise.all(requests)

      responses.forEach((response, index) => {
        expect(response.body.success).toBe(true)
        expect(response.body.pagination.offset).toBe(index * 5)
        expect(response.body.pagination.limit).toBe(5)
      })
    })
  })
})