/**
 * Data access router providing direct database query endpoints.
 *
 * Implements RESTful endpoints for accessing blockchain data stored in the
 * database. Provides paginated access to events, transactions, operations,
 * effects, contract data, accounts, and payments with flexible filtering options.
 *
 * @module router/data
 * @requires express
 * @requires common/db
 */

import { Router, Request, Response } from 'express'
import { getDB } from '../common/db'
import { resolveContractFilter } from '../common/registry'
import { STELLAR_NETWORK } from '../common/constants'

// Route constants for data endpoints
const DATA_EVENTS_ROUTE = '/events'
const DATA_TRANSACTIONS_ROUTE = '/transactions'
const DATA_OPERATIONS_ROUTE = '/operations'
const DATA_ACCOUNTS_ROUTE = '/accounts'
const DATA_PAYMENTS_ROUTE = '/payments'

const router = Router()

/**
 * GET /data/events - Query contract events with filtering and pagination.
 *
 * Retrieves stored contract events with support for filtering by contract,
 * event type, and ledger range. Results include associated transaction data
 * and are paginated for efficient data transfer.
 *
 * @route GET /data/events
 * @param {string} [contractId] - Filter events by contract ID
 * @param {string} [eventType] - Filter by specific event type
 * @param {string} [limit='50'] - Results per page (max: 200)
 * @param {string} [offset='0'] - Pagination offset
 * @param {string} [ledgerStart] - Minimum ledger sequence number
 * @param {string} [ledgerEnd] - Maximum ledger sequence number
 * @param {string} [cursor] - Pagination cursor (future use)
 * @returns {Object} Paginated event response
 * @returns {boolean} response.success - Operation success indicator
 * @returns {Array} response.data - Event records with transaction details
 * @returns {Object} response.pagination - Pagination metadata
 * @returns {number} response.pagination.total - Total matching records
 * @returns {number} response.pagination.limit - Applied page size
 * @returns {number} response.pagination.offset - Current offset
 * @returns {boolean} response.pagination.hasMore - More pages available
 * @status 200 - Success with event data
 * @status 503 - Database unavailable
 * @status 500 - Internal server error
 */
router.get(DATA_EVENTS_ROUTE, async (req: Request, res: Response) => {
  try {
    const db = await getDB()
    if (!db) {
      return res.status(503).json({ error: 'Database not available' })
    }

    const {
      contractId,
      eventType,
      limit = '50',
      offset = '0',
      ledgerStart,
      ledgerEnd,
      cursor,
      contract,
      version,
    } = req.query

    let resolvedContract: string | undefined
    try {
      resolvedContract = resolveContractFilter(
        STELLAR_NETWORK,
        contract as string | undefined,
        version as string | undefined
      )
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message })
    }

    const where: any = {}
    const contractFilter = resolvedContract ?? (contractId as string | undefined)
    if (contractFilter) where.contractId = contractFilter
    if (eventType) where.eventType = eventType as string
    if (ledgerStart) where.ledger = { gte: parseInt(ledgerStart as string) }
    if (ledgerEnd) where.ledger = { ...where.ledger, lte: parseInt(ledgerEnd as string) }

    const events = await db.horizonEvent.findMany({
      where,
      include: {
        transaction: true,
      },
      orderBy: { timestamp: 'asc' as const },
      take: Math.min(parseInt(limit as string), 200),
      skip: parseInt(offset as string),
    })

    const total = await db.horizonEvent.count({ where })

    res.json({
      success: true,
      data: events,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: total > parseInt(offset as string) + events.length,
      },
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /data/transactions - Query blockchain transactions.
 *
 * Provides access to transaction records with comprehensive filtering options
 * including hash lookup, account filtering, and success status. Returns full
 * transaction details including associated events, effects, and payments.
 *
 * @route GET /data/transactions
 * @param {string} [hash] - Filter by transaction hash
 * @param {string} [sourceAccount] - Filter by source account
 * @param {string} [successful] - Filter by success status ('true'/'false')
 * @param {string} [limit='50'] - Results per page (max: 200)
 * @param {string} [offset='0'] - Pagination offset
 * @param {string} [ledgerStart] - Minimum ledger sequence
 * @param {string} [ledgerEnd] - Maximum ledger sequence
 * @returns {Object} Paginated transaction response with full details
 * @status 200 - Success with transaction data
 * @status 503 - Database unavailable
 * @status 500 - Internal server error
 */
router.get(DATA_TRANSACTIONS_ROUTE, async (req: Request, res: Response) => {
  try {
    const db = await getDB()
    if (!db) {
      return res.status(503).json({ error: 'Database not available' })
    }

    const {
      hash,
      sourceAccount,
      successful,
      limit = '50',
      offset = '0',
      ledgerStart,
      ledgerEnd,
    } = req.query

    const where: any = {}
    if (hash) where.hash = hash as string
    if (sourceAccount) where.sourceAccount = sourceAccount as string
    if (successful !== undefined) where.successful = successful === 'true'
    if (ledgerStart) where.ledger = { gte: parseInt(ledgerStart as string) }
    if (ledgerEnd) where.ledger = { ...where.ledger, lte: parseInt(ledgerEnd as string) }

    const transactions = await db.horizonTransaction.findMany({
      where,
      include: {
        events: true,
        payments: true,
      },
      orderBy: { timestamp: 'desc' },
      take: Math.min(parseInt(limit as string), 200),
      skip: parseInt(offset as string),
    })

    const total = await db.horizonTransaction.count({ where })

    res.json({
      success: true,
      data: transactions,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: total > parseInt(offset as string) + transactions.length,
      },
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /data/operations - Query contract operations.
 *
 * Retrieves contract operation records with filtering by transaction,
 * contract, operation type, and source account. Includes related transaction
 * and event data for comprehensive operation context.
 *
 * @route GET /data/operations
 * @param {string} [transactionHash] - Filter by parent transaction
 * @param {string} [contractId] - Filter by contract ID
 * @param {string} [type] - Filter by operation type
 * @param {string} [sourceAccount] - Filter by source account
 * @param {string} [limit='50'] - Results per page (max: 200)
 * @param {string} [offset='0'] - Pagination offset
 * @returns {Object} Paginated operations response
 * @status 200 - Success with operation data
 * @status 503 - Database unavailable
 * @status 500 - Internal server error
 */
router.get(DATA_OPERATIONS_ROUTE, async (req: Request, res: Response) => {
  try {
    const db = await getDB()
    if (!db) {
      return res.status(503).json({ error: 'Database not available' })
    }

    const {
      transactionHash,
      contractId,
      type,
      sourceAccount,
      limit = '50',
      offset = '0',
      contract,
      version,
    } = req.query

    let resolvedContract: string | undefined
    try {
      resolvedContract = resolveContractFilter(
        STELLAR_NETWORK,
        contract as string | undefined,
        version as string | undefined
      )
    } catch (err: any) {
      return res.status(400).json({ success: false, error: err.message })
    }

    const where: any = {}
    if (transactionHash) where.transactionHash = transactionHash as string
    const contractFilter = resolvedContract ?? (contractId as string | undefined)
    if (contractFilter) where.contractId = contractFilter
    if (type) where.operationType = type as string
    if (sourceAccount) where.sourceAccount = sourceAccount as string

    const operations = await db.horizonOperation.findMany({
      where,
      include: {
        events: true,
      },
      orderBy: { ingestedAt: 'desc' },
      take: Math.min(parseInt(limit as string), 200),
      skip: parseInt(offset as string),
    })

    const total = await db.horizonOperation.count({ where })

    res.json({
      success: true,
      data: operations,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: total > parseInt(offset as string) + operations.length,
      },
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /data/accounts - Query blockchain accounts.
 *
 * Retrieves account records including regular accounts and contract accounts.
 * Tracks account activity, contract associations, and last activity timestamps
 * for account lifecycle monitoring.
 *
 * @route GET /data/accounts
 * @param {string} [accountId] - Filter by account ID
 * @param {string} [isContract] - Filter by contract status ('true'/'false')
 * @param {string} [limit='50'] - Results per page (max: 200)
 * @param {string} [offset='0'] - Pagination offset
 * @returns {Object} Paginated accounts response
 * @status 200 - Success with account data
 * @status 503 - Database unavailable
 * @status 500 - Internal server error
 */
router.get(DATA_ACCOUNTS_ROUTE, async (req: Request, res: Response) => {
  try {
    const db = await getDB()
    if (!db) {
      return res.status(503).json({ error: 'Database not available' })
    }

    const { accountId, isContract, limit = '50', offset = '0' } = req.query

    const where: any = {}
    if (accountId) where.accountId = accountId as string
    if (isContract !== undefined) where.isContract = isContract === 'true'

    const accounts = await db.horizonAccount.findMany({
      where,
      orderBy: { lastActivity: 'desc' },
      take: Math.min(parseInt(limit as string), 200),
      skip: parseInt(offset as string),
    })

    const total = await db.horizonAccount.count({ where })

    res.json({
      success: true,
      data: accounts,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: total > parseInt(offset as string) + accounts.length,
      },
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

/**
 * GET /data/payments - Query payment operations.
 *
 * Retrieves payment records including transfers between accounts with
 * asset details, amounts, and transaction associations. Supports filtering
 * by sender, receiver, and transaction for payment tracking.
 *
 * @route GET /data/payments
 * @param {string} [from] - Filter by sender account
 * @param {string} [to] - Filter by receiver account
 * @param {string} [transactionHash] - Filter by transaction
 * @param {string} [limit='50'] - Results per page (max: 200)
 * @param {string} [offset='0'] - Pagination offset
 * @returns {Object} Paginated payments response
 * @status 200 - Success with payment data
 * @status 503 - Database unavailable
 * @status 500 - Internal server error
 */
router.get(DATA_PAYMENTS_ROUTE, async (req: Request, res: Response) => {
  try {
    const db = await getDB()
    if (!db) {
      return res.status(503).json({ error: 'Database not available' })
    }

    const { from, to, transactionHash, limit = '50', offset = '0' } = req.query

    const where: any = {}
    if (from) where.from = from as string
    if (to) where.to = to as string
    if (transactionHash) where.transactionHash = transactionHash as string

    const payments = await db.horizonPayment.findMany({
      where,
      include: {
        transaction: true,
      },
      orderBy: { timestamp: 'desc' },
      take: Math.min(parseInt(limit as string), 200),
      skip: parseInt(offset as string),
    })

    const total = await db.horizonPayment.count({ where })

    res.json({
      success: true,
      data: payments,
      pagination: {
        total,
        limit: parseInt(limit as string),
        offset: parseInt(offset as string),
        hasMore: total > parseInt(offset as string) + payments.length,
      },
    })
  } catch (error: any) {
    res.status(500).json({ error: error.message })
  }
})

export default router
