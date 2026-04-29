/**
 * Horizon Integration Utilities
 *
 * Functions for interacting with the Horizon API to fetch
 * attestations and schemas from the blockchain. Integrates with
 * the local horizon server instance primarily, with Stellar horizon
 * as complementary data source.
 */

import ky from 'ky'
import { ContractSchema, ContractAttestation } from '../types'
import { HorizonError, NetworkError } from '../common/errors'

/**
 * Horizon API configuration
 */
export interface HorizonConfig {
  baseUrl: string
  network: 'testnet' | 'mainnet' | 'local'
  registryUrl?: string
}

/**
 * Registry API response interfaces
 */
export interface RegistryPagination {
  total: number
  hasMore: boolean
  limit: number
  offset: number
}

export interface RegistryResponse<T> {
  success: boolean
  data: T[]
  pagination?: RegistryPagination
}

export interface RegistrySingleResponse<T> {
  success: boolean
  data: T
  error?: string
}

/**
 * Raw API data interfaces (as returned from registry router)
 */
export interface RawAttestationData {
  attestation_uid: string
  schema_uid: string
  subjectAddress: string
  attesterAddress: string
  value: any
  createdAt: string
  expiration_time?: number
  revokedAt?: string
  revoked: boolean
  ledger: number
  transaction_hash?: string
  transactionHash?: string
  schema_encoding?: string
  schemaEncoding?: string
  message?: string
}

export interface RawSchemaData {
  uid: string
  schema_definition?: string
  schemaDefinition?: string
  parsed_schema_definition?: any
  parsedSchemaDefinition?: any
  deployerAddress: string
  resolverAddress: string | null
  revocable: boolean
  createdAt: string
  ledger: number
  type?: string
  transaction_hash?: string
  transactionHash?: string
}

/**
 * Default Horizon configurations with registry endpoints
 */
export const HORIZON_CONFIGS: Record<string, HorizonConfig> = {
  local: {
    network: 'local',
    baseUrl: 'http://localhost:8000',
    registryUrl: 'http://localhost:3001/api/registry',
  },
  testnet: {
    network: 'testnet',
    baseUrl: 'https://horizon-testnet.stellar.org',
    registryUrl: 'https://testnet-graph.attest.so/api/registry',
  },
  mainnet: {
    network: 'mainnet',
    baseUrl: 'https://horizon.stellar.org',
    registryUrl: 'https://graph.attest.so/api/registry',
  },
}

/**
 * Registry API endpoints configuration
 * Primarily uses local horizon server instance
 */
export const REGISTRY_ENDPOINTS = {
  testnet: process.env.HORIZON_REGISTRY_URL || HORIZON_CONFIGS.testnet.registryUrl, 
  mainnet: process.env.HORIZON_REGISTRY_URL || HORIZON_CONFIGS.mainnet.registryUrl,
}


/**
 * Transform raw attestation data to ContractAttestation
 */
function transformAttestation(item: RawAttestationData): ContractAttestation {
  return {
    uid: Buffer.from(item.attestation_uid, 'hex'),
    schemaUid: Buffer.from(item.schema_uid, 'hex'),
    subject: item.subjectAddress,
    attester: item.attesterAddress,
    value: item.value,
    timestamp: new Date(item.createdAt).getTime(),
    expirationTime: item.expiration_time,
    revocationTime: item.revokedAt ? new Date(item.revokedAt).getTime() : undefined,
    revoked: item.revoked || false,
    ledger: item.ledger,
    transactionHash: item.transaction_hash || item.transactionHash,
    schemaEncoding: item.schema_encoding || item.schemaEncoding,
    message: item.message,
  }
}

/**
 * Transform raw schema data to ContractSchema
 */
function transformSchema(item: RawSchemaData): ContractSchema {
  if (!item.uid) {
    throw new Error('Schema UID is required but was not provided in the API response')
  }

  return {
    uid: Buffer.from(item.uid, 'hex'),
    definition: item.schema_definition || item.schemaDefinition || item.parsed_schema_definition || item.parsedSchemaDefinition,
    parsedDefinition: item.parsed_schema_definition || item.parsedSchemaDefinition,
    authority: item.deployerAddress,
    resolver: item.resolverAddress || '',
    revocable: item.revocable ?? true,
    timestamp: new Date(item.createdAt).getTime(),
    ledger: item.ledger,
    type: item.type,
    transactionHash: item.transaction_hash || item.transactionHash,
  }
}

/**
 * Fetch attestations by ledger number
 */
export async function fetchAttestationsByLedger(
  ledger: number,
  limit: number = 100,
  network: 'testnet' | 'mainnet' = 'testnet'
): Promise<ContractAttestation[]> {
  try {
    // Enforce maximum limit of 100 items
    const validLimit = Math.min(limit, 100)
    const endpoint = `${REGISTRY_ENDPOINTS[network]}/attestations`

    const apiResponse = await ky
      .get(endpoint, {
        searchParams: { by_ledger: ledger, limit: validLimit },
      })
      .json<RegistryResponse<RawAttestationData>>()

    // Transform the horizon registry API response to match our ContractAttestation type
    return (apiResponse.data || []).map(transformAttestation)
  } catch (error: any) {
    if (error instanceof HorizonError) {
      throw error
    }
    throw new NetworkError(`Failed to fetch attestations by ledger: ${error.message}`, error)
  }
}

/**
 * Fetch schemas by ledger number
 */
export async function fetchSchemasByLedger(
  ledger: number,
  limit: number = 100,
  network: 'testnet' | 'mainnet' = 'testnet'
): Promise<ContractSchema[]> {
  try {
    // Enforce maximum limit of 100 items
    const validLimit = Math.min(limit, 100)
    const endpoint = `${REGISTRY_ENDPOINTS[network]}/schemas`

    const apiResponse = await ky
      .get(endpoint, {
        searchParams: { by_ledger: ledger, limit: validLimit },
      })
      .json<RegistryResponse<RawSchemaData>>()

    // Transform the horizon registry API response to match our ContractSchema type
    return (apiResponse.data || []).map(transformSchema)
  } catch (error: any) {
    if (error instanceof HorizonError) {
      throw error
    }
    throw new NetworkError(`Failed to fetch schemas by ledger: ${error.message}`, error)
  }
}

/**
 * Fetch attestations by wallet address
 * Note: Only accepts limit parameter (max 100), no offset support
 */
export async function fetchAttestationsByWallet(
  walletAddress: string,
  limit: number = 100,
  network: 'testnet' | 'mainnet' = 'testnet'
): Promise<{
  attestations: ContractAttestation[]
  total: number
  hasMore: boolean
}> {
  try {
    // Enforce maximum limit of 100 items
    const validLimit = Math.min(limit, 100)
    const endpoint = `${REGISTRY_ENDPOINTS[network]}/attestations`

    const apiResponse = await ky
      .get(endpoint, {
        searchParams: { attester: walletAddress, limit: validLimit },
      })
      .json<RegistryResponse<RawAttestationData>>()

    return {
      attestations: (apiResponse.data || []).map(transformAttestation),
      total: apiResponse.pagination?.total || 0,
      hasMore: apiResponse.pagination?.hasMore || false,
    }
  } catch (error: any) {
    if (error instanceof HorizonError) {
      throw error
    }
    throw new NetworkError(`Failed to fetch attestations by wallet: ${error.message}`, error)
  }
}

/**
 * Fetch schemas by wallet address (schemas created by this wallet)
 * Note: Only accepts limit parameter (max 100), no offset support
 */
export async function fetchSchemasByWallet(
  walletAddress: string,
  limit: number = 100,
  network: 'testnet' | 'mainnet' = 'testnet'
): Promise<{
  schemas: ContractSchema[]
  total: number
  hasMore: boolean
}> {
  try {
    // Enforce maximum limit of 100 items
    const validLimit = Math.min(limit, 100)
    const endpoint = `${REGISTRY_ENDPOINTS[network]}/schemas`

    const apiResponse = await ky
      .get(endpoint, {
        searchParams: { deployer: walletAddress, limit: validLimit },
      })
      .json<RegistryResponse<RawSchemaData>>()

    return {
      schemas: (apiResponse.data || []).map(transformSchema),
      total: apiResponse.pagination?.total || 0,
      hasMore: apiResponse.pagination?.hasMore || false,
    }
  } catch (error: any) {
    if (error instanceof HorizonError) {
      throw error
    }
    throw new NetworkError(`Failed to fetch schemas by wallet: ${error.message}`, error)
  }
}

/**
 * Fetch latest attestations
 */
export async function fetchLatestAttestations(
  limit: number = 100,
  network: 'testnet' | 'mainnet' = 'testnet'
): Promise<ContractAttestation[]> {
  try {
    // Enforce maximum limit of 100 items
    const validLimit = Math.min(limit, 100)
    const endpoint = `${REGISTRY_ENDPOINTS[network]}/attestations`

    const apiResponse = await ky
      .get(endpoint, {
        searchParams: { limit: validLimit },
      })
      .json<RegistryResponse<RawAttestationData>>()

    return (apiResponse.data || []).map(transformAttestation)
  } catch (error: any) {
    if (error instanceof HorizonError) {
      throw error
    }
    throw new NetworkError(`Failed to fetch latest attestations: ${error.message}`, error)
  }
}

/**
 * Fetch latest schemas
 */
export async function fetchLatestSchemas(
  limit: number = 100,
  network: 'testnet' | 'mainnet' = 'testnet'
): Promise<ContractSchema[]> {
  try {
    // Enforce maximum limit of 100 items
    const validLimit = Math.min(limit, 100)
    const endpoint = `${REGISTRY_ENDPOINTS[network]}/schemas`

    const apiResponse = await ky
      .get(endpoint, {
        searchParams: { limit: validLimit },
      })
      .json<RegistryResponse<RawSchemaData>>()

    return (apiResponse.data || []).map(transformSchema)
  } catch (error: any) {
    if (error instanceof HorizonError) {
      throw error
    }
    throw new NetworkError(`Failed to fetch latest schemas: ${error.message}`, error)
  }
}

/**
 * Get a single attestation by UID
 */
export async function getAttestationByUid(
  uid: string,
  network: 'testnet' | 'mainnet' = 'testnet'
): Promise<ContractAttestation | null> {
  try {
    const endpoint = `${REGISTRY_ENDPOINTS[network]}/attestations/${uid}`

    const apiResponse = await ky.get(endpoint).json<RegistrySingleResponse<RawAttestationData>>()

    return transformAttestation(apiResponse.data)
  } catch (error: any) {
    // ky throws HTTPError for 404 responses
    if (error?.response?.status === 404) {
      return null
    }
    if (error instanceof HorizonError) {
      throw error
    }
    throw new NetworkError(`Failed to get attestation by UID: ${error.message}`, error)
  }
}

/**
 * Get a single attestation by transaction hash
 */
export async function getAttestationByTxHash(
  txHash: string,
  network: 'testnet' | 'mainnet' = 'testnet'
): Promise<ContractAttestation | null> {
  try {
    const endpoint = `${REGISTRY_ENDPOINTS[network]}/attestations/tx/${txHash}`

    const apiResponse = await ky.get(endpoint).json<RegistrySingleResponse<RawAttestationData>>()

    return transformAttestation(apiResponse.data)
  } catch (error: any) {
    // ky throws HTTPError for 404 responses
    if (error?.response?.status === 404) {
      return null
    }
    if (error instanceof HorizonError) {
      throw error
    }
    throw new NetworkError(`Failed to get attestation by transaction hash: ${error.message}`, error)
  }
}

/**
 * Get a single schema by UID
 */
export async function getSchemaByUid(
  uid: string,
  includeAttestations: boolean = false,
  network: 'testnet' | 'mainnet' = 'testnet'
): Promise<ContractSchema | null> {
  try {
    const endpoint = `${REGISTRY_ENDPOINTS[network]}/schemas/${uid}`

    const apiResponse = includeAttestations
      ? await ky.get(endpoint, { searchParams: { include_attestations: 'true' } }).json<RegistrySingleResponse<RawSchemaData>>()
      : await ky.get(endpoint).json<RegistrySingleResponse<RawSchemaData>>()

    return transformSchema(apiResponse.data)
  } catch (error: any) {
    // ky throws HTTPError for 404 responses
    if (error?.response?.status === 404) {
      return null
    }
    if (error instanceof HorizonError) {
      throw error
    }
    throw new NetworkError(`Failed to get schema by UID: ${error.message}`, error)
  }
}

/**
 * Get a single schema by transaction hash
 */
export async function getSchemaByTxHash(
  txHash: string,
  includeAttestations: boolean = false,
  network: 'testnet' | 'mainnet' = 'testnet'
): Promise<ContractSchema | null> {
  try {
    const endpoint = `${REGISTRY_ENDPOINTS[network]}/schemas/tx/${txHash}`

    const apiResponse = includeAttestations
      ? await ky.get(endpoint, { searchParams: { include_attestations: 'true' } }).json<RegistrySingleResponse<RawSchemaData>>()
      : await ky.get(endpoint).json<RegistrySingleResponse<RawSchemaData>>()

    return transformSchema(apiResponse.data)
  } catch (error: any) {
    // ky throws HTTPError for 404 responses
    if (error?.response?.status === 404) {
      return null
    }
    if (error instanceof HorizonError) {
      throw error
    }
    throw new NetworkError(`Failed to get schema by transaction hash: ${error.message}`, error)
  }
}

/**
 * Registry dump structure for bulk data retrieval
 */
export interface RegistryDump {
  schemas: ContractSchema[]
  attestations: ContractAttestation[]
  timestamp: number
  ledger: number
}

/**
 * Fetch the full registry dump
 */
export async function fetchRegistryDump(network: 'testnet' | 'mainnet' = 'testnet'): Promise<RegistryDump> {
  try {
    // Fetch both schemas and attestations in parallel since no single dump endpoint exists
    const [schemasApiResponse, attestationsApiResponse] = await Promise.all([
      ky
        .get(`${REGISTRY_ENDPOINTS[network]}/schemas`, {
          searchParams: { limit: 1000 },
        })
        .json<RegistryResponse<RawSchemaData>>(),
      ky
        .get(`${REGISTRY_ENDPOINTS[network]}/attestations`, {
          searchParams: { limit: 1000 },
        })
        .json<RegistryResponse<RawAttestationData>>(),
    ])

    return {
      schemas: (schemasApiResponse.data || []).map(transformSchema),
      attestations: (attestationsApiResponse.data || []).map(transformAttestation),
      timestamp: Date.now(),
      ledger: Math.max(...(attestationsApiResponse.data || []).map((a) => a.ledger || 0), 0),
    }
  } catch (error: any) {
    if (error instanceof HorizonError) {
      throw error
    }
    throw new NetworkError(`Failed to fetch registry dump: ${error.message}`, error)
  }
}
