/**
 * Stellar-specific types for the Attest Protocol SDK
 */

import { IProtocolConfig } from '@attestprotocol/core'

/**
 * Custom signer interface for Stellar transactions
 */
export interface StellarCustomSigner {
  signTransaction: (xdr: string) => Promise<{
    signedTxXdr: string
    signerAddress?: string
  }>
}

/**
 * Stellar-specific SDK configuration
 */
export interface StellarConfig extends IProtocolConfig {
  /**
   * Either a secret key string or a custom signer implementation
   */
  secretKeyOrCustomSigner: string | StellarCustomSigner

  /**
   * Public key address
   */
  publicKey: string

  /**
   * Network passphrase (defaults to TESTNET)
   */
  networkPassphrase?: string

  /**
   * Whether to allow HTTP connections (for development)
   */
  allowHttp?: boolean
}



/**
 * Client configuration options for initializing the Stellar SDK
 */
export interface ClientOptions {
  /** Soroban RPC URL */
  rpcUrl: string
  /** Network type: 'testnet' | 'mainnet' | 'futurenet' */
  network?: 'testnet' | 'mainnet' | 'futurenet' | 'local'
  /** Protocol contract ID */
  contractId?: string
  /** Registry version to resolve when contractId is not given; defaults to the network's current */
  contractVersion?: 'v1' | 'v2'
  /** Public Key for client instance*/
  publicKey: string
  /** Network passphrase override */
  networkPassphrase?: string
  /** Allow HTTP connections (for local development) */
  allowHttp?: boolean
}

/**
 * Transaction signer interface for wallet integration
 */
export interface TransactionSigner {
  /** Sign a transaction XDR and return the signed XDR */
  signTransaction(xdr: string, opts?: any): Promise<string>
}

/**
 * Transaction options for contract interactions
 */
export interface TxOptions {
  /** Maximum time to wait for transaction completion */
  timeoutInSeconds?: number
  /** Whether to simulate the transaction only */
  simulate?: boolean
  /** Optional signer for automatic transaction signing */
  signer?: TransactionSigner
}

/**
 * Options for submitting transactions
 */
export interface SubmitOptions extends TxOptions {
  /** Skip simulation before submission */
  skipSimulation?: boolean
}

/**
 * Delegated attestation request.
 *
 * The literal `type: 'attest'` discriminator is used by submitRawTx and
 * downstream dispatch logic to route the request to attestByDelegation
 * rather than relying on structural property sniffing (see H-SDK-2).
 */
export interface DelegatedAttestationRequest {
  /** Discriminator distinguishing attestation requests from revocation requests. */
  type: 'attest'
  /** The address of the original attester (who signed off-chain) */
  attester: string
  /** Expiration timestamp for this signed request */
  deadline: bigint
  /** Optional expiration time for the attestation itself */
  expiration_time: bigint | undefined
  /** The nonce for this attestation (must be the next expected nonce for the attester) */
  nonce: bigint
  /** The unique identifier of the schema this attestation follows */
  schema_uid: Buffer
  /** BLS12-381 G1 signature of the request data (96 bytes) */
  signature: Buffer
  /** The address of the entity that is the subject of this attestation */
  subject: string
  /** The value or content of the attestation */
  value: string
}

/**
 * Delegated revocation request.
 *
 * The literal `type: 'revoke'` discriminator is used by submitRawTx and
 * downstream dispatch logic to route the request to revokeByDelegation
 * rather than relying on structural property sniffing (see H-SDK-2).
 */
export interface DelegatedRevocationRequest {
  /** Discriminator distinguishing revocation requests from attestation requests. */
  type: 'revoke'
  /** The unique identifier of the attestation to revoke */
  attestation_uid: Buffer
  /** Expiration timestamp for this signed request */
  deadline: bigint
  /** The nonce of the attestation to revoke */
  nonce: bigint
  /** The address of the original attester (who signed off-chain) */
  revoker: string
  /** The unique identifier of the schema */
  schema_uid: Buffer
  /** BLS12-381 G1 signature of the request data (96 bytes) */
  signature: Buffer
  /** The address of the entity that is the subject of the attestation to revoke */
  subject: string
}

/**
 * BLS key pair for delegation
 */
export interface BlsKeyPair {
  /** Public key (192 bytes uncompressed) */
  publicKey: Uint8Array<ArrayBufferLike>
  /** Private key (32 bytes) */
  privateKey: Uint8Array
}

/**
 * Result of signature verification
 */
export interface VerificationResult {
  /** Whether the signature is valid */
  isValid: boolean
  /** Metadata extracted from the signature */
  metadata?: {
    /** Original message that was signed */
    originalMessage: Buffer
    /** Parsed input parameters */
    inputs: Record<string, any>
  }
}

/**
 * Schema object from contract
 */
export interface ContractSchema {
  uid: Buffer
  definition: string | any
  parsedDefinition?: any
  authority: string
  resolver?: string
  revocable: boolean
  timestamp: number
  ledger?: number
  type?: string
  transactionHash?: string
}

/**
 * Attestation object from contract
 */
export interface ContractAttestation {
  uid: Buffer
  schemaUid: Buffer
  subject: string
  attester: string
  value: string
  timestamp: number
  expirationTime?: number
  revocationTime?: number
  revoked: boolean
  ledger?: number
  transactionHash?: string
  schemaEncoding?: string
  message?: string
}

/**
 * Core API method argument interfaces
 */

/** Arguments for creating an attestation */
export interface AttestParams {
  /** Schema UID that defines the attestation structure */
  schemaUid: Buffer
  /** The attestation data/value */
  value: string
  /** Optional subject address (defaults to attester if not provided) */
  subject?: string
  /** Optional expiration timestamp */
  expirationTime?: number
  /** Transaction options including optional signer */
  options?: TxOptions
}

/** Arguments for revoking an attestation */
export interface RevokeParams {
  /** UID of the attestation to revoke */
  attestationUid: Buffer
  /** Transaction options including optional signer */
  options?: TxOptions
}

/** Arguments for creating a schema */
export interface CreateSchemaParams {
  /** Schema definition string */
  definition: string
  /** Optional resolver contract address */
  resolver?: string
  /** Whether attestations can be revoked (default: true) */
  revocable?: boolean
  /** Transaction options including optional signer */
  options?: TxOptions
}

/** Arguments for fetching attestations by wallet */
export interface FetchAttestationsByWalletParams {
  /** Wallet address to query */
  walletAddress: string
  /** Maximum number of results (default: 100, max: 100) */
  limit?: number
}

/** Arguments for fetching schemas by wallet */
export interface FetchSchemasByWalletParams {
  /** Wallet address to query */
  walletAddress: string
  /** Maximum number of results (default: 100, max: 100) */
  limit?: number
}

/** Arguments for fetching by ledger */
export interface FetchByLedgerParams {
  /** Ledger number to query */
  ledger: number
  /** Maximum number of results (default: 100) */
  limit?: number
}

/** Arguments for generating attestation UID (HAL-06 / C-SDK-1 layout) */
export interface GenerateAttestationUidParams {
  /** Deployed protocol contract address */
  contractAddress: string
  /** Schema UID */
  schemaUid: Buffer
  /** Subject address */
  subject: string
  /** Attester address */
  attester: string
  /** Unique nonce */
  nonce: bigint
}

/** Arguments for generating schema UID (C-CONTRACT-3 mirror) */
export interface GenerateSchemaUidParams {
  /** Schema definition */
  definition: string
  /** Authority address */
  authority: string
  /** Optional resolver address */
  resolver?: string
  /** Whether attestations against this schema may be revoked */
  revocable: boolean
}
