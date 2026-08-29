import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app';

const mockDb: any = {
  attestation: { findMany: vi.fn(), count: vi.fn() },
  schema: { findMany: vi.fn(), count: vi.fn() },
  $queryRaw: vi.fn().mockResolvedValue([{ 1: 1 }]),
  groupBy: vi.fn(),
  aggregate: vi.fn()
};

const testRegistry = {
  current: 'v1' as const,
  v1: {
    id: 'CAAAAA',
    sdk: '22.0.8',
    deployedAt: '2025-11-07T12:44:26Z',
    deployedLedger: 123,
    txHash: '5f91',
    wasmHash: null,
  },
};

vi.mock('../src/common/constants', () => ({
  STELLAR_NETWORK: 'testnet',
  CONTRACT_IDS_TO_INDEX: ['CAAAAA', 'CBBBBB'],
  PROTOCOL_CONTRACT_ID: 'CAAAAA',
  sorobanRpcUrl: 'http://localhost:1337'
}));

vi.mock('../src/common/registry', () => ({
  networkRegistry: () => testRegistry,
  resolveContractFilter: (network: string, contract?: string, version?: string) => {
    if (contract) return contract;
    if (!version) return undefined;
    const entry = (testRegistry as any)[version];
    if (!entry) throw new RangeError(`Unknown contract version '${version}' for ${network}`);
    return entry.id;
  },
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

  mockDb.attestation.findMany.mockResolvedValue([]);
  mockDb.attestation.count.mockResolvedValue(0);
  mockDb.schema.findMany.mockResolvedValue([]);
  mockDb.schema.count.mockResolvedValue(0);
});

describe('GET /api/contracts', () => {
  it('returns the registry for the configured network', async () => {
    const res = await request(app).get('/api/contracts');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.network).toBe('testnet');
    expect(res.body.data.current).toBe('v1');
    expect(res.body.data.contracts.v1.id).toBe('CAAAAA');
    expect(res.body.data.indexing).toEqual(['CAAAAA', 'CBBBBB']);
  });

  it('returns a single entry by version', async () => {
    const res = await request(app).get('/api/contracts/v1');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('CAAAAA');
  });

  it('404s an unregistered version', async () => {
    const res = await request(app).get('/api/contracts/v9');

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain("Unknown contract version 'v9'");
  });
});

describe('contract and version filters', () => {
  it('resolves ?version= to the registered address', async () => {
    const res = await request(app).get('/api/registry/attestations?version=v1');

    expect(res.status).toBe(200);
    expect(mockDb.attestation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ contractAddress: 'CAAAAA' }) })
    );
  });

  it('400s an unknown version', async () => {
    const res = await request(app).get('/api/registry/attestations?version=v9');

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Unknown contract version 'v9'");
  });

  it('passes ?contract= through unchanged', async () => {
    const res = await request(app).get('/api/registry/attestations?contract=CZZZ');

    expect(res.status).toBe(200);
    expect(mockDb.attestation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ contractAddress: 'CZZZ' }) })
    );
  });

  it('filters schemas by version too', async () => {
    const res = await request(app).get('/api/registry/schemas?version=v1');

    expect(res.status).toBe(200);
    expect(mockDb.schema.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ contractAddress: 'CAAAAA' }) })
    );
  });
});
