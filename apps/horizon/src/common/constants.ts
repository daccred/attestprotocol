import dotenv from 'dotenv'
import { getContractId, listContracts, type Network } from './registry'

dotenv.config()

/**
 * Module: constants
 *
 * Centralized configuration and network constants for the Horizon indexer.
 * Values are primarily sourced from environment variables with sensible defaults.
 */

/**
 * DATABASE_URL
 *
 * PostgreSQL connection string used by Prisma.
 * Example: postgres://user:password@host:port/dbname
 */
export const DATABASE_URL: string = process.env.DATABASE_URL || ''

/**
 * STELLAR_NETWORK
 *
 * Target Stellar network identifier. Supported values: 'mainnet' | 'testnet'.
 * Defaults to 'testnet' when not specified.
 */
export const STELLAR_NETWORK = (process.env.STELLAR_NETWORK || 'testnet') as Network

if (STELLAR_NETWORK !== 'testnet' && STELLAR_NETWORK !== 'mainnet') {
  throw new Error(`STELLAR_NETWORK must be 'testnet' or 'mainnet', got '${STELLAR_NETWORK}'`)
}

/**
 * CONTRACT_IDS_TO_INDEX
 *
 * Contract addresses the indexer tracks for events, operations and transactions.
 * Set INDEX_CONTRACT_IDS to a comma-separated list to restrict the set; when it
 * is empty every contract registered for STELLAR_NETWORK is indexed.
 */
const indexFromEnv = (process.env.INDEX_CONTRACT_IDS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export const CONTRACT_IDS_TO_INDEX: string[] =
  indexFromEnv.length > 0 ? indexFromEnv : listContracts(STELLAR_NETWORK).map((c) => c.id)

/**
 * PROTOCOL_CONTRACT_ID
 *
 * Attribution target: the address used wherever ingest needs a single contract.
 * Defaults to the registry's current version for STELLAR_NETWORK.
 */
export const PROTOCOL_CONTRACT_ID: string =
  process.env.PROTOCOL_CONTRACT_ID || getContractId(STELLAR_NETWORK)

if (!CONTRACT_IDS_TO_INDEX.includes(PROTOCOL_CONTRACT_ID)) {
  throw new Error(
    `PROTOCOL_CONTRACT_ID ${PROTOCOL_CONTRACT_ID} is not among the indexed contracts (${CONTRACT_IDS_TO_INDEX.join(',')})`
  )
}

/**
 * MAX_EVENTS_PER_FETCH
 *
 * Upper bound on the number of events requested per Soroban getEvents call.
 */
export const MAX_EVENTS_PER_FETCH = 100

/**
 * MAX_OPERATIONS_PER_FETCH
 *
 * Upper bound on the number of Horizon operations requested per contract query.
 */
export const MAX_OPERATIONS_PER_FETCH = 200

/**
 * LEDGER_HISTORY_LIMIT_DAYS
 *
 * Maximum lookback window (in days) when determining a historical start ledger.
 */
export const LEDGER_HISTORY_LIMIT_DAYS = 7

/**
 * sorobanRpcUrl
 *
 * Soroban JSON-RPC endpoint derived from STELLAR_NETWORK.
 * - mainnet  -> https://soroban-rpc.stellar.org
 * - testnet  -> https://soroban-testnet.stellar.org
 */
export let sorobanRpcUrl: string
if (STELLAR_NETWORK === 'mainnet') {
  sorobanRpcUrl = 'https://rpc.lightsail.network'
} else {
  sorobanRpcUrl = 'https://soroban-testnet.stellar.org'
}

/**
 * getHorizonBaseUrl
 *
 * Resolve the Horizon REST base URL for the configured network.
 * @returns The Horizon base URL for mainnet or testnet.
 */
export function getHorizonBaseUrl(): string {
  return STELLAR_NETWORK === 'mainnet'
    ? 'https://horizon.stellar.org'
    : 'https://horizon-testnet.stellar.org'
}

if (process.env.NODE_ENV !== 'test') {
  console.log(
    `horizon: network=${STELLAR_NETWORK} indexing=${CONTRACT_IDS_TO_INDEX.join(',')} target=${PROTOCOL_CONTRACT_ID}`
  )
}
