/**
 * Tests for StellarAttestationClient implementation
 * 
 * These tests verify the core functionality of the Stellar SDK client
 * as defined in the requirements document.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { StellarAttestationClient } from '../src/client'
import {
  generateAttestationUid,
  generateSchemaUid,
  generateBlsKeys,
  encodeSchema,
  decodeSchema,
  createSimpleSchema
} from '../src/utils'
import { ClientOptions, TransactionSigner } from '../src/types'
import { Keypair, Transaction, Networks } from '@stellar/stellar-sdk'

const accountKeyPair = Keypair.random();
// A syntactically valid contract address for tests that need contractAddress.
const TEST_CONTRACT = 'CDJG5ZH7MU7KREGS256QAWO2QDKQJEZHBUJRF6S6ACG5BIS3M4D5WPQT'

describe('StellarAttestationClient', () => {
  let client: StellarAttestationClient
  
  beforeAll(async () => {
    // fund our Account KeyPair with the Friendbot API 
    const friendbotUrl = `https://friendbot.stellar.org?addr=${accountKeyPair.publicKey()}`
    await fetch(friendbotUrl)
    .then(response => response.json())
    .then(data => {
      console.log('Friendbot response:', data)
    })
    .catch(error => {
      console.error('Friendbot error:', error)
    })

    const options: ClientOptions = {
      rpcUrl: 'https://soroban-testnet.stellar.org',
      network: 'testnet',
      publicKey: accountKeyPair.publicKey(),
    }
    client = new StellarAttestationClient(options)
  })

  describe('Client Initialization', () => {
    it('should create a client instance', () => {
      expect(client).toBeDefined()
      expect(client.getClientInstance()).toBeDefined()
      expect(client.getServerInstance()).toBeDefined()
    })

    it('should handle mainnet configuration', () => {
      const mainnetClient = new StellarAttestationClient({
        rpcUrl: 'https://soroban.stellar.org',
        network: 'mainnet',
        publicKey: accountKeyPair.publicKey(),
      })
      expect(mainnetClient).toBeDefined()
    })

    it('should accept custom contract ID', () => {
      const customClient = new StellarAttestationClient({
        rpcUrl: 'https://soroban-testnet.stellar.org',
        contractId: 'CCUSTOMCONTRACTIDEXAMPLE123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        publicKey: accountKeyPair.publicKey(),
      })
      expect(customClient).toBeDefined()
    })
  })

  describe('UID Generation (Items 4-5)', () => {
    it('should generate attestation UID', () => {
      const schemaUid = Buffer.alloc(32, 1)
      const subject = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
      const attester = accountKeyPair.publicKey()
      const nonce = BigInt(12345)

      const uid = client.generateAttestationUid({
        contractAddress: TEST_CONTRACT,
        schemaUid,
        subject,
        attester,
        nonce,
      })

      expect(uid).toBeInstanceOf(Buffer)
      expect(uid.length).toBe(32)
    })

    it('should generate deterministic attestation UIDs', () => {
      const schemaUid = Buffer.alloc(32, 2)
      const subject = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
      const attester = accountKeyPair.publicKey()
      const nonce = BigInt(99999)

      const uid1 = generateAttestationUid(TEST_CONTRACT, schemaUid, subject, attester, nonce)
      const uid2 = generateAttestationUid(TEST_CONTRACT, schemaUid, subject, attester, nonce)

      expect(uid1.equals(uid2)).toBe(true)
    })

    it('should generate schema UID', () => {
      const definition = 'name:string,age:u32'
      const authority = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'

      const uid = client.generateSchemaUid({
        definition,
        authority,
        revocable: true,
      })

      expect(uid).toBeInstanceOf(Buffer)
      expect(uid.length).toBe(32)
    })

    it('should generate deterministic schema UIDs', () => {
      const definition = 'name:string,verified:bool'
      const authority = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
      const resolver = accountKeyPair.publicKey()

      const uid1 = generateSchemaUid(definition, authority, resolver, true)
      const uid2 = generateSchemaUid(definition, authority, resolver, true)

      expect(uid1.equals(uid2)).toBe(true)
    })
  })

  describe('BLS Key Generation (Item 13)', () => {
    it('should generate BLS key pairs', () => {
      const keyPair = client.generateBlsKeys()

      expect(keyPair).toBeDefined()
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array)
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array)
      expect(keyPair.publicKey.length).toBe(192) // Uncompressed G2 point
      expect(keyPair.privateKey.length).toBe(32)
    })

    it('should generate different keys each time', () => {
      const keyPair1 = generateBlsKeys()
      const keyPair2 = generateBlsKeys()

      expect(Buffer.compare(Buffer.from(keyPair1.privateKey), Buffer.from(keyPair2.privateKey))).not.toBe(0)
      expect(Buffer.compare(Buffer.from(keyPair1.publicKey), Buffer.from(keyPair2.publicKey))).not.toBe(0)
    })
  })

  describe('Schema Encoding/Decoding (Items 14-15)', () => {
    it('should encode schema to XDR', () => {
      const schema = createSimpleSchema('TestSchema', [
        { name: 'field1', type: 'string' },
        { name: 'field2', type: 'u32', optional: true }
      ])
      
      const encoded = client.encodeSchema(schema)
      
      expect(encoded).toBeDefined()
      expect(encoded).toMatch(/^XDR:/)
      expect(encoded.length).toBeGreaterThan(10)
    })

    it('should decode XDR schema', () => {
      const originalSchema = createSimpleSchema('TestSchema', [
        { name: 'username', type: 'string' },
        { name: 'age', type: 'u32' }
      ])
      
      const encoded = encodeSchema(originalSchema)
      const decoded = client.decodeSchema(encoded)
      
      expect(decoded).toBeDefined()
      expect(decoded.name).toBe('TestSchema')
      expect(decoded.fields).toHaveLength(2)
      expect(decoded.fields[0].name).toBe('username')
      expect(decoded.fields[0].type).toBe('string')
    })

    it('should handle JSON schema format', () => {
      const jsonSchema = {
        name: 'JSONSchema',
        version: '1.0',
        description: 'Test JSON schema',
        fields: [
          { name: 'id', type: 'u64', optional: false }
        ]
      }
      
      const jsonString = JSON.stringify(jsonSchema)
      const decoded = decodeSchema(jsonString)
      
      expect(decoded).toBeDefined()
      expect(decoded.name).toBe('JSONSchema')
      expect(decoded.fields).toHaveLength(1)
    })
  })

  describe('Message Creation (Items 9-10)', () => {
    it('should create attestation message for delegation', () => {
      const request = {
        schema_uid: Buffer.alloc(32, 3),
        subject: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        attester: accountKeyPair.publicKey(),
        value: 'test-value',
        nonce: BigInt(1000),
        deadline: BigInt(Date.now() + 3600000),
        expiration_time: undefined,
        signature: Buffer.alloc(96) // Placeholder
      }
      
      const dst = Buffer.from('ATTEST_PROTOCOL_V1_DELEGATED', 'utf8')
      const message = client.createAttestMessage(request, dst)
      
      expect(message).toBeDefined()
      expect(typeof message).toBe('object')
    })

    it('should create revocation message for delegation', () => {
      const request = {
        attestation_uid: Buffer.alloc(32, 4),
        schema_uid: Buffer.alloc(32, 5),
        subject: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        revoker: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        nonce: BigInt(2000),
        deadline: BigInt(Date.now() + 3600000),
        signature: Buffer.alloc(96) // Placeholder
      }
      
      const dst = Buffer.from('REVOKE_PROTOCOL_V1_DELEGATED', 'utf8')
      const message = client.createRevokeMessage(request, dst)
      
      expect(message).toBeDefined()
      expect(typeof message).toBe('object')
    })
  })

  describe('Error Handling', () => {
    it('should throw error for invalid schema UID in attestation generation', () => {
      expect(() => {
        generateAttestationUid(
          TEST_CONTRACT,
          Buffer.alloc(16), // Wrong size
          'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
          accountKeyPair.publicKey(),
          BigInt(1)
        )
      }).toThrow('schemaUid must be a 32-byte Buffer')
    })

    it('should throw error for invalid subject in attestation generation', () => {
      expect(() => {
        generateAttestationUid(
          TEST_CONTRACT,
          Buffer.alloc(32),
          'invalid-address',
          accountKeyPair.publicKey(),
          BigInt(1)
        )
      }).toThrow('subject must be a valid Stellar public key')
    })

    it('should throw error when publicKey is missing', () => {
      expect(() => {
        new StellarAttestationClient({
          rpcUrl: 'https://soroban-testnet.stellar.org',
          network: 'testnet'
        } as any) // Cast to bypass TypeScript for testing error case
      }).toThrow('Public key is required')
    })
  })

  describe('Transaction Signer Integration Tests', () => {
    let signer: TransactionSigner

    beforeAll(() => {
      // Create transaction signer for tests
      signer = {
        signTransaction: async (xdr: string) => {
          const { Transaction, Networks } = await import('@stellar/stellar-sdk')
          const tx = new Transaction(xdr, Networks.TESTNET)
          tx.sign(accountKeyPair)
          return tx.toXDR()
        }
      }
    })

    it('should support transaction signing with signer', () => {
      // Test that signer is properly configured
      expect(signer).toBeDefined()
      expect(signer.signTransaction).toBeInstanceOf(Function)
    })

    it('should generate UIDs deterministically via object form', () => {
      const schemaUid = Buffer.alloc(32, 1)
      const subject = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF'
      const attester = accountKeyPair.publicKey()
      const nonce = BigInt(12345)

      const uid1 = client.generateAttestationUid({
        contractAddress: TEST_CONTRACT,
        schemaUid,
        subject,
        attester,
        nonce,
      })
      const uid2 = client.generateAttestationUid({
        contractAddress: TEST_CONTRACT,
        schemaUid,
        subject,
        attester,
        nonce,
      })

      expect(uid1).toBeInstanceOf(Buffer)
      expect(uid2).toBeInstanceOf(Buffer)
      expect(Buffer.compare(uid1, uid2)).toBe(0)
    })

    it('should handle BLS key generation properly', () => {
      const keyPair = client.generateBlsKeys()

      expect(keyPair).toBeDefined()
      expect(keyPair.publicKey).toBeInstanceOf(Uint8Array)
      expect(keyPair.privateKey).toBeInstanceOf(Uint8Array)
      expect(keyPair.publicKey.length).toBe(192)
      expect(keyPair.privateKey.length).toBe(32)
    })

    it('should create proper delegation messages', () => {
      const attestRequest = {
        schema_uid: Buffer.alloc(32, 3),
        subject: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        attester: accountKeyPair.publicKey(),
        value: 'test-value',
        nonce: BigInt(1000),
        deadline: BigInt(Date.now() + 3600000),
        expiration_time: BigInt(Date.now() + 365 * 24 * 60 * 60 * 1000),
        signature: Buffer.alloc(96)
      }
      
      const revokeRequest = {
        attestation_uid: Buffer.alloc(32, 4),
        schema_uid: Buffer.alloc(32, 5),
        subject: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        revoker: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
        nonce: BigInt(2000),
        deadline: BigInt(Date.now() + 3600000),
        signature: Buffer.alloc(96)
      }
      
      const attestDst = Buffer.from('ATTEST_PROTOCOL_V1_DELEGATED', 'utf8')
      const revokeDst = Buffer.from('REVOKE_PROTOCOL_V1_DELEGATED', 'utf8')
      
      const attestMessage = client.createAttestMessage(attestRequest, attestDst)
      const revokeMessage = client.createRevokeMessage(revokeRequest, revokeDst)
      
      expect(attestMessage).toBeDefined()
      expect(revokeMessage).toBeDefined()
    })
  })
})