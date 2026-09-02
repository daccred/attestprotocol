/**
 * Delegated Attestation Integration Tests
 * 
 * This test suite validates the complete delegated attestation flow including:
 * - BLS key registration and management
 * - Cross-platform signature creation and verification
 * - Nonce management and replay protection
 * - Delegated submission mechanics
 * - Error handling and edge cases
 * 
 * @see https://www.npmjs.com/package/@noble/bls12-381
 * @see https://www.npmjs.com/package/@noble/curves
 * @see https://github.com/paulmillr/micro-key-producer - for generating BLS keys
 * 
 * 
 * 
 * Tests are designed to run against testnet deployments to validate
 * real-world protocol behavior.
 */

import { describe, it, expect, beforeAll, test } from 'vitest'
import { randomBytes } from 'crypto'
import { bls12_381 } from '@noble/curves/bls12-381.js'
import { Keypair, Transaction } from '@stellar/stellar-sdk'
import * as ProtocolContract from '../bindings/src/protocol'
import { TransactionSimulationPayload } from '../bindings/src/types'
import { loadTestConfig, fundAccountIfNeeded, generateAttestationUid, createAttestationMessage, createRevocationMessage, hasIntegrationTestEnv } from './testutils'

describe.skipIf(!hasIntegrationTestEnv)('Delegated Attestation Integration Tests', () => {
  let protocolClient: ProtocolContract.Client
  let adminKeypair: Keypair
  let config: {
    adminSecretKey: string
    rpcUrl: string
    protocolContractId: string
    authorityContractId: string
  }

  // Test accounts
  let attesterKp: Keypair
  let transactionRelayerKp: Keypair
  let subjectKp: Keypair

  const { secretKey: attesterBlsPrivateKey } = bls12_381.shortSignatures.keygen();
  const attesterBlsPublicKey = bls12_381.shortSignatures.getPublicKey(attesterBlsPrivateKey)


  // Test data
  let testRunId: string
  let schemaUid: Buffer
  let attestationUid: Buffer

  beforeAll(async () => {
    // Load test configuration
    config = loadTestConfig()
    testRunId = randomBytes(4).toString('hex')
    adminKeypair = Keypair.fromSecret(config.adminSecretKey)

    // Initialize protocol client
    protocolClient = new ProtocolContract.Client({
      contractId: config.protocolContractId,
      networkPassphrase: ProtocolContract.networks.testnet.networkPassphrase,
      rpcUrl: config.rpcUrl,
      allowHttp: true,
      publicKey: adminKeypair.publicKey()
    })

    // Generate test accounts
    attesterKp = Keypair.random()
    transactionRelayerKp = Keypair.random()
    subjectKp = Keypair.random()

    console.log(`Attester PK ===: ${attesterKp.publicKey()}`)
    console.log(`Transaction Relayer PK ===: ${transactionRelayerKp.publicKey()}`)
    console.log(`Subject PK ===: ${subjectKp.publicKey()}`)


    // Fund test accounts that need it
    const accounts = [
      adminKeypair.publicKey(),
      attesterKp.publicKey(),
      transactionRelayerKp.publicKey(),
      subjectKp.publicKey()
    ]

    for (const account of accounts) {
      await fundAccountIfNeeded(account)
    }

    // Wait for accounts to be ready
    await new Promise(resolve => setTimeout(resolve, 5000))
  }, 60000)

  it('should register a BLS public key for the attester', async () => {
    // Create a client with the attester as the publicKey
    const attesterProtocolClient = new ProtocolContract.Client({
      contractId: config.protocolContractId,
      networkPassphrase: ProtocolContract.networks.testnet.networkPassphrase,
      rpcUrl: config.rpcUrl,
      allowHttp: true,
      publicKey: attesterKp.publicKey()
    })
    
    const tx = await attesterProtocolClient.register_bls_key({
      attester: attesterKp.publicKey(),
      public_key: Buffer.from(attesterBlsPublicKey.toBytes(false))
    }, {
      fee: 1000000,
      timeoutInSeconds: 30
    })

    const sent = await tx.signAndSend({
      signTransaction: async (xdr) => {
        const transaction = new Transaction(xdr, ProtocolContract.networks.testnet.networkPassphrase)
        transaction.sign(attesterKp)
        return { signedTxXdr: transaction.toXDR() }
      }
    })

    const res = sent.result as ProtocolContract.contract.Result<void>
    expect(res.isOk()).toBe(true)
  }, 60000)

  it('should retrieve the registered BLS public key', async () => {
    const tx = await protocolClient.get_bls_key({
      attester: attesterKp.publicKey()
    })

    await tx.simulate()
    const payload = tx.toJSON()

    console.log(`========Raw BLS Result=======:`, { payload: JSON.parse(payload as unknown as string) })
    const data = JSON.parse(payload as unknown as string) as TransactionSimulationPayload
    expect(payload).toBeDefined()
    /**
     * @note: The BLS public key is usually 96 bytes long
     * although we work with the 192 uncompressed format
     * This is a hacky way to test the BLS public key is returned
     */
    expect(data.simulationResult.retval.length).toBeGreaterThan(96)
    
  }, 30000)

  it('should register a schema for delegated attestations', async () => {
    const schemaDefinition = `{"name":"Delegated Proof ${testRunId}","fields":[{"name":"claim","type":"string"}]}`
    
    const tx = await protocolClient.register({
      caller: adminKeypair.publicKey(),
      schema_definition: schemaDefinition,
      resolver: undefined, // No resolver for this test
      revocable: true
    }, {
      fee: 1000000,
      timeoutInSeconds: 30
    })

    const sent = await tx.signAndSend({
      signTransaction: async (xdr) => {
        const transaction = new Transaction(xdr, ProtocolContract.networks.testnet.networkPassphrase)
        transaction.sign(adminKeypair)
        return { signedTxXdr: transaction.toXDR() }
      }
    })

    const res = sent.result as ProtocolContract.contract.Result<Buffer>
    expect(res.isOk()).toBe(true)
    schemaUid = res.unwrap()
    console.log(`Schema registered for delegated attestations: ${schemaUid.toString('hex')}`)
  }, 60000)

  it('should get the attestation nonce for the attester', async () => {
    const tx = await protocolClient.get_attester_nonce({
      attester: attesterKp.publicKey()
    })

    await tx.simulate()
    const nonce = tx.result
    expect(typeof nonce).toBe('bigint')
    console.log(`Attester nonce: ${nonce}`)
  }, 30000)

  it('should get the DST (Domain Separation Tag) for attestation signatures', async () => {
    const tx = await protocolClient.get_dst_for_attestation()

    await tx.simulate()
    const dst = tx.result
    expect(dst).toBeInstanceOf(Buffer)
    expect(dst.length).toBeGreaterThan(0)
    console.log(`DST for attestation: ${Buffer.from(dst).toString('utf-8')}`)
  }, 30000)

  it('should create a delegated attestation request and submit it', async () => {
    if (!schemaUid) {
      throw new Error('Schema UID not available - schema registration test must pass first')
    }
    
        const delegatedRequestClient = new ProtocolContract.Client({
          contractId: config.protocolContractId,
          networkPassphrase: ProtocolContract.networks.testnet.networkPassphrase,
          rpcUrl: config.rpcUrl,
          allowHttp: true,
          publicKey: transactionRelayerKp.publicKey()
        })
    

    // Get current nonce
    const nonceTx = await delegatedRequestClient.get_attester_nonce({
      attester: attesterKp.publicKey()
    })
    await nonceTx.simulate()
    const nonce = nonceTx.result

    // Create deadline (1 hour from now)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)
    
    const attestationValue = `{"claim":"delegated_test_claim_${testRunId}"}`

    // Create the delegated attestation request
    const delegatedRequest: ProtocolContract.DelegatedAttestationRequest = {
        attester: attesterKp.publicKey(),
        deadline: deadline,
        nonce: nonce,
        schema_uid: schemaUid,
        subject: subjectKp.publicKey(),
        value: attestationValue,
        signature: Buffer.alloc(96),
        expiration_time: undefined
    }

    // Get the DST for signing
    const dstTx = await delegatedRequestClient.get_dst_for_attestation()
    await dstTx.simulate()
    const dst = Buffer.from(dstTx.result)

    // Create the message to sign
    const messageToSign = createAttestationMessage(delegatedRequest, dst, config.protocolContractId, ProtocolContract.networks.testnet.networkPassphrase)
    
    // Sign with BLS private key (minimal signature scheme)
    const signature = bls12_381.shortSignatures.sign(messageToSign, attesterBlsPrivateKey)
    delegatedRequest.signature = Buffer.from(signature.toBytes(false))

    // Submit the delegated attestation (submitter pays the fees)
    const tx = await delegatedRequestClient.attest_by_delegation({
      submitter: transactionRelayerKp.publicKey(),
      request: delegatedRequest
    }, {
      fee: 1000000,
      timeoutInSeconds: 30
    })

    const needsSigningBy = tx.needsNonInvokerSigningBy()
    console.log(`Needs signing by =========================: ${needsSigningBy}`)

    const sent = await tx.signAndSend({
      signTransaction: async (xdr) => {
        const transaction = new Transaction(xdr, ProtocolContract.networks.testnet.networkPassphrase)
        transaction.sign(transactionRelayerKp)
        return { signedTxXdr: transaction.toXDR() }
      }
    })

    
   
    console.log(`========Tx=======:`, {tx: sent.result })
    console.log(`========Sent Attestation=======:`, {sent})

    const res = sent.result as ProtocolContract.contract.Result<Buffer>
    expect(res.isOk()).toBe(true)
    attestationUid = res.unwrap()
    console.log(`Delegated attestation created successfully with UID: ${attestationUid}`)
  }, 60000)

  it('should verify nonce incremented after delegated attestation', async () => {
    const tx = await protocolClient.get_attester_nonce({
      attester: attesterKp.publicKey()
    })

    await tx.simulate()
    const nonce = tx.result
    expect(typeof nonce).toBe('bigint')
    expect(nonce).toBeGreaterThan(0n) // Should have incremented
    console.log(`Updated attester nonce: ${nonce}`)
  }, 30000)

  it('should create and submit a delegated revocation request', async () => {

    const delegatedRevokeClient = new ProtocolContract.Client({
      contractId: config.protocolContractId,
      networkPassphrase: ProtocolContract.networks.testnet.networkPassphrase,
      rpcUrl: config.rpcUrl,
      allowHttp: true,
      publicKey: transactionRelayerKp.publicKey()
    })
 

    // Revocations count on their own nonce sequence, not the attestation one.
    const nonceTx = await delegatedRevokeClient.get_revoker_nonce({
      revoker: attesterKp.publicKey()
    })
    await nonceTx.simulate()
    const nonce = nonceTx.result

    const attestationUid = generateAttestationUid(config.protocolContractId, schemaUid, subjectKp.publicKey(), attesterKp.publicKey(), BigInt(0))

    const attestationTx = await protocolClient.get_attestation({
      attestation_uid: attestationUid
    })
    await attestationTx.simulate()
    const attestationResult = attestationTx.result as ProtocolContract.contract.Result<ProtocolContract.Attestation>

    console.log(`========Delegated Attestation To Revoke =======:`, {attestationResult})
    const attestation = attestationResult.unwrap()

    // Create deadline (1 hour from now)
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

    // Create the delegated revocation request
    const delegatedRequest: ProtocolContract.DelegatedRevocationRequest = {
        attestation_uid: attestationUid,
        deadline: deadline,
        nonce: nonce,
        signature: Buffer.alloc(96),
        revoker: attestation.attester,
        schema_uid: attestation.schema_uid,
        subject: attestation.subject
    }

    // Get the DST for revocation signing
    const dstTx = await protocolClient.get_dst_for_revocation()
    await dstTx.simulate()
    const dst = Buffer.from(dstTx.result)

    console.log(`DST for revocation: ${Buffer.from(dst).toString('utf-8')}`)


    // Create the message to sign
    const messageToSign = createRevocationMessage(delegatedRequest, dst, config.protocolContractId, ProtocolContract.networks.testnet.networkPassphrase)
    
    // Sign with BLS privatshould retrieve the registered BLS public key key (minimal signature scheme)
    const signature = bls12_381.shortSignatures.sign(messageToSign, attesterBlsPrivateKey)
    delegatedRequest.signature = Buffer.from(signature.toBytes(false))

    // Submit the delegated revocation
    const tx = await delegatedRevokeClient.revoke_by_delegation({
      submitter: transactionRelayerKp.publicKey(),
      request: delegatedRequest
    }, {
      fee: 1000000,
      timeoutInSeconds: 30
    })

    const needsSigningBy = tx.needsNonInvokerSigningBy()
    console.log(`========Needs Signing By=======: ${needsSigningBy}`)
 

    const sent = await tx.signAndSend({
      signTransaction: async (xdr) => {
        const transaction = new Transaction(xdr, ProtocolContract.networks.testnet.networkPassphrase)
        // Relayer signs and pays fees
        transaction.sign(transactionRelayerKp) 
        return { signedTxXdr: transaction.toXDR() }
      }
    })

    const res = sent.result as ProtocolContract.contract.Result<Buffer>
    expect(res.isOk()).toBe(true)
    console.log(`Delegated revocation created successfully with UID: ${attestationUid}`)
  }, 60000)
})
