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

  // Mock attestation repository responses matching Prisma schema
  mockDb.attestation.findMany.mockResolvedValue([
    {
      id: '257c9da8-8736-4255-bec4-a8491012906a',
      attestationUid: '1f334d89e649ca1eea2bd8f63f183d00472da76c188ccdc37fd445cb09ecb029',
      ledger: 265547,
      schemaUid: 'd35d11d51b740d6c9ec93f1341d126be104ba8ad2d9ce766adefa42ac8072ef2',
      attesterAddress: 'GBXLKGIGNJAVALY‰WNPNBFVDLALPQZ2OWKUHNZHTRCI47H4TH2WDCYTUHH',
      subjectAddress: 'GDJ6QM7WBTURRYU5MCIXAFJFWWEWP3DGI7BOCK3XCYRIQ5ZHDDWTHILF',
      transactionHash: '1bf9f420510dd2df507ff162b79ae9245ffc5c9aa2951727785063082fd7f57b',
      schemaEncoding: 'JSON',
      message: '{"claim":"verified identity"}',
      value: { claim: "verified identity" },
      revoked: true,
      createdAt: new Date('2025-08-30T05:38:07.5Z'),
      revokedAt: new Date('2025-08-30T02:39:56Z'),
      ingestedAt: new Date('2025-08-30T05:38:07.5Z'),
      lastUpdated: new Date('2025-08-30T05:38:07.5Z')
    },
    {
      id: '72626c13-d220-4545-aa02-0b92a808c1f7',
      attestationUid: '164a0dd8764f9a51e5ff1e940ff358b6afa87c935ca4f602a3694625b95db463',
      ledger: 265536,
      schemaUid: '96a2593a95da99c39d00b9332a0053daf26716972dc4475eff52df2c6196402e',
      attesterAddress: 'GAADQS5WWJI4PS655PT6CJ53NQINRNBI5YNPRZZFOK3BPH3ZMLSNE734',
      subjectAddress: null,
      transactionHash: '4e75106cf330f7c58b84c503f2580e1e79eb411334363d70d073a1aaf8e33aca',
      schemaEncoding: 'JSON',
      message: '{"value":"test_value_434f9eaf"}',
      value: { value: "test_value_434f9eaf" },
      revoked: false,
      createdAt: new Date('2025-08-30T05:38:01.417Z'),
      revokedAt: null,
      ingestedAt: new Date('2025-08-30T05:38:01.417Z'),
      lastUpdated: new Date('2025-08-30T05:38:01.417Z')
    }
  ]);
  mockDb.attestation.count.mockResolvedValue(2);

  // Mock schema repository responses matching Prisma schema
  mockDb.schema.findMany.mockResolvedValue([
    {
      id: 'f3ad247f-ed47-4a60-b4ba-5b4829032ad8',
      uid: '1e67a0f47424988aff00297acccf517b00f5d55ac8c94c9c49803f5156bcbf93',
      ledger: 265897,
      schemaDefinition: '{"name":"Test Schema 83f3ec57","fields":[{"name":"value","type":"string"}]}',
      parsedSchemaDefinition: { name: "Test Schema 83f3ec57", fields: [{ name: "value", type: "string" }] },
      resolverAddress: null,
      revocable: true,
      deployerAddress: 'GAIGJP7DQP5WNPZO3N42VPHL2ZV5OWYY735ULTECY2J4Q36WKKHNHCPQ',
      type: 'default',
      transactionHash: 'b5c339c2a7985d45b550a8c5196a32483e62cf854c05a5455c4242eff8cd92a6',
      createdAt: new Date('2025-08-30T05:36:58.806Z'),
      ingestedAt: new Date('2025-08-30T05:36:58.806Z'),
      lastUpdated: new Date('2025-08-30T05:36:58.806Z')
    },
    {
      id: 'f48a887b-6f4b-46d6-afe9-7136c688784a',
      uid: '29a802da64ccf3f8a3c82d55802789f06d567ade278fbe1104e629f041cbce2e',
      ledger: 265907,
      schemaDefinition: 'XDR:AAAAEQAAAAEAAAAEAAAADwAAAARuYW1lAAAADgAAABdEeW5hbWljIFNjaGVtYSA2ZDA1NmIzOAAAAAAPAAAAB3ZlcnNpb24AAAAADgAAAAMxLjAAAAAADwAAAAtkZXNjcmlwdGlvbgAAAAAOAAAAI1Rlc3Qgc2NoZW1hIGZvciBpbnRlZ3JhdGlvbiB0ZXN0aW5nAAAAAA8AAAAGZmllbGRzAAAAAAAQAAAAAQAAAAMAAAARAAAAAQAAAAMAAAAPAAAABG5hbWUAAAAOAAAACHZlcmlmaWVkAAAADwAAAAR0eXBlAAAADgAAAARib29sAAAADwAAAAhvcHRpb25hbAAAAAAAAAAAAAAAEQAAAAEAAAADAAAADwAAAARuYW1lAAAADgAAAAVzY29yZQAAAAAAAA8AAAAEdHlwZQAAAA4AAAADdTY0AAAAAA8AAAAIb3B0aW9uYWwAAAAAAAAAAAAAABEAAAABAAAAAwAAAA8AAAAEbmFtZQAAAA4AAAAIbWV0YWRhdGEAAAAPAAAABHR5cGUAAAAOAAAABnN0cmluZwAAAAAADwAAAAhvcHRpb25hbAAAAAAAAAAA',
      parsedSchemaDefinition: null,
      resolverAddress: null,
      revocable: true,
      deployerAddress: 'GAIGJP7DQP5WNPZO3N42VPHL2ZV5OWYY735ULTECY2J4Q36WKKHNHCPQ',
      type: 'default',
      transactionHash: '5980de80e1090754f27d4085cd0cf54a1503226c45b634178cec5c0ab6e599f2',
      createdAt: new Date('2025-08-30T05:37:18.719Z'),
      ingestedAt: new Date('2025-08-30T05:37:18.719Z'),
      lastUpdated: new Date('2025-08-30T05:37:18.719Z')
    }
  ]);
  mockDb.schema.count.mockResolvedValue(2);
});

describe('Stellar SDK Indexer - Registry API Integration', () => {
  describe('Registry Attestations Endpoint', () => {
    describe('GET /api/registry/attestations', () => {
      it('returns attestations with default pagination', async () => {
        const res = await request(app).get('/api/registry/attestations');
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.pagination).toEqual({ total: 2, limit: 50, offset: 0, hasMore: false });
        
        // Verify database interaction
        expect(mockDb.attestation.findMany).toHaveBeenCalledWith({
          take: 50,
          skip: 0,
          orderBy: { createdAt: 'desc' }
        });
        expect(mockDb.attestation.count).toHaveBeenCalled();
      });

      it('applies ledger filter', async () => {
        await request(app).get('/api/registry/attestations?ledger=265547');
        
        expect(mockDb.attestation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { ledger: 265547 }
          })
        );
      });

      it('applies attester filter', async () => {
        const attester = 'GBXLKGIGNJAVALY‰WNPNBFVDLALPQZ2OWKUHNZHTRCI47H4TH2WDCYTUHH';
        await request(app).get(`/api/registry/attestations?attester=${encodeURIComponent(attester)}`);
        
        expect(mockDb.attestation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { attesterAddress: attester }
          })
        );
      });

      it('applies subject filter', async () => {
        const subject = 'GDJ6QM7WBTURRYU5MCIXAFJFWWEWP3DGI7BOCK3XCYRIQ5ZHDDWTHILF';
        await request(app).get(`/api/registry/attestations?subject=${subject}`);
        
        expect(mockDb.attestation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { subjectAddress: subject }
          })
        );
      });

      it('applies schemaUid filter', async () => {
        const schemaUid = 'd35d11d51b740d6c9ec93f1341d126be104ba8ad2d9ce766adefa42ac8072ef2';
        await request(app).get(`/api/registry/attestations?schemaUid=${schemaUid}`);
        
        expect(mockDb.attestation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { schemaUid }
          })
        );
      });

      it('applies revoked filter', async () => {
        await request(app).get('/api/registry/attestations?revoked=true');
        
        expect(mockDb.attestation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { revoked: true }
          })
        );
      });

      it('applies pagination parameters', async () => {
        await request(app).get('/api/registry/attestations?limit=25&offset=10');
        
        expect(mockDb.attestation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            take: 25,
            skip: 10
          })
        );
      });

      it('caps limit at maximum allowed value', async () => {
        await request(app).get('/api/registry/attestations?limit=500');
        
        expect(mockDb.attestation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            take: 200 // Should be capped at max limit
          })
        );
      });

      it('returns properly transformed attestation data', async () => {
        const res = await request(app).get('/api/registry/attestations');
        
        expect(res.body.data[0]).toMatchObject({
          uid: expect.any(String),
          schemaUid: expect.any(String),
          attesterAddress: expect.any(String),
          subjectAddress: expect.any(String),
          value: expect.any(String),
          createdAt: expect.any(String),
          revoked: expect.any(Boolean),
          ledger: expect.any(Number)
        });
      });
    });

    describe('GET /api/registry/attestations/:uid', () => {
      it('returns single attestation by UID', async () => {
        const attestationUid = '1f334d89e649ca1eea2bd8f63f183d00472da76c188ccdc37fd445cb09ecb029';
        
        // Mock single attestation response
        mockDb.attestation.findMany.mockResolvedValueOnce([
          {
            id: '257c9da8-8736-4255-bec4-a8491012906a',
            attestationUid: '1f334d89e649ca1eea2bd8f63f183d00472da76c188ccdc37fd445cb09ecb029',
            ledger: 265547,
            schemaUid: 'd35d11d51b740d6c9ec93f1341d126be104ba8ad2d9ce766adefa42ac8072ef2',
            attesterAddress: 'GBXLKGIGNJAVALY‰WNPNBFVDLALPQZ2OWKUHNZHTRCI47H4TH2WDCYTUHH',
            subjectAddress: 'GDJ6QM7WBTURRYU5MCIXAFJFWWEWP3DGI7BOCK3XCYRIQ5ZHDDWTHILF',
            transactionHash: '1bf9f420510dd2df507ff162b79ae9245ffc5c9aa2951727785063082fd7f57b',
            schemaEncoding: 'JSON',
            message: '{"claim":"verified identity"}',
            value: { claim: "verified identity" },
            revoked: true,
            createdAt: new Date('2025-08-30T05:38:07.5Z'),
            revokedAt: new Date('2025-08-30T02:39:56Z'),
            ingestedAt: new Date('2025-08-30T05:38:07.5Z'),
            lastUpdated: new Date('2025-08-30T05:38:07.5Z')
          }
        ]);
        
        const res = await request(app).get(`/api/registry/attestations/${attestationUid}`);
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
        expect(res.body.data.uid).toBe(attestationUid);
        
        // Verify database query for specific UID
        expect(mockDb.attestation.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { attestationUid }
          })
        );
      });

      it('returns 404 for non-existent attestation', async () => {
        mockDb.attestation.findMany.mockResolvedValueOnce([]);
        
        const res = await request(app).get('/api/registry/attestations/non-existent-uid');
        
        expect(res.status).toBe(404);
        expect(res.body.error).toContain('Attestation not found');
      });
    });
  });

  describe('Registry Schemas Endpoint', () => {
    describe('GET /api/registry/schemas', () => {
      it('returns schemas with default pagination', async () => {
        const res = await request(app).get('/api/registry/schemas');
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(2);
        expect(res.body.pagination).toEqual({ total: 2, limit: 50, offset: 0, hasMore: false });
        
        // Verify database interaction
        expect(mockDb.schema.findMany).toHaveBeenCalledWith({
          take: 50,
          skip: 0,
          orderBy: { createdAt: 'desc' }
        });
        expect(mockDb.schema.count).toHaveBeenCalled();
      });

      it('applies ledger filter', async () => {
        await request(app).get('/api/registry/schemas?ledger=265897');
        
        expect(mockDb.schema.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { ledger: 265897 }
          })
        );
      });

      it('applies authority filter', async () => {
        const authority = 'GAIGJP7DQP5WNPZO3N42VPHL2ZV5OWYY735ULTECY2J4Q36WKKHNHCPQ';
        await request(app).get(`/api/registry/schemas?authority=${authority}`);
        
        expect(mockDb.schema.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { deployerAddress: authority }
          })
        );
      });

      it('applies revocable filter', async () => {
        await request(app).get('/api/registry/schemas?revocable=true');
        
        expect(mockDb.schema.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { revocable: true }
          })
        );
      });

      it('applies context filter', async () => {
        await request(app).get('/api/registry/schemas?context=default');
        
        expect(mockDb.schema.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { type: 'default' }
          })
        );
      });

      it('returns properly transformed schema data', async () => {
        const res = await request(app).get('/api/registry/schemas');
        
        expect(res.body.data[0]).toMatchObject({
          uid: expect.any(String),
          schemaDefinition: expect.any(String),
          revocable: expect.any(Boolean),
          createdAt: expect.any(String),
          ledger: expect.any(Number)
        });
      });
    });

    describe('GET /api/registry/schemas/:uid', () => {
      it('returns single schema by UID', async () => {
        const schemaUid = '1e67a0f47424988aff00297acccf517b00f5d55ac8c94c9c49803f5156bcbf93';
        
        // Mock single schema response
        mockDb.schema.findMany.mockResolvedValueOnce([
          {
            id: 'f3ad247f-ed47-4a60-b4ba-5b4829032ad8',
            uid: '1e67a0f47424988aff00297acccf517b00f5d55ac8c94c9c49803f5156bcbf93',
            ledger: 265897,
            schemaDefinition: '{"name":"Test Schema 83f3ec57","fields":[{"name":"value","type":"string"}]}',
            parsedSchemaDefinition: { name: "Test Schema 83f3ec57", fields: [{ name: "value", type: "string" }] },
            resolverAddress: null,
            revocable: true,
            deployerAddress: 'GAIGJP7DQP5WNPZO3N42VPHL2ZV5OWYY735ULTECY2J4Q36WKKHNHCPQ',
            type: 'default',
            transactionHash: 'b5c339c2a7985d45b550a8c5196a32483e62cf854c05a5455c4242eff8cd92a6',
            createdAt: new Date('2025-08-30T05:36:58.806Z'),
            ingestedAt: new Date('2025-08-30T05:36:58.806Z'),
            lastUpdated: new Date('2025-08-30T05:36:58.806Z')
          }
        ]);
        
        const res = await request(app).get(`/api/registry/schemas/${schemaUid}`);
        
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toBeDefined();
        expect(res.body.data.uid).toBe(schemaUid);
        
        // Verify database query for specific UID
        expect(mockDb.schema.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { uid: schemaUid }
          })
        );
      });

      it('returns 404 for non-existent schema', async () => {
        mockDb.schema.findMany.mockResolvedValueOnce([]);
        
        const res = await request(app).get('/api/registry/schemas/non-existent-uid');
        
        expect(res.status).toBe(404);
        expect(res.body.error).toContain('Schema not found');
      });
    });
  });

  describe('Stellar SDK Indexer Function Compatibility', () => {
    it('supports fetchAttestationsByLedger indexer pattern', async () => {
      const ledger = 265547;
      const res = await request(app).get(`/api/registry/attestations?ledger=${ledger}&limit=100`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.pagination.limit).toBe(100);
      
      // Verify indexer-compatible query format
      expect(mockDb.attestation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ledger },
          take: 100,
          orderBy: { createdAt: 'desc' }
        })
      );
    });

    it('supports fetchSchemasByLedger indexer pattern', async () => {
      const ledger = 265897;
      const res = await request(app).get(`/api/registry/schemas?ledger=${ledger}&limit=50`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.pagination.limit).toBe(50);
      
      // Verify indexer-compatible query format
      expect(mockDb.schema.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { ledger },
          take: 50,
          orderBy: { createdAt: 'desc' }
        })
      );
    });

    it('supports fetchAttestationsByWallet indexer pattern', async () => {
      const walletAddress = 'GBXLKGIGNJAVALY‰WNPNBFVDLALPQZ2OWKUHNZHTRCI47H4TH2WDCYTUHH';
      const res = await request(app).get(`/api/registry/attestations?attester=${encodeURIComponent(walletAddress)}&limit=100&offset=0`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // Verify wallet-specific query for attester
      expect(mockDb.attestation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { attesterAddress: walletAddress },
          take: 100,
          skip: 0,
          orderBy: { createdAt: 'desc' }
        })
      );
    });

    it('supports fetchSchemasByWallet indexer pattern', async () => {
      const walletAddress = 'GAIGJP7DQP5WNPZO3N42VPHL2ZV5OWYY735ULTECY2J4Q36WKKHNHCPQ';
      const res = await request(app).get(`/api/registry/schemas?authority=${walletAddress}&limit=100&offset=0`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // Verify wallet-specific query for authority
      expect(mockDb.schema.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { deployerAddress: walletAddress },
          take: 100,
          skip: 0,
          orderBy: { createdAt: 'desc' }
        })
      );
    });

    it('supports fetchLatestAttestations indexer pattern', async () => {
      const res = await request(app).get('/api/registry/attestations?limit=100');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // Verify latest attestations query (no filters, ordered by createdAt desc)
      expect(mockDb.attestation.findMany).toHaveBeenCalledWith({
        take: 100,
        skip: 0,
        orderBy: { createdAt: 'desc' }
      });
    });

    it('supports fetchLatestSchemas indexer pattern', async () => {
      const res = await request(app).get('/api/registry/schemas?limit=100');
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      
      // Verify latest schemas query (no filters, ordered by createdAt desc)
      expect(mockDb.schema.findMany).toHaveBeenCalledWith({
        take: 100,
        skip: 0,
        orderBy: { createdAt: 'desc' }
      });
    });
  });

  describe('API Response Format Validation', () => {
    it('returns consistent attestation API format', async () => {
      const res = await request(app).get('/api/registry/attestations');
      
      expect(res.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        pagination: {
          total: expect.any(Number),
          limit: expect.any(Number),
          offset: expect.any(Number),
          hasMore: expect.any(Boolean)
        }
      });
      
      // Verify attestation object structure matches stellar-sdk expectations
      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toMatchObject({
          uid: expect.any(String),
          schemaUid: expect.any(String),
          attesterAddress: expect.any(String),
          subjectAddress: expect.any(String),
          value: expect.any(String),
          createdAt: expect.any(String),
        });
      }
    });

    it('returns consistent schema API format', async () => {
      const res = await request(app).get('/api/registry/schemas');
      
      expect(res.body).toMatchObject({
        success: true,
        data: expect.any(Array),
        pagination: {
          total: expect.any(Number),
          limit: expect.any(Number),
          offset: expect.any(Number),
          hasMore: expect.any(Boolean)
        }
      });
      
      // Verify schema object structure matches stellar-sdk expectations
      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toMatchObject({
          uid: expect.any(String),
          attesterAddress: expect.any(String),
          revocable: expect.any(Boolean),
          createdAt: expect.any(String)
        });
      }
    });
  });
});