/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { AiFlagsService } from './ai-flags.service';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const FLAG_ID = '33333333-3333-3333-3333-333333333333';

interface MockTx {
  tenantAiFlag: {
    create: jest.Mock;
    upsert: jest.Mock;
  };
}

function buildMockPrisma() {
  return {
    tenantAiFlag: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
    },
  };
}

function buildRlsTx(): MockTx {
  return {
    tenantAiFlag: {
      create: jest.fn(),
      upsert: jest.fn(),
    },
  };
}

function wireRls(tx: MockTx) {
  (createRlsClient as jest.Mock).mockReturnValue({
    $transaction: jest.fn(async (cb: (tx: MockTx) => Promise<unknown>) => cb(tx)),
  });
}

describe('AiFlagsService', () => {
  let service: AiFlagsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    const module: TestingModule = await Test.createTestingModule({
      providers: [AiFlagsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(AiFlagsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('list', () => {
    it('returns the four canonical flag rows when all present', async () => {
      mockPrisma.tenantAiFlag.findMany.mockResolvedValue([
        row('behaviour', false),
        row('early_warning', false),
        row('pastoral', true),
        row('staff_wellbeing', false),
      ]);

      const result = await service.list(TENANT_ID);

      expect(mockPrisma.tenantAiFlag.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        orderBy: { module_key: 'asc' },
      });
      expect(result).toHaveLength(4);
      expect(result.map((r) => r.module_key)).toEqual([
        'behaviour',
        'early_warning',
        'pastoral',
        'staff_wellbeing',
      ]);
      expect(result.find((r) => r.module_key === 'pastoral')!.enabled).toBe(true);
    });

    it('backfills missing rows defensively when a tenant is partially seeded', async () => {
      // First call: only 2 rows exist
      mockPrisma.tenantAiFlag.findMany
        .mockResolvedValueOnce([row('behaviour', false), row('pastoral', false)])
        .mockResolvedValueOnce([
          row('behaviour', false),
          row('early_warning', false),
          row('pastoral', false),
          row('staff_wellbeing', false),
        ]);

      const tx = buildRlsTx();
      wireRls(tx);

      const result = await service.list(TENANT_ID);

      expect(createRlsClient).toHaveBeenCalledWith(mockPrisma, { tenant_id: TENANT_ID });
      expect(tx.tenantAiFlag.create).toHaveBeenCalledTimes(2);
      expect(tx.tenantAiFlag.create).toHaveBeenCalledWith({
        data: { tenant_id: TENANT_ID, module_key: 'early_warning', enabled: false },
      });
      expect(tx.tenantAiFlag.create).toHaveBeenCalledWith({
        data: { tenant_id: TENANT_ID, module_key: 'staff_wellbeing', enabled: false },
      });
      expect(result).toHaveLength(4);
    });
  });

  describe('setFlag', () => {
    it('upserts under RLS, records updated_by, and invalidates the cache', async () => {
      const tx = buildRlsTx();
      tx.tenantAiFlag.upsert.mockResolvedValue(row('behaviour', true, USER_ID));
      wireRls(tx);

      // Prime the cache so we can assert invalidation
      mockPrisma.tenantAiFlag.findUnique.mockResolvedValue({ enabled: false });
      const beforeFlip = await service.isEnabled(TENANT_ID, 'behaviour');
      expect(beforeFlip).toBe(false);
      expect(mockPrisma.tenantAiFlag.findUnique).toHaveBeenCalledTimes(1);

      const result = await service.setFlag(TENANT_ID, 'behaviour', true, USER_ID);

      expect(createRlsClient).toHaveBeenCalledWith(mockPrisma, {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
      });
      expect(tx.tenantAiFlag.upsert).toHaveBeenCalledWith({
        where: {
          tenant_id_module_key: {
            tenant_id: TENANT_ID,
            module_key: 'behaviour',
          },
        },
        update: { enabled: true, updated_by: USER_ID },
        create: {
          tenant_id: TENANT_ID,
          module_key: 'behaviour',
          enabled: true,
          updated_by: USER_ID,
        },
      });
      expect(result.enabled).toBe(true);
      expect(result.updated_by).toBe(USER_ID);

      // Cache should have been invalidated → another isEnabled hits the DB
      mockPrisma.tenantAiFlag.findUnique.mockResolvedValue({ enabled: true });
      const afterFlip = await service.isEnabled(TENANT_ID, 'behaviour');
      expect(afterFlip).toBe(true);
      expect(mockPrisma.tenantAiFlag.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('isEnabled', () => {
    it('caches results within the TTL', async () => {
      mockPrisma.tenantAiFlag.findUnique.mockResolvedValue({ enabled: true });

      await service.isEnabled(TENANT_ID, 'behaviour');
      await service.isEnabled(TENANT_ID, 'behaviour');
      await service.isEnabled(TENANT_ID, 'behaviour');

      expect(mockPrisma.tenantAiFlag.findUnique).toHaveBeenCalledTimes(1);
    });

    it('returns false when no row exists for the (tenant, module) pair', async () => {
      mockPrisma.tenantAiFlag.findUnique.mockResolvedValue(null);
      const enabled = await service.isEnabled(TENANT_ID, 'pastoral');
      expect(enabled).toBe(false);
    });

    it('keeps separate cache entries per module key', async () => {
      mockPrisma.tenantAiFlag.findUnique
        .mockResolvedValueOnce({ enabled: true })
        .mockResolvedValueOnce({ enabled: false });

      const beh = await service.isEnabled(TENANT_ID, 'behaviour');
      const pas = await service.isEnabled(TENANT_ID, 'pastoral');

      expect(beh).toBe(true);
      expect(pas).toBe(false);
      expect(mockPrisma.tenantAiFlag.findUnique).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalidate', () => {
    it('clears a specific (tenant, module) entry', async () => {
      mockPrisma.tenantAiFlag.findUnique.mockResolvedValue({ enabled: true });
      await service.isEnabled(TENANT_ID, 'behaviour');
      service.invalidate(TENANT_ID, 'behaviour');
      await service.isEnabled(TENANT_ID, 'behaviour');
      expect(mockPrisma.tenantAiFlag.findUnique).toHaveBeenCalledTimes(2);
    });

    it('clears all entries for a tenant when only tenantId is passed', async () => {
      mockPrisma.tenantAiFlag.findUnique.mockResolvedValue({ enabled: true });
      await service.isEnabled(TENANT_ID, 'behaviour');
      await service.isEnabled(TENANT_ID, 'pastoral');
      service.invalidate(TENANT_ID);
      await service.isEnabled(TENANT_ID, 'behaviour');
      await service.isEnabled(TENANT_ID, 'pastoral');
      expect(mockPrisma.tenantAiFlag.findUnique).toHaveBeenCalledTimes(4);
    });
  });
});

function row(
  moduleKey: 'behaviour' | 'pastoral' | 'staff_wellbeing' | 'early_warning',
  enabled: boolean,
  updatedBy: string | null = null,
) {
  return {
    id: FLAG_ID,
    tenant_id: TENANT_ID,
    module_key: moduleKey,
    enabled,
    updated_at: new Date('2026-04-20T15:00:00.000Z'),
    updated_by: updatedBy,
  };
}
