import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';

const mockDb: any = {
  horizonEvent: { findMany: vi.fn(), count: vi.fn() },
  horizonTransaction: { findMany: vi.fn(), count: vi.fn() },
  horizonOperation: { findMany: vi.fn(), count: vi.fn() },
  horizonContractOperation: { findMany: vi.fn(), count: vi.fn() },
  horizonEffect: { findMany: vi.fn(), count: vi.fn() },
  horizonContractData: { findMany: vi.fn(), count: vi.fn() },
  horizonAccount: { findMany: vi.fn(), count: vi.fn() },
  horizonPayment: { findMany: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  groupBy: vi.fn(),
  aggregate: vi.fn()
};

vi.mock('../src/common/constants', () => ({
  STELLAR_NETWORK: 'testnet',
  CONTRACT_IDS_TO_INDEX: ['CAAAAA', 'CBBBBB'],
  PROTOCOL_CONTRACT_ID: 'CAAAAA',
  sorobanRpcUrl: 'http://localhost:1337'
}));

vi.mock('../src/common/db', () => ({
  getDB: vi.fn(),
  getLastProcessedLedgerFromDB: vi.fn().mockResolvedValue(10),
}));

vi.mock('../src/repository/rpc.repository', () => ({
  getRpcHealth: vi.fn().mockResolvedValue('healthy'),
  getLatestRPCLedgerIndex: vi.fn().mockResolvedValue(1021520),
}));

vi.mock('../src/common/queue', () => ({
  ingestQueue: {
    enqueueFetchEvents: vi.fn().mockReturnValue('job-123'),
    enqueueComprehensiveData: vi.fn().mockReturnValue('job-456'),
    enqueueRecurringIngestion: vi.fn().mockReturnValue('job-456'),
    getStatus: vi.fn().mockReturnValue({ size: 0, running: false, nextJobs: [] }),
  },
}));

vi.mock('../src/common/prisma', () => ({
  connectToPostgreSQL: vi.fn().mockResolvedValue(true),
}));

beforeEach(async () => {
  vi.clearAllMocks();
  const dbModule = await import('../src/common/db');
  (dbModule.getDB as any).mockResolvedValue(mockDb);

  mockDb.horizonEvent.findMany.mockResolvedValue([
    {
      eventId: '0004387339157639168-0000000001',
      timestamp: new Date('2025-05-17T21:36:01Z'),
      contractId: 'CDDRYX6CX4DLYTKXJFHX5BPHSQUCIPUFTEN74XJNK5YFFENYUBKYCITO',
      eventType: 'ATTEST',
      eventData: {},
      transaction: { hash: 'h', successful: true, fee: '100000' },
    },
  ]);
  mockDb.horizonEvent.count.mockResolvedValue(1);
  mockDb.horizonTransaction.findMany.mockResolvedValue([
    {
      hash: 'h',
      timestamp: new Date('2025-05-17T21:36:01Z'),
      successful: true,
      events: [],
      effects: [],
      payments: [],
    },
  ]);
  mockDb.horizonTransaction.count.mockResolvedValue(1);
  mockDb.horizonOperation.findMany.mockResolvedValue([
    { id: 'op1', operationType: 'invoke_host_function', contractId: 'C', events: [] },
  ]);
  mockDb.horizonOperation.count.mockResolvedValue(1);
  mockDb.horizonContractOperation.findMany.mockResolvedValue([
    { id: 'op1', type: 'invoke_host_function', contractId: 'C', transaction: {}, events: [] },
  ]);
  mockDb.horizonContractOperation.count.mockResolvedValue(1);
  mockDb.horizonEffect.findMany.mockResolvedValue([
    { id: 'eff1', type: 'contract_credited', transaction: {} },
  ]);
  mockDb.horizonEffect.count.mockResolvedValue(1);
  mockDb.horizonContractData.findMany.mockResolvedValue([
    { id: 'data1', contractId: 'C', key: 'k', value: { type: 'ScValType', value: '42' } },
  ]);
  mockDb.horizonContractData.count.mockResolvedValue(1);
  mockDb.horizonAccount.findMany.mockResolvedValue([
    { id: 'acct1', accountId: 'G...', isContract: true, lastActivity: new Date() },
  ]);
  mockDb.horizonAccount.count.mockResolvedValue(1);
  mockDb.horizonPayment.findMany.mockResolvedValue([
    { id: 'pay1', from: 'G...', to: 'G..2', amount: '10.0000000', transaction: {} },
  ]);
  mockDb.horizonPayment.count.mockResolvedValue(1);
});

describe('Horizon API - Endpoints (refactored)', () => {
  describe('System Endpoints', () => {
    describe('GET /api/health', () => {
      it('returns status information', async () => {
        const res = await request(app).get('/api/health');

        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.database_status).toContain('connected');
        expect(res.body.soroban_rpc_status).toBe('healthy');
      });
    });
  });

  describe('Ingestion Endpoints', () => {
    describe('POST /api/ingest/events', () => {
      it('enqueues ingestion', async () => {
        const res = await request(app)
          .post('/api/ingest/events')
          .send({ startLedger: 123 });

        expect(res.status).toBe(202);
        expect(res.body.success).toBe(true);
        expect(res.body.jobId).toBe('job-123');
      });

      it('with invalid startLedger returns 400', async () => {
        const res = await request(app)
          .post('/api/ingest/events')
          .send({ startLedger: 'abc' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid startLedger');
      });
    });

    describe('POST /api/ingest/backfill', () => {
      it('initiates historical data backfill', async () => {
        const res = await request(app)
          .post('/api/ingest/backfill')
          .send({ startLedger: 1000 });

        expect(res.status).toBe(202);
        expect(res.body.success).toBe(true);
        expect(res.body.message).toContain('Historical data backfill initiated');
      });

      it('invalid startLedger returns 400', async () => {
        const res = await request(app)
          .post('/api/ingest/backfill')
          .send({ startLedger: 'invalid' });

        expect(res.status).toBe(400);
        expect(res.body.error).toContain('Invalid startLedger');
      });
    });

    describe('POST /api/ingest/recurring', () => {
      it('enqueues recurring data synchronization', async () => {
        const res = await request(app)
          .post('/api/ingest/recurring')
          .send({ startLedger: 1000, contractIds: ['C1'] });

        expect(res.status).toBe(202);
        expect(res.body.success).toBe(true);
        expect(res.body.jobId).toBe('job-456');
        expect(res.body.contractIds).toEqual(['C1']);
      });
    });
  });

  describe('Data Retrieval Endpoints', () => {
    describe('GET /api/data/events', () => {
      it('returns events with default pagination', async () => {
        const res = await request(app).get('/api/data/events');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(1);
        expect(res.body.pagination).toEqual({ total: 1, limit: 50, offset: 0, hasMore: false });
      });

      it('applies contractId filter', async () => {
        const contractId = 'CDDRYX6CX4DLYTKXJFHX5BPHSQUCIPUFTEN74XJNK5YFFENYUBKYCITO';
        await request(app).get(`/api/data/events?contractId=${contractId}`);
        expect(mockDb.horizonEvent.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { contractId } })
        );
      });

      it('applies ledger range filter', async () => {
        await request(app).get('/api/data/events?ledgerStart=1021500&ledgerEnd=1021510');
        expect(mockDb.horizonEvent.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { ledger: { gte: 1021500, lte: 1021510 } } })
        );
      });

      it('caps limit at 200', async () => {
        await request(app).get('/api/data/events?limit=500');
        expect(mockDb.horizonEvent.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ take: 200 })
        );
      });
    });

    describe('GET /api/data/transactions', () => {
      it('returns transactions with relations', async () => {
        const res = await request(app).get('/api/data/transactions');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockDb.horizonTransaction.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ include: { events: true, payments: true } })
        );
      });
    });

    describe('GET /api/data/operations', () => {
      it('returns operations with transaction and events', async () => {
        const res = await request(app).get('/api/data/operations');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockDb.horizonOperation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ include: { events: true } })
        );
      });

      it('applies filters', async () => {
        await request(app).get('/api/data/operations?contractId=C&type=invoke_host_function&sourceAccount=G..');
        expect(mockDb.horizonOperation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ where: { contractId: 'C', operationType: 'invoke_host_function', sourceAccount: 'G..' } })
        );
      });
    });

    describe('GET /api/data/accounts', () => {
      it('returns accounts ordered by lastActivity', async () => {
        const res = await request(app).get('/api/data/accounts');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockDb.horizonAccount.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ orderBy: { lastActivity: 'desc' } })
        );
      });
    });

    describe('GET /api/data/payments', () => {
      it('returns payments with transaction relation', async () => {
        const res = await request(app).get('/api/data/payments');
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(mockDb.horizonPayment.findMany).toHaveBeenCalledWith(
          expect.objectContaining({ include: { transaction: true }, orderBy: { timestamp: 'desc' } })
        );
      });
    });
  });
});
