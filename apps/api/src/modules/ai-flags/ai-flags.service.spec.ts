/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

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

// ─── Redis mocks ──────────────────────────────────────────────────────────────

interface MockRedis {
  publish: jest.Mock;
  duplicate: jest.Mock;
  subscribe?: jest.Mock;
  unsubscribe?: jest.Mock;
  quit?: jest.Mock;
  on?: jest.Mock;
}

function buildMockRedis(): { publisher: MockRedis; subscriber: MockRedis } {
  const subscriber: MockRedis = {
    publish: jest.fn(),
    duplicate: jest.fn(),
    subscribe: jest.fn().mockResolvedValue(undefined),
    unsubscribe: jest.fn().mockResolvedValue(undefined),
    quit: jest.fn().mockResolvedValue(undefined),
    on: jest.fn(),
  };
  const publisher: MockRedis = {
    publish: jest.fn().mockResolvedValue(1),
    duplicate: jest.fn().mockReturnValue(subscriber),
  };
  return { publisher, subscriber };
}

describe('AiFlagsService', () => {
  let service: AiFlagsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    const mockRedisService = { getClient: () => mockRedis.publisher };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiFlagsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();
    service = module.get(AiFlagsService);
    await service.onModuleInit();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
    jest.clearAllMocks();
  });

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

  // WB-C-03 — cross-instance cache invalidation via Redis pub/sub.
  describe('WB-C-03 pub/sub', () => {
    it('subscribes to ai-flags:invalidated on module init', () => {
      expect(mockRedis.publisher.duplicate).toHaveBeenCalledTimes(1);
      expect(mockRedis.subscriber.subscribe).toHaveBeenCalledWith('ai-flags:invalidated');
      expect(mockRedis.subscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
    });

    it('publishes an invalidation message when setFlag mutates a row', async () => {
      const tx = buildRlsTx();
      tx.tenantAiFlag.upsert.mockResolvedValue(row('behaviour', true, USER_ID));
      wireRls(tx);

      await service.setFlag(TENANT_ID, 'behaviour', true, USER_ID);

      // publish is fire-and-forget — wait one tick
      await new Promise((r) => setImmediate(r));

      expect(mockRedis.publisher.publish).toHaveBeenCalledWith(
        'ai-flags:invalidated',
        JSON.stringify({ tenant_id: TENANT_ID, module_key: 'behaviour' }),
      );
    });

    it('clears the local cache when an invalidation message arrives from another instance', async () => {
      // Prime the cache as instance A
      mockPrisma.tenantAiFlag.findUnique.mockResolvedValue({ enabled: true });
      const before = await service.isEnabled(TENANT_ID, 'behaviour');
      expect(before).toBe(true);
      expect(mockPrisma.tenantAiFlag.findUnique).toHaveBeenCalledTimes(1);

      // Simulate an instance-B message landing on the subscribe channel
      const onCall = (mockRedis.subscriber.on as jest.Mock).mock.calls.find(
        ([event]: [string]) => event === 'message',
      ) as [string, (channel: string, raw: string) => void] | undefined;
      expect(onCall).toBeDefined();
      const handler = onCall![1];
      handler(
        'ai-flags:invalidated',
        JSON.stringify({ tenant_id: TENANT_ID, module_key: 'behaviour' }),
      );

      // Subsequent isEnabled hits the DB again
      mockPrisma.tenantAiFlag.findUnique.mockResolvedValue({ enabled: false });
      const after = await service.isEnabled(TENANT_ID, 'behaviour');
      expect(after).toBe(false);
      expect(mockPrisma.tenantAiFlag.findUnique).toHaveBeenCalledTimes(2);
    });

    it('ignores malformed invalidation payloads without crashing', async () => {
      mockPrisma.tenantAiFlag.findUnique.mockResolvedValue({ enabled: true });
      await service.isEnabled(TENANT_ID, 'behaviour');

      const onCall = (mockRedis.subscriber.on as jest.Mock).mock.calls.find(
        ([event]: [string]) => event === 'message',
      ) as [string, (channel: string, raw: string) => void] | undefined;
      const handler = onCall![1];
      handler('ai-flags:invalidated', '{not-json');
      handler('ai-flags:invalidated', '{}');
      handler('other-channel', JSON.stringify({ tenant_id: TENANT_ID, module_key: 'behaviour' }));

      // Cache untouched — second isEnabled stays cached
      const cached = await service.isEnabled(TENANT_ID, 'behaviour');
      expect(cached).toBe(true);
      expect(mockPrisma.tenantAiFlag.findUnique).toHaveBeenCalledTimes(1);
    });

    it('continues to operate when subscribe fails on boot', async () => {
      // Re-construct with a failing subscribe
      const failingRedis = {
        publish: jest.fn().mockResolvedValue(1),
        duplicate: jest.fn().mockReturnValue({
          subscribe: jest.fn().mockRejectedValue(new Error('redis down')),
          on: jest.fn(),
          unsubscribe: jest.fn(),
          quit: jest.fn(),
        }),
      };
      const mockRedisService = { getClient: () => failingRedis };
      const moduleRef: TestingModule = await Test.createTestingModule({
        providers: [
          AiFlagsService,
          { provide: PrismaService, useValue: buildMockPrisma() },
          { provide: RedisService, useValue: mockRedisService },
        ],
      }).compile();
      const failingService = moduleRef.get(AiFlagsService);

      await expect(failingService.onModuleInit()).resolves.not.toThrow();
      await failingService.onModuleDestroy();
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
