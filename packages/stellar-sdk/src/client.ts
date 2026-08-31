/**
 * Stellar Client - Core client implementation for Stellar Attest Protocol SDK
 *
 * This client provides the main interface for interacting with the Attest Protocol
 * on the Stellar blockchain, implementing all methods defined in the requirements.
 */

import { Networks, rpc, xdr, Transaction } from '@stellar/stellar-sdk'
import { isBuffer } from './common/buffer'

import {
  type Client as ClientType,
  Client as ProtocolClient,
} from '@attestprotocol/stellar-contracts/protocol'
import { getContractId } from '@attestprotocol/stellar-contracts/registry'

import {
  ClientOptions,
  TxOptions,
  SubmitOptions,
  DelegatedAttestationRequest,
  DelegatedRevocationRequest,
  ContractSchema,
  ContractAttestation,
  BlsKeyPair,
  VerificationResult,
  TransactionSigner,
  AttestParams,
  RevokeParams,
  CreateSchemaParams,
  FetchAttestationsByWalletParams,
  FetchSchemasByWalletParams,
  FetchByLedgerParams,
  GenerateAttestationUidParams,
  GenerateSchemaUidParams,
} from './types'

import { generateAttestationUid, generateSchemaUid } from './utils/uidGenerator'
import { encodeSchema, decodeSchema } from './utils/dataCodec'
import { createAttestMessage, createRevokeMessage } from './delegation'
import { generateBlsKeys, verifySignature, signHashedMessage } from './utils/bls'
import {
  fetchAttestationsByLedger,
  fetchSchemasByLedger,
  fetchLatestAttestations,
  fetchLatestSchemas,
  fetchAttestationsByWallet,
  fetchSchemasByWallet,
} from './utils/indexer'
import {
  NetworkError,
  ContractError,
  TransactionError,
  ConfigurationError,
  ErrorFactory,
} from './common/errors'
import { WeierstrassPoint } from '@noble/curves/abstract/weierstrass.js'

/**
 * Main Stellar client for the Attest Protocol
 */
export class StellarAttestationClient {
  private attestationProtocol: ClientType
  private server: rpc.Server
  private networkPassphrase: string
  private callerPublicKey: string
  private options: ClientOptions
  private resolvedContractId: string

  constructor(options: ClientOptions) {
    this.options = options

    if (!options.publicKey) {
      throw new ConfigurationError('Public key is required')
    }
    this.callerPublicKey = options.publicKey

    // Initialize RPC server
    this.server = new rpc.Server(options.rpcUrl, {
      allowHttp: options.allowHttp ?? options.rpcUrl.startsWith('http://'),
    })

    // Set network passphrase
    if (options.networkPassphrase) {
      this.networkPassphrase = options.networkPassphrase
    } else {
      switch (options.network) {
        case 'mainnet':
          this.networkPassphrase = Networks.PUBLIC
          break
        case 'futurenet':
          this.networkPassphrase = Networks.FUTURENET
          break
        case 'testnet':
        default:
          this.networkPassphrase = Networks.TESTNET
          break
      }
    }

    // Determine contract ID
    let contractId = options.contractId
    if (!contractId) {
      const network = options.network === 'mainnet' ? 'mainnet' : 'testnet'
      contractId = getContractId(network, options.contractVersion)
    }

    if (!contractId) {
      throw new ConfigurationError(
        'Contract ID is required. Either provide it directly or specify a valid network.',
        'contractId'
      )
    }

    this.resolvedContractId = contractId

    // Initialize protocol client
    this.attestationProtocol = new ProtocolClient({
      contractId,
      rpcUrl: options.rpcUrl,
      publicKey: options.publicKey,
      networkPassphrase: this.networkPassphrase,
      allowHttp: options.allowHttp ?? options.rpcUrl.startsWith('http://'),
    })
  }

  /**
   * Revoke an attestation
   *
   * Usage Examples:
   *
   * // Object-based approach (recommended)
   * await client.revoke({
   *   attestationUid: Buffer.from('...'),
   *   options: { signer }
   * })
   *
   * // Legacy positional arguments (backward compatibility)
   * await client.revoke(attestationUid, { signer })
   */
  async revoke(params: RevokeParams): Promise<any>
  async revoke(attestationUid: Buffer, options?: TxOptions): Promise<any>
  async revoke(paramsOrUid: RevokeParams | Buffer, legacyOptions?: TxOptions): Promise<any> {
    try {
      // Handle both object and positional arguments
      const { attestationUid, options } = this.normalizeRevokeArgs(paramsOrUid, legacyOptions)

      const tx = await this.attestationProtocol.revoke({
        revoker: this.callerPublicKey,
        attestation_uid: attestationUid,
      })

      if (options?.simulate) {
        return await tx.simulate()
      }

      // If signer provided, sign and submit automatically
      if (options?.signer) {
        const signedXdr = await options.signer.signTransaction(tx.toXDR())
        return await this.submitTransaction(signedXdr)
      }

      // Return unsigned transaction for manual signing
      return tx
    } catch (error: any) {
      throw ErrorFactory.wrap(error, 'Failed to revoke attestation')
    }
  }

  /**
   * Create an attestation
   *
   * Usage Example:
   *
   * await client.attest({
   *   schemaUid: Buffer.from('...'),
   *   value: JSON.stringify({ name: 'John', age: 30 }),
   *   subject: 'GSUBJECT123...',
   *   expirationTime: Date.now() + 365*24*60*60*1000,
   *   options: { signer }
   * })
   */
  async attest(params: AttestParams): Promise<any> {
    try {
      const tx = await this.attestationProtocol.attest({
        attester: this.callerPublicKey,
        schema_uid: params.schemaUid,
        value: params.value,
        expiration_time: params.expirationTime ? BigInt(params.expirationTime) : undefined,
      })

      if (params.options?.simulate) {
        const result = await tx.simulate()
        // Return the full simulation result for SDK consumers to decide what they need
        return result
      }

      // If signer provided, sign and submit automatically
      if (params.options?.signer) {
        const signedXdr = await params.options.signer.signTransaction(tx.toXDR())
        const result = await this.submitTransaction(signedXdr)
        // Return the full transaction result
        return result
      }

      // Return unsigned transaction for manual signing
      return tx
    } catch (error: any) {
      throw new Error(`Failed to create attestation: ${error.message}`)
    }
  }

  /**
   * Generate attestation UID matching the Rust contract Layout A.
   *
   * Requires the deployed protocol contract address and the attester
   * (in addition to schemaUid, subject, and nonce) so that UIDs cannot
   * be replayed across deployments. Object-form is the only supported
   * shape post-HAL-06.
   *
   * Usage:
   *
   * const uid = client.generateAttestationUid({
   *   contractAddress: 'CCONTRACT...',
   *   schemaUid: Buffer.from('...'),
   *   subject: 'GSUBJECT...',
   *   attester: 'GATTESTER...',
   *   nonce: BigInt(12345),
   * })
   */
  generateAttestationUid(params: GenerateAttestationUidParams): Buffer {
    return generateAttestationUid(
      params.contractAddress,
      params.schemaUid,
      params.subject,
      params.attester,
      params.nonce
    )
  }

  /**
   * Generate schema UID matching the Rust contract Layout B.
   *
   * `revocable` is now a required field. Two schemas with identical
   * definition/authority/resolver but different revocability flags
   * produce different UIDs.
   *
   * Usage:
   *
   * const uid = client.generateSchemaUid({
   *   definition: 'struct Identity { string name; uint age; }',
   *   authority: 'GAUTHORITY...',
   *   resolver: 'GRESOLVER...', // optional
   *   revocable: true,
   * })
   */
  generateSchemaUid(params: GenerateSchemaUidParams): Buffer {
    return generateSchemaUid(params.definition, params.authority, params.resolver, params.revocable)
  }

  /**
   * Create a new schema
   *
   * Usage Example:
   *
   * await client.createSchema({
   *   definition: 'struct Identity { string name; uint age; }',
   *   resolver: 'GRESOLVER123...',
   *   revocable: true,
   *   options: { signer }
   * })
   */
  async createSchema(params: CreateSchemaParams): Promise<any> {
    try {
      const tx = await this.attestationProtocol.register({
        caller: this.callerPublicKey,
        schema_definition: params.definition,
        resolver: params.resolver || undefined,
        revocable: params.revocable ?? true,
      })

      if (params.options?.simulate) {
        const result = await tx.simulate()
        // Return the full simulation result for SDK consumers to decide what they need
        return result
      }

      // If signer provided, sign and submit automatically
      if (params.options?.signer) {
        const signedXdr = await params.options.signer.signTransaction(tx.toXDR())
        const result = await this.submitTransaction(signedXdr)
        // Return the full transaction result
        return result
      }

      // Return unsigned transaction for manual signing
      return tx
    } catch (error: any) {
      throw new Error(`Failed to create schema: ${error.message}`)
    }
  }

  /**
   * Get schema by UID
   */
  async getSchema(uid: Buffer): Promise<any> {
    try {
      const tx = await this.attestationProtocol.get_schema({
        schema_uid: uid,
      })

      const result = await tx.simulate()

      // Return the full simulation result for SDK consumers to decide what they need
      return result
    } catch (error: any) {
      throw new Error(`Failed to fetch schema: ${error.message}`)
    }
  }

  /**
   * Get attestation by UID
   */
  async getAttestation(uid: Buffer): Promise<any> {
    try {
      const tx = await this.attestationProtocol.get_attestation({
        attestation_uid: uid,
      })

      const result = await tx.simulate()

      // Return the full simulation result for SDK consumers to decide what they need
      return result
    } catch (error: any) {
      throw new Error(`Failed to fetch attestation: ${error.message}`)
    }
  }

  /**
   * 9. Create revoke message for delegation. The contract id and network
   * passphrase are bound into the message preimage (HAL-06).
   */
  createRevokeMessage(request: DelegatedRevocationRequest): WeierstrassPoint<bigint> {
    return createRevokeMessage(request, this.resolvedContractId, this.networkPassphrase)
  }

  /**
   * 10. Create attestation message for delegation. The contract id and
   * network passphrase are bound into the message preimage (HAL-06).
   */
  createAttestMessage(request: DelegatedAttestationRequest): WeierstrassPoint<bigint> {
    return createAttestMessage(request, this.resolvedContractId, this.networkPassphrase)
  }

  /**
   * 13. Generate BLS key pair
   */
  generateBlsKeys(): BlsKeyPair {
    return generateBlsKeys()
  }

  /**
   * Register a BLS public key for the caller
   *
   * @param publicKey - 192-byte BLS public key (G2 point)
   * @param options - Transaction options (signer, simulate)
   * @returns Transaction result or unsigned transaction
   */
  async registerBlsKey(publicKey: Buffer, options?: TxOptions): Promise<any> {
    try {
      if (publicKey.length !== 192) {
        throw new Error('BLS public key must be exactly 192 bytes (G2 point)')
      }

      const tx = await this.attestationProtocol.register_bls_key({
        attester: this.callerPublicKey,
        public_key: publicKey,
      })

      if (options?.simulate) {
        return await tx.simulate()
      }

      // If signer provided, sign and submit automatically
      if (options?.signer) {
        const signedXdr = await options.signer.signTransaction(tx.toXDR())
        return await this.submitTransaction(signedXdr)
      }

      // Return unsigned transaction for manual signing
      return tx
    } catch (error: any) {
      throw ErrorFactory.wrap(error, 'Failed to register BLS key')
    }
  }

  /**
   * Get the registered BLS public key for an attester
   *
   * @param attester - Address of the attester (defaults to caller if not provided)
   * @returns BLS public key data structure
   */
  async getBlsKey(attester?: string): Promise<any> {
    try {
      const tx = await this.attestationProtocol.get_bls_key({
        attester: attester || this.callerPublicKey,
      })

      const result = await tx.simulate()
      return result
    } catch (error: any) {
      throw ErrorFactory.wrap(error, `Failed to fetch BLS key for ${attester || this.callerPublicKey}`)
    }
  }

  /**
   * 14. Encode schema definition
   */
  encodeSchema(schema: any): string {
    return encodeSchema(schema)
  }

  /**
   * 15. Decode schema definition
   */
  decodeSchema(encoded: string): any {
    return decodeSchema(encoded)
  }

  /**
   * 16. Verify BLS signature
   */
  verifySignature(
    signedMessage: Buffer,
    publicKey: Buffer,
    expectedMessage: WeierstrassPoint<bigint>
  ): VerificationResult {
    return verifySignature({
      signature: signedMessage,
      publicKey,
      expectedMessage,
    })
  }

  /**
   * Submit a signed transaction to the network
   *
   * Usage Examples:
   *
   * // After manual signing
   * const tx = await client.createSchema(definition)
   * const signedXdr = await someWallet.signTransaction(tx.toXDR())
   * const result = await client.submitTransaction(signedXdr)
   */
  async submitTransaction(signedXdr: string, options?: SubmitOptions): Promise<any> {
    try {
      const transactionEnvelope = xdr.TransactionEnvelope.fromXDR(signedXdr, 'base64')
      const transaction = new Transaction(transactionEnvelope, this.networkPassphrase)

      if (!options?.skipSimulation) {
        // Simulate first
        const simResult = await this.server.simulateTransaction(transaction)
        if ('error' in simResult && simResult.error) {
          throw new Error(`Simulation failed: ${simResult.error}`)
        }
      }

      const result = await this.server.sendTransaction(transaction)
      return result
    } catch (error: any) {
      throw new Error(`Failed to submit transaction: ${error.message}`)
    }
  }

  /**
   * 17. Submit signed transaction (alias for submitTransaction)
   * @deprecated Use submitTransaction instead
   */
  async submitSignedTx(signedXdr: string, options?: SubmitOptions): Promise<any> {
    return this.submitTransaction(signedXdr, options)
  }

  /**
   * 18. Submit raw transaction with BLS signing
   */
  async submitRawTx(
    request: DelegatedAttestationRequest | DelegatedRevocationRequest,
    privateKey: Buffer,
    options?: TxOptions
  ): Promise<any> {
    try {
      // Dispatch on the literal `type` discriminator. Pre-fix, this used
      // `'schemaUid' in request && 'value' in request` which always evaluated
      // false because the runtime field is `schema_uid` (snake_case),
      // silently routing every attestation through the revocation path.
      const isAttestation = request.type === 'attest'

      // The contract id and network passphrase are bound into the BLS message
      // preimage on both branches (HAL-06). The DST helpers were removed.
      let message: WeierstrassPoint<bigint>
      let signedRequest: any

      if (isAttestation) {
        const attestRequest = request as DelegatedAttestationRequest
        message = this.createAttestMessage(attestRequest)

        // Sign the message with BLS private key
        const signature = signHashedMessage(message, privateKey)

        // Create signed request
        signedRequest = {
          ...attestRequest,
          signature,
        }

        // Submit via delegation
        return await this.attestByDelegation(signedRequest, options)
      } else {
        const revokeRequest = request as DelegatedRevocationRequest
        message = this.createRevokeMessage(revokeRequest)

        // Sign the message with BLS private key
        const signature = signHashedMessage(message, privateKey)

        // Create signed request
        signedRequest = {
          ...revokeRequest,
          signature,
        }

        // Submit via delegation
        return await this.revokeByDelegation(signedRequest, options)
      }
    } catch (error: any) {
      throw ErrorFactory.wrap(error, 'Failed to submit raw transaction')
    }
  }

  /**
   * 19. Get attestations by ledger (Horizon integration)
   */
  async getAttestationsByLedger(params: FetchByLedgerParams): Promise<ContractAttestation[]>
  async getAttestationsByLedger(ledger: number, limit?: number): Promise<ContractAttestation[]>
  async getAttestationsByLedger(
    paramsOrLedger: FetchByLedgerParams | number,
    legacyLimit?: number
  ): Promise<ContractAttestation[]> {
    try {
      const { ledger, limit } = this.normalizeFetchByLedgerArgs(paramsOrLedger, legacyLimit)

      const network = this.networkPassphrase === Networks.PUBLIC ? 'mainnet' : 'testnet'
      return await fetchAttestationsByLedger(ledger, limit, network)
    } catch (error: any) {
      throw ErrorFactory.wrap(error, 'Failed to fetch attestations by ledger')
    }
  }

  /**
   * 20. Attest by delegation
   *
   * Usage Examples:
   *
   * // CLI with Keypair
   * const signer = {
   *   signTransaction: async (xdr) => {
   *     const tx = new Transaction(xdr, Networks.TESTNET)
   *     tx.sign(keypair)
   *     return tx.toXDR()
   *   }
   * }
   * await client.attestByDelegation(request, { signer })
   *
   * // Manual signing
   * const tx = await client.attestByDelegation(request)
   * // User signs tx manually, then submit
   */
  async attestByDelegation(request: DelegatedAttestationRequest, options?: TxOptions): Promise<any> {
    try {
      const tx = await this.attestationProtocol.attest_by_delegation({
        submitter: this.callerPublicKey,
        request,
      })

      if (options?.simulate) {
        return await tx.simulate()
      }

      // If signer provided, sign and submit automatically
      if (options?.signer) {
        const signedXdr = await options.signer.signTransaction(tx.toXDR())
        return await this.submitTransaction(signedXdr)
      }

      // Return unsigned transaction for manual signing
      return tx
    } catch (error: any) {
      throw new Error(`Failed to attest by delegation: ${error.message}`)
    }
  }

  /**
   * 21. Revoke by delegation
   *
   * Usage Examples:
   *
   * // CLI with Keypair
   * const signer = {
   *   signTransaction: async (xdr) => {
   *     const tx = new Transaction(xdr, Networks.TESTNET)
   *     tx.sign(keypair)
   *     return tx.toXDR()
   *   }
   * }
   * await client.revokeByDelegation(request, { signer })
   *
   * // Manual signing
   * const tx = await client.revokeByDelegation(request)
   * // User signs tx manually, then submit
   */
  async revokeByDelegation(request: DelegatedRevocationRequest, options?: TxOptions): Promise<any> {
    try {
      const tx = await this.attestationProtocol.revoke_by_delegation({
        submitter: this.callerPublicKey,
        request,
      })

      if (options?.simulate) {
        return await tx.simulate()
      }

      // If signer provided, sign and submit automatically
      if (options?.signer) {
        const signedXdr = await options.signer.signTransaction(tx.toXDR())
        return await this.submitTransaction(signedXdr)
      }

      // Return unsigned transaction for manual signing
      return tx
    } catch (error: any) {
      throw new Error(`Failed to revoke by delegation: ${error.message}`)
    }
  }

  /**
   * 21. Fetch schemas from Horizon
   */
  async fetchSchemas(limit: number = 100): Promise<ContractSchema[]> {
    try {
      const network = this.networkPassphrase === Networks.PUBLIC ? 'mainnet' : 'testnet'
      return await fetchLatestSchemas(limit, network)
    } catch (error: any) {
      throw ErrorFactory.wrap(error, 'Failed to fetch schemas')
    }
  }

  /**
   * 22. Fetch attestations from Horizon
   */
  async fetchAttestations(limit: number = 100): Promise<ContractAttestation[]> {
    try {
      const network = this.networkPassphrase === Networks.PUBLIC ? 'mainnet' : 'testnet'
      return await fetchLatestAttestations(limit, network)
    } catch (error: any) {
      throw ErrorFactory.wrap(error, 'Failed to fetch attestations')
    }
  }

  /**
   * 23. Get schemas by ledger
   */
  async getSchemasByLedger(params: FetchByLedgerParams): Promise<ContractSchema[]>
  async getSchemasByLedger(ledger: number, limit?: number): Promise<ContractSchema[]>
  async getSchemasByLedger(
    paramsOrLedger: FetchByLedgerParams | number,
    legacyLimit?: number
  ): Promise<ContractSchema[]> {
    try {
      const { ledger, limit } = this.normalizeFetchByLedgerArgs(paramsOrLedger, legacyLimit)

      const network = this.networkPassphrase === Networks.PUBLIC ? 'mainnet' : 'testnet'
      return await fetchSchemasByLedger(ledger, limit, network)
    } catch (error: any) {
      throw ErrorFactory.wrap(error, 'Failed to fetch schemas by ledger')
    }
  }

  /**
   * Fetch attestations by wallet address
   *
   * Usage Examples:
   *
   * // Object-based approach (recommended)
   * const result = await client.fetchAttestationsByWallet({
   *   walletAddress: 'GWALLET123...',
   *   limit: 50
   * })
   *
   * // Legacy positional arguments
   * const result = await client.fetchAttestationsByWallet('GWALLET123...', 50)
   */
  async fetchAttestationsByWallet(params: FetchAttestationsByWalletParams): Promise<{
    attestations: ContractAttestation[]
    total: number
    hasMore: boolean
  }>
  async fetchAttestationsByWallet(
    walletAddress: string,
    limit?: number
  ): Promise<{
    attestations: ContractAttestation[]
    total: number
    hasMore: boolean
  }>
  async fetchAttestationsByWallet(
    paramsOrAddress: FetchAttestationsByWalletParams | string,
    legacyLimit?: number
  ): Promise<{
    attestations: ContractAttestation[]
    total: number
    hasMore: boolean
  }> {
    try {
      const { walletAddress, limit } = this.normalizeFetchAttestationsByWalletArgs(
        paramsOrAddress,
        legacyLimit
      )

      const network = this.networkPassphrase === Networks.PUBLIC ? 'mainnet' : 'testnet'
      return await fetchAttestationsByWallet(walletAddress, limit, network)
    } catch (error: any) {
      throw ErrorFactory.wrap(
        error,
        `Failed to fetch attestations for wallet ${typeof paramsOrAddress === 'string' ? paramsOrAddress : paramsOrAddress.walletAddress}`
      )
    }
  }

  /**
   * Fetch schemas created by a wallet address
   *
   * Usage Examples:
   *
   * // Object-based approach (recommended)
   * const result = await client.fetchSchemasByWallet({
   *   walletAddress: 'GWALLET123...',
   *   limit: 50
   * })
   *
   * // Legacy positional arguments
   * const result = await client.fetchSchemasByWallet('GWALLET123...', 50)
   */
  async fetchSchemasByWallet(params: FetchSchemasByWalletParams): Promise<{
    schemas: ContractSchema[]
    total: number
    hasMore: boolean
  }>
  async fetchSchemasByWallet(
    walletAddress: string,
    limit?: number
  ): Promise<{
    schemas: ContractSchema[]
    total: number
    hasMore: boolean
  }>
  async fetchSchemasByWallet(
    paramsOrAddress: FetchSchemasByWalletParams | string,
    legacyLimit?: number
  ): Promise<{
    schemas: ContractSchema[]
    total: number
    hasMore: boolean
  }> {
    try {
      const { walletAddress, limit } = this.normalizeFetchSchemasByWalletArgs(
        paramsOrAddress,
        legacyLimit
      )

      const network = this.networkPassphrase === Networks.PUBLIC ? 'mainnet' : 'testnet'
      return await fetchSchemasByWallet(walletAddress, limit, network)
    } catch (error: any) {
      throw ErrorFactory.wrap(
        error,
        `Failed to fetch schemas for wallet ${typeof paramsOrAddress === 'string' ? paramsOrAddress : paramsOrAddress.walletAddress}`
      )
    }
  }

  /**
   * Get the underlying protocol client for advanced usage
   */
  getClientInstance(): ProtocolClient {
    return this.attestationProtocol
  }

  /**
   * Get the RPC server instance
   */
  getServerInstance(): rpc.Server {
    return this.server
  }

  private normalizeRevokeArgs(
    paramsOrUid: RevokeParams | Buffer,
    legacyOptions?: TxOptions
  ): { attestationUid: Buffer; options?: TxOptions } {
    if (isBuffer(paramsOrUid)) {
      return {
        attestationUid: paramsOrUid,
        options: legacyOptions,
      }
    }
    return {
      attestationUid: paramsOrUid.attestationUid,
      options: paramsOrUid.options || legacyOptions,
    }
  }

  private normalizeFetchAttestationsByWalletArgs(
    paramsOrAddress: FetchAttestationsByWalletParams | string,
    legacyLimit?: number
  ): { walletAddress: string; limit: number } {
    if (typeof paramsOrAddress === 'string') {
      return {
        walletAddress: paramsOrAddress,
        limit: legacyLimit || 100,
      }
    }
    return {
      walletAddress: paramsOrAddress.walletAddress,
      limit: paramsOrAddress.limit || legacyLimit || 100,
    }
  }

  private normalizeFetchSchemasByWalletArgs(
    paramsOrAddress: FetchSchemasByWalletParams | string,
    legacyLimit?: number
  ): { walletAddress: string; limit: number } {
    if (typeof paramsOrAddress === 'string') {
      return {
        walletAddress: paramsOrAddress,
        limit: legacyLimit || 100,
      }
    }
    return {
      walletAddress: paramsOrAddress.walletAddress,
      limit: paramsOrAddress.limit || legacyLimit || 100,
    }
  }

  private normalizeFetchByLedgerArgs(
    paramsOrLedger: FetchByLedgerParams | number,
    legacyLimit?: number
  ): { ledger: number; limit: number } {
    if (typeof paramsOrLedger === 'number') {
      return {
        ledger: paramsOrLedger,
        limit: legacyLimit || 100,
      }
    }
    return {
      ledger: paramsOrLedger.ledger,
      limit: paramsOrLedger.limit || legacyLimit || 100,
    }
  }
}
