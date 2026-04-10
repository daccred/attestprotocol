/**
 * @attestprotocol/sdk
 *
 * Meta-package that provides unified access to the Attest Protocol Stellar implementation
 * This package re-exports the Stellar SDK and core types for convenience
 */

// Export Stellar SDK
export * from '@attestprotocol/stellar-sdk'

// Export core types and interfaces
export * from '@attestprotocol/core'

/**
 * Version information
 */
export const SDK_VERSION = '2.0.2'
export const SUPPORTED_CHAINS = ['stellar'] as const
export type ChainType = 'stellar'
