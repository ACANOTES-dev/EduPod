import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { SequenceService } from './sequence.service';

// Mock the RLS middleware
jest.mock('../../common/middleware/rls.middleware');

describe('SequenceService', () => {
  let service: SequenceService;
  let mockTx: {
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
  };
  let mockPrisma: PrismaService;

  beforeEach(async () => {
    mockTx = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
    };

    mockPrisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      $extends: jest.fn().mockReturnValue({
        $transaction: jest.fn().mockImplementation(async (fn: any) => fn(mockTx)),
      }),
    } as unknown as PrismaService;

    // Mock createRlsClient to return an object with $transaction that passes mockTx
    (createRlsClient as jest.Mock).mockImplementation(() => ({
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(mockTx)),
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [SequenceService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<SequenceService>(SequenceService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const TENANT_ID = '11111111-1111-1111-1111-111111111111';

  describe('nextNumber', () => {
    it('should generate application number', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(0) }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      const result = await service.nextNumber(TENANT_ID, 'application');

      const now = new Date();
      const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      expect(result).toBe(`APP-${yearMonth}-000001`);
      expect(mockTx.$queryRaw).toHaveBeenCalled();
      expect(mockTx.$executeRaw).toHaveBeenCalled();
    });

    it('should increment sequentially', async () => {
      mockTx.$queryRaw.mockResolvedValueOnce([{ current_value: BigInt(0) }]);
      mockTx.$executeRaw.mockResolvedValueOnce(1);

      const first = await service.nextNumber(TENANT_ID, 'application');

      mockTx.$queryRaw.mockResolvedValueOnce([{ current_value: BigInt(1) }]);
      mockTx.$executeRaw.mockResolvedValueOnce(1);

      const second = await service.nextNumber(TENANT_ID, 'application');

      expect(first).toMatch(/000001$/);
      expect(second).toMatch(/000002$/);
    });

    it('should throw for missing sequence type', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);

      await expect(service.nextNumber(TENANT_ID, 'nonexistent')).rejects.toThrow(
        'Sequence type "nonexistent" not found for tenant 11111111-1111-1111-1111-111111111111',
      );
    });

    it('should format correctly at high numbers', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(999999) }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      const result = await service.nextNumber(TENANT_ID, 'application');

      expect(result).toMatch(/1000000$/);
    });

    it('should use provided transaction client when given', async () => {
      const customMockTx = {
        $queryRaw: jest.fn().mockResolvedValue([{ current_value: BigInt(5) }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
      };

      const result = await service.nextNumber(TENANT_ID, 'application', customMockTx);

      expect(result).toMatch(/000006$/);
      expect(customMockTx.$queryRaw).toHaveBeenCalled();
      // Original prisma should NOT have been called
      expect(mockPrisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('should use custom prefix when provided', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(0) }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      const result = await service.nextNumber(TENANT_ID, 'application', undefined, 'CUST');

      const now = new Date();
      const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      expect(result).toBe(`CUST-${yearMonth}-000001`);
    });

    it('should format custom sequence types with uppercase prefix', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(0) }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      const result = await service.nextNumber(TENANT_ID, 'invoice');

      const now = new Date();
      const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      expect(result).toBe(`INVOICE-${yearMonth}-000001`);
    });

    it('should format custom sequence types with mixed case', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(0) }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      const result = await service.nextNumber(TENANT_ID, 'Receipt');

      const now = new Date();
      const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      expect(result).toBe(`RECEIPT-${yearMonth}-000001`);
    });

    it('should handle sequence with zero current value', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(0) }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      const result = await service.nextNumber(TENANT_ID, 'application');

      expect(result).toMatch(/-000001$/);
    });

    it('should handle missing current_value in response', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: undefined }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      const result = await service.nextNumber(TENANT_ID, 'application');

      expect(result).toMatch(/-000001$/);
    });

    it('should handle very high sequence numbers', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(999999999) }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      const result = await service.nextNumber(TENANT_ID, 'application');

      expect(result).toMatch(/1000000000$/);
    });
  });

  describe('generateHouseholdReference', () => {
    it('should generate household reference in XXX999-9 format', async () => {
      mockTx.$queryRaw.mockResolvedValue([]); // No existing household

      const result = await service.generateHouseholdReference(TENANT_ID);

      // Verify format: 3 letters + 3 digits + dash + 1 digit
      expect(result).toMatch(/^[A-HJ-NP-Z]{3}\d{3}-\d$/);
    });

    it('should generate unique reference on first attempt', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);

      const result = await service.generateHouseholdReference(TENANT_ID);

      expect(result).toMatch(/^[A-HJ-NP-Z]{3}\d{3}-\d$/);
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(1);
    });

    it('should retry on duplicate reference', async () => {
      // First two attempts find duplicates, third succeeds
      mockTx.$queryRaw
        .mockResolvedValueOnce([{ existing: 1 }]) // First attempt: duplicate
        .mockResolvedValueOnce([{ existing: 1 }]) // Second attempt: duplicate
        .mockResolvedValueOnce([]); // Third attempt: unique

      const result = await service.generateHouseholdReference(TENANT_ID);

      expect(result).toMatch(/^[A-HJ-NP-Z]{3}\d{3}-\d$/);
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(3);
    });

    it('should throw after 10 failed attempts', async () => {
      // All 10 attempts find duplicates
      mockTx.$queryRaw.mockResolvedValue([{ existing: 1 }]);

      await expect(service.generateHouseholdReference(TENANT_ID)).rejects.toThrow(
        'Failed to generate unique household reference after 10 attempts',
      );
      expect(mockTx.$queryRaw).toHaveBeenCalledTimes(10);
    });

    it('should use provided transaction client when given', async () => {
      const customMockTx = {
        $queryRaw: jest.fn().mockResolvedValue([]),
      };

      const result = await service.generateHouseholdReference(TENANT_ID, customMockTx);

      expect(result).toMatch(/^[A-HJ-NP-Z]{3}\d{3}-\d$/);
      expect(customMockTx.$queryRaw).toHaveBeenCalled();
    });

    it('should not contain excluded letters (I, L, O)', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);

      // Run multiple times to have better chance of testing different random values
      const results: string[] = [];
      for (let i = 0; i < 20; i++) {
        mockTx.$queryRaw.mockResolvedValueOnce([]);
        const result = await service.generateHouseholdReference(TENANT_ID);
        results.push(result);
      }

      // Verify no I, L, or O in any reference
      results.forEach((ref) => {
        const lettersOnly = ref.split('-')[0].replace(/\d/g, '');
        expect(lettersOnly).not.toMatch(/[ILO]/);
      });
    });

    it('should generate references with correct length', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);

      const result = await service.generateHouseholdReference(TENANT_ID);

      // Format: XXX999-9 = 3 letters + 3 digits + dash + 1 digit = 8 characters
      expect(result).toHaveLength(8);
    });

    it('should query with correct tenant isolation', async () => {
      mockTx.$queryRaw.mockResolvedValue([]);

      await service.generateHouseholdReference(TENANT_ID);

      const queryCalls = mockTx.$queryRaw.mock.calls;
      expect(queryCalls.length).toBeGreaterThan(0);
      // The query should be a Prisma.sql tagged template - has 'text' property
      const lastCall = queryCalls[queryCalls.length - 1];
      expect(lastCall[0]).toHaveProperty('text');
      expect(lastCall[0]).toHaveProperty('values');
      // Verify tenant_id is in the query values
      expect(JSON.stringify(lastCall[0].values)).toContain(TENANT_ID);
    });
  });

  describe('formatNumber edge cases', () => {
    it('should handle December month correctly', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(0) }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      // Mock Date to return December
      const mockDate = new Date(2026, 11, 1); // December 2026
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const result = await service.nextNumber(TENANT_ID, 'application');

      expect(result).toBe('APP-202612-000001');

      jest.restoreAllMocks();
    });

    it('should handle January month correctly', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(0) }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      // Mock Date to return January
      const mockDate = new Date(2026, 0, 1); // January 2026
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const result = await service.nextNumber(TENANT_ID, 'application');

      expect(result).toBe('APP-202601-000001');

      jest.restoreAllMocks();
    });

    it('should handle single-digit months with leading zero', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(0) }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      // Mock Date to return September
      const mockDate = new Date(2026, 8, 1); // September 2026
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const result = await service.nextNumber(TENANT_ID, 'application');

      expect(result).toBe('APP-202609-000001');

      jest.restoreAllMocks();
    });

    it('should handle multi-year sequences', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(0) }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      // Mock Date to return a future year
      const mockDate = new Date(2030, 5, 15); // June 2030
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate);

      const result = await service.nextNumber(TENANT_ID, 'application');

      expect(result).toContain('203006');

      jest.restoreAllMocks();
    });
  });

  describe('tenant isolation', () => {
    it('should isolate sequences by tenant ID', async () => {
      const tenantId1 = '11111111-1111-1111-1111-111111111111';
      const tenantId2 = '22222222-2222-2222-2222-222222222222';

      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(0) }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      await service.nextNumber(tenantId1, 'application');
      await service.nextNumber(tenantId2, 'application');

      const queryCalls = mockTx.$queryRaw.mock.calls;
      expect(queryCalls.length).toBe(2);
      // Verify both queries have Prisma.Sql structure with tenant_id in values
      expect(queryCalls[0][0]).toHaveProperty('text');
      expect(queryCalls[0][0]).toHaveProperty('values');
      expect(queryCalls[1][0]).toHaveProperty('text');
      expect(queryCalls[1][0]).toHaveProperty('values');
      // Verify tenant isolation
      expect(JSON.stringify(queryCalls[0][0].values)).toContain(tenantId1);
      expect(JSON.stringify(queryCalls[1][0].values)).toContain(tenantId2);
    });

    it('should isolate household references by tenant ID', async () => {
      const tenantId1 = '11111111-1111-1111-1111-111111111111';
      const tenantId2 = '22222222-2222-2222-2222-222222222222';

      mockTx.$queryRaw.mockResolvedValue([]);

      await service.generateHouseholdReference(tenantId1);
      await service.generateHouseholdReference(tenantId2);

      const queryCalls = mockTx.$queryRaw.mock.calls;
      expect(queryCalls.length).toBe(2);
      // Verify tenant isolation with Prisma.Sql
      expect(queryCalls[0][0]).toHaveProperty('text');
      expect(queryCalls[0][0]).toHaveProperty('values');
      expect(queryCalls[1][0]).toHaveProperty('text');
      expect(queryCalls[1][0]).toHaveProperty('values');
      // Verify tenant isolation
      expect(JSON.stringify(queryCalls[0][0].values)).toContain(tenantId1);
      expect(JSON.stringify(queryCalls[1][0].values)).toContain(tenantId2);
    });
  });

  describe('error handling', () => {
    it('should handle database errors during sequence query', async () => {
      mockTx.$queryRaw.mockRejectedValue(new Error('Database connection lost'));

      await expect(service.nextNumber(TENANT_ID, 'application')).rejects.toThrow(
        'Database connection lost',
      );
    });

    it('should handle database errors during sequence update', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(0) }]);
      mockTx.$executeRaw.mockRejectedValue(new Error('Update failed'));

      await expect(service.nextNumber(TENANT_ID, 'application')).rejects.toThrow('Update failed');
    });

    it('should handle database errors during household check', async () => {
      mockTx.$queryRaw.mockRejectedValue(new Error('Query timeout'));

      await expect(service.generateHouseholdReference(TENANT_ID)).rejects.toThrow('Query timeout');
    });
  });

  describe('concurrency and race conditions', () => {
    it('should use FOR UPDATE locking for sequences', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(0) }]);
      mockTx.$executeRaw.mockResolvedValue(1);

      await service.nextNumber(TENANT_ID, 'application');

      const queryCall = mockTx.$queryRaw.mock.calls[0];
      const sql = queryCall[0];
      // Verify FOR UPDATE is in the query
      expect(sql.text.toUpperCase()).toContain('FOR UPDATE');
    });

    it('should handle bigint values correctly', async () => {
      mockTx.$queryRaw.mockResolvedValue([{ current_value: BigInt(9007199254740991) }]); // Max safe integer
      mockTx.$executeRaw.mockResolvedValue(1);

      const result = await service.nextNumber(TENANT_ID, 'application');

      expect(result).toMatch(/9007199254740992$/);
    });
  });
});
