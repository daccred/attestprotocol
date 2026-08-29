/**
 * Contract registry router.
 *
 * Exposes the versioned contract registry for the network this indexer is
 * configured for, so clients resolve contract addresses from the indexer
 * instead of carrying their own copy.
 *
 * @module router/contracts
 * @requires express
 * @requires common/registry
 */

import { Router, Request, Response } from 'express'
import { networkRegistry, type ContractVersion } from '../common/registry'
import { STELLAR_NETWORK, CONTRACT_IDS_TO_INDEX } from '../common/constants'

// Route constants for contract registry endpoints
const CONTRACTS_LIST_ROUTE = '/'
const CONTRACTS_BY_VERSION_ROUTE = '/:version'

const router = Router()

/**
 * GET /contracts - The contract registry for the configured network.
 *
 * @route GET /contracts
 * @returns {Object} response.data.network - Configured Stellar network
 * @returns {string} response.data.current - Registry key of the live contract
 * @returns {Object} response.data.contracts - Every registered version entry
 * @returns {Array} response.data.indexing - Addresses this indexer tracks
 * @status 200 - Success
 * @status 500 - Internal server error
 */
router.get(CONTRACTS_LIST_ROUTE, async (_req: Request, res: Response) => {
  try {
    const { current, ...versions } = networkRegistry(STELLAR_NETWORK)
    res.json({
      success: true,
      data: {
        network: STELLAR_NETWORK,
        current,
        contracts: versions,
        indexing: CONTRACT_IDS_TO_INDEX,
      },
    })
  } catch (error: any) {
    console.error('Error reading contract registry:', error)
    res.status(500).json({ success: false, error: error.message || 'Failed to read registry' })
  }
})

/**
 * GET /contracts/:version - A single registry entry.
 *
 * @route GET /contracts/:version
 * @param {string} version - Registry key, e.g. 'v1' or 'v2'
 * @status 200 - Success with the entry
 * @status 404 - No such version on this network
 * @status 500 - Internal server error
 */
router.get(CONTRACTS_BY_VERSION_ROUTE, async (req: Request, res: Response) => {
  try {
    const { version } = req.params
    const registry = networkRegistry(STELLAR_NETWORK)
    const entry = registry[version as ContractVersion]

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: `Unknown contract version '${version}' for ${STELLAR_NETWORK}`,
      })
    }

    res.json({ success: true, data: entry })
  } catch (error: any) {
    console.error('Error reading contract registry entry:', error)
    res.status(500).json({ success: false, error: error.message || 'Failed to read registry' })
  }
})

export default router
