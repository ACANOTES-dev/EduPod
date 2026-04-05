import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, RbacReadFacade } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { PLATFORM_DPA_VERSIONS, PLATFORM_SUB_PROCESSOR_REGISTER_VERSIONS } from '../legal-content';
import { PlatformLegalService } from '../platform-legal.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TENANT_ID_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const USER_ID_1 = '11111111-1111-1111-1111-111111111111';
const USER_ID_2 = '22222222-2222-2222-2222-222222222222';
const USER_ID_3 = '33333333-3333-3333-3333-333333333333';
const REGISTER_VERSION_ID = '44444444-4444-4444-4444-444444444444';

// ─── Mock Factory ───────────────────────────────────────────────────────────

function buildMockPrisma() {
  const prisma = {
    dpaVersion: {
      upsert: jest.fn().mockResolvedValue({}),
    },
    subProcessorRegisterVersion: {
      findUnique: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
    },
    tenantMembership: {
      findMany: jest.fn(),
    },
    notification: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    $transaction: jest.fn(),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  prisma.$transaction.mockImplementation(async (fn: (tx: any) => Promise<any>) => fn(prisma));
  return prisma;
}

function buildMockRedis() {
  return {
    getClient: jest.fn().mockReturnValue({
      del: jest.fn().mockResolvedValue(1),
    }),
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PlatformLegalService', () => {
  let service: PlatformLegalService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        PlatformLegalService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        {
          provide: RbacReadFacade,
          useValue: {
            findActiveMembershipsByRoleKeys: mockPrisma.tenantMembership.findMany,
          },
        },
      ],
    }).compile();

    service = module.get<PlatformLegalService>(PlatformLegalService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── ensureSeeded ───────────────────────────────────────────────────────────

  describe('PlatformLegalService -- ensureSeeded', () => {
    it('should call seedDpaVersions and seedSubProcessorRegister on first call', async () => {
      mockPrisma.subProcessorRegisterVersion.findUnique.mockResolvedValue(null);
      mockPrisma.subProcessorRegisterVersion.count.mockResolvedValue(0);
      mockPrisma.subProcessorRegisterVersion.create.mockResolvedValue({
        id: 'created-id',
        version: '2026.03',
        change_summary: 'Initial register',
      });

      await service.ensureSeeded();

      // DPA versions should be upserted
      expect(mockPrisma.dpaVersion.upsert).toHaveBeenCalledTimes(PLATFORM_DPA_VERSIONS.length);

      // Sub-processor register version should be processed
      expect(mockPrisma.subProcessorRegisterVersion.findUnique).toHaveBeenCalledTimes(
        PLATFORM_SUB_PROCESSOR_REGISTER_VERSIONS.length,
      );
    });

    it('should NOT re-seed on second call (idempotent via in-memory flag)', async () => {
      mockPrisma.subProcessorRegisterVersion.findUnique.mockResolvedValue(null);
      mockPrisma.subProcessorRegisterVersion.count.mockResolvedValue(0);
      mockPrisma.subProcessorRegisterVersion.create.mockResolvedValue({
        id: 'created-id',
        version: '2026.03',
        change_summary: 'Initial register',
      });

      await service.ensureSeeded();
      await service.ensureSeeded();

      // upsert should only be called once per DPA version, not doubled
      expect(mockPrisma.dpaVersion.upsert).toHaveBeenCalledTimes(PLATFORM_DPA_VERSIONS.length);
      expect(mockPrisma.subProcessorRegisterVersion.findUnique).toHaveBeenCalledTimes(
        PLATFORM_SUB_PROCESSOR_REGISTER_VERSIONS.length,
      );
    });
  });

  // ─── seedDpaVersions (via ensureSeeded) ─────────────────────────────────────

  describe('PlatformLegalService -- seedDpaVersions', () => {
    beforeEach(() => {
      // Prevent seedSubProcessorRegister from running (already exists)
      mockPrisma.subProcessorRegisterVersion.findUnique.mockResolvedValue({
        id: 'existing-id',
      });
    });

    it('should upsert each version from PLATFORM_DPA_VERSIONS', async () => {
      await service.ensureSeeded();

      expect(mockPrisma.dpaVersion.upsert).toHaveBeenCalledTimes(PLATFORM_DPA_VERSIONS.length);

      for (const version of PLATFORM_DPA_VERSIONS) {
        expect(mockPrisma.dpaVersion.upsert).toHaveBeenCalledWith({
          where: { version: version.version },
          update: {
            content_html: version.content_html,
            content_hash: version.content_hash,
            effective_date: version.effective_date,
          },
          create: {
            version: version.version,
            content_html: version.content_html,
            content_hash: version.content_hash,
            effective_date: version.effective_date,
          },
        });
      }
    });

    it('should pass correct content_hash matching the content_html', async () => {
      await service.ensureSeeded();

      const firstCall = mockPrisma.dpaVersion.upsert.mock.calls[0]![0] as {
        create: { content_hash: string; content_html: string };
        update: { content_hash: string };
      };

      // content_hash in create and update should match the version constant
      expect(firstCall.create.content_hash).toBe(PLATFORM_DPA_VERSIONS[0]!.content_hash);
      expect(firstCall.update.content_hash).toBe(PLATFORM_DPA_VERSIONS[0]!.content_hash);

      // Hash should be a valid hex SHA-256 (64 characters)
      expect(firstCall.create.content_hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ─── seedSubProcessorRegister (via ensureSeeded) ────────────────────────────

  describe('PlatformLegalService -- seedSubProcessorRegister', () => {
    beforeEach(() => {
      // DPA upsert is irrelevant to these tests
      mockPrisma.dpaVersion.upsert.mockResolvedValue({});
    });

    it('should skip creating when version already exists', async () => {
      mockPrisma.subProcessorRegisterVersion.findUnique.mockResolvedValue({
        id: 'existing-version-id',
      });

      await service.ensureSeeded();

      expect(mockPrisma.subProcessorRegisterVersion.findUnique).toHaveBeenCalledWith({
        where: { version: PLATFORM_SUB_PROCESSOR_REGISTER_VERSIONS[0]!.version },
        select: { id: true },
      });
      expect(mockPrisma.subProcessorRegisterVersion.count).not.toHaveBeenCalled();
      expect(mockPrisma.subProcessorRegisterVersion.create).not.toHaveBeenCalled();
    });

    it('should create version with nested entries when version does not exist', async () => {
      mockPrisma.subProcessorRegisterVersion.findUnique.mockResolvedValue(null);
      mockPrisma.subProcessorRegisterVersion.count.mockResolvedValue(0);

      const seedVersion = PLATFORM_SUB_PROCESSOR_REGISTER_VERSIONS[0]!;
      const createdRecord = {
        id: 'new-version-id',
        version: seedVersion.version,
        change_summary: seedVersion.change_summary,
        entries: seedVersion.entries,
      };
      mockPrisma.subProcessorRegisterVersion.create.mockResolvedValue(createdRecord);

      await service.ensureSeeded();

      expect(mockPrisma.subProcessorRegisterVersion.create).toHaveBeenCalledTimes(1);

      const createCall = mockPrisma.subProcessorRegisterVersion.create.mock.calls[0]![0] as {
        data: {
          version: string;
          change_summary: string;
          published_at: Date;
          objection_deadline: Date | null;
          entries: { create: Array<Record<string, unknown>> };
        };
        include: { entries: boolean };
      };

      expect(createCall.data.version).toBe(seedVersion.version);
      expect(createCall.data.change_summary).toBe(seedVersion.change_summary);
      expect(createCall.data.published_at).toBe(seedVersion.published_at);
      expect(createCall.data.objection_deadline).toBe(seedVersion.objection_deadline);
      expect(createCall.data.entries.create).toHaveLength(seedVersion.entries.length);
      expect(createCall.include).toEqual({ entries: true });

      // Verify first entry mapping
      const firstEntry = createCall.data.entries.create[0]!;
      expect(firstEntry).toEqual({
        name: seedVersion.entries[0]!.name,
        purpose: seedVersion.entries[0]!.purpose,
        data_categories: seedVersion.entries[0]!.data_categories,
        location: seedVersion.entries[0]!.location,
        transfer_mechanism: seedVersion.entries[0]!.transfer_mechanism,
        display_order: seedVersion.entries[0]!.display_order,
        is_planned: seedVersion.entries[0]!.is_planned ?? false,
        notes: seedVersion.entries[0]!.notes ?? null,
      });
    });

    it('should NOT call notifyTenantAdmins on first-ever version (count === 0)', async () => {
      mockPrisma.subProcessorRegisterVersion.findUnique.mockResolvedValue(null);
      mockPrisma.subProcessorRegisterVersion.count.mockResolvedValue(0);
      mockPrisma.subProcessorRegisterVersion.create.mockResolvedValue({
        id: 'new-version-id',
        version: '2026.03',
        change_summary: 'Initial register',
      });

      await service.ensureSeeded();

      // No tenant membership lookup means no notification attempt
      expect(mockPrisma.tenantMembership.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
    });

    it('should call notifyTenantAdmins when previous versions exist (count > 0)', async () => {
      mockPrisma.subProcessorRegisterVersion.findUnique.mockResolvedValue(null);
      mockPrisma.subProcessorRegisterVersion.count.mockResolvedValue(1);

      const seedVersion = PLATFORM_SUB_PROCESSOR_REGISTER_VERSIONS[0]!;
      mockPrisma.subProcessorRegisterVersion.create.mockResolvedValue({
        id: REGISTER_VERSION_ID,
        version: seedVersion.version,
        change_summary: seedVersion.change_summary,
      });

      // Return admin memberships so notification path is exercised
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        {
          tenant_id: TENANT_ID_A,
          user_id: USER_ID_1,
          user: { preferred_locale: 'en' },
        },
      ]);

      await service.ensureSeeded();

      expect(mockPrisma.tenantMembership.findMany).toHaveBeenCalledTimes(1);
      expect(mockPrisma.notification.createMany).toHaveBeenCalledTimes(1);
    });
  });

  // ─── notifyTenantAdmins (via seedSubProcessorRegister) ──────────────────────

  describe('PlatformLegalService -- notifyTenantAdmins', () => {
    beforeEach(() => {
      // Set up so seedSubProcessorRegister triggers notifyTenantAdmins
      mockPrisma.subProcessorRegisterVersion.findUnique.mockResolvedValue(null);
      mockPrisma.subProcessorRegisterVersion.count.mockResolvedValue(1);

      const seedVersion = PLATFORM_SUB_PROCESSOR_REGISTER_VERSIONS[0]!;
      mockPrisma.subProcessorRegisterVersion.create.mockResolvedValue({
        id: REGISTER_VERSION_ID,
        version: seedVersion.version,
        change_summary: seedVersion.change_summary,
      });
    });

    it('should create in_app notifications for all admin memberships grouped by tenant', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        {
          tenant_id: TENANT_ID_A,
          user_id: USER_ID_1,
          user: { preferred_locale: 'en' },
        },
        {
          tenant_id: TENANT_ID_A,
          user_id: USER_ID_2,
          user: { preferred_locale: 'ar' },
        },
        {
          tenant_id: TENANT_ID_B,
          user_id: USER_ID_3,
          user: { preferred_locale: null },
        },
      ]);

      await service.ensureSeeded();

      // Two tenants -> two createMany calls
      expect(mockPrisma.notification.createMany).toHaveBeenCalledTimes(2);

      // Verify tenant A notification data (2 recipients)
      const tenantACall = mockPrisma.notification.createMany.mock.calls[0]![0] as {
        data: Array<{
          tenant_id: string;
          recipient_user_id: string;
          channel: string;
          template_key: string;
          locale: string;
          status: string;
          payload_json: Record<string, unknown>;
          source_entity_type: string;
          source_entity_id: string;
          delivered_at: Date;
        }>;
      };
      expect(tenantACall.data).toHaveLength(2);
      expect(tenantACall.data[0]!.tenant_id).toBe(TENANT_ID_A);
      expect(tenantACall.data[0]!.recipient_user_id).toBe(USER_ID_1);
      expect(tenantACall.data[0]!.channel).toBe('in_app');
      expect(tenantACall.data[0]!.template_key).toBe('legal.sub_processor_updated');
      expect(tenantACall.data[0]!.locale).toBe('en');
      expect(tenantACall.data[0]!.status).toBe('delivered');
      expect(tenantACall.data[0]!.source_entity_type).toBe('sub_processor_register_version');
      expect(tenantACall.data[0]!.source_entity_id).toBe(REGISTER_VERSION_ID);
      expect(tenantACall.data[0]!.payload_json).toEqual(
        expect.objectContaining({
          title: 'Sub-processor register updated',
          version: '2026.03',
        }),
      );
      expect(tenantACall.data[0]!.delivered_at).toBeInstanceOf(Date);

      // Second recipient uses Arabic locale
      expect(tenantACall.data[1]!.locale).toBe('ar');

      // Verify tenant B notification data (1 recipient with null locale -> defaults to 'en')
      const tenantBCall = mockPrisma.notification.createMany.mock.calls[1]![0] as {
        data: Array<{ tenant_id: string; locale: string }>;
      };
      expect(tenantBCall.data).toHaveLength(1);
      expect(tenantBCall.data[0]!.tenant_id).toBe(TENANT_ID_B);
      expect(tenantBCall.data[0]!.locale).toBe('en');
    });

    it('should persist the register version UUID in notifications', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        {
          tenant_id: TENANT_ID_A,
          user_id: USER_ID_1,
          user: { preferred_locale: 'en' },
        },
      ]);

      await service.ensureSeeded();

      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            source_entity_type: 'sub_processor_register_version',
            source_entity_id: REGISTER_VERSION_ID,
          }),
        ],
      });
    });

    it('should query admin memberships with correct role filter', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);

      await service.ensureSeeded();

      expect(mockPrisma.tenantMembership.findMany).toHaveBeenCalledWith([
        'school_owner',
        'school_principal',
        'school_vice_principal',
        'admin',
      ]);
    });

    it('should invalidate Redis unread_notifications cache for each recipient', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        {
          tenant_id: TENANT_ID_A,
          user_id: USER_ID_1,
          user: { preferred_locale: 'en' },
        },
        {
          tenant_id: TENANT_ID_A,
          user_id: USER_ID_2,
          user: { preferred_locale: 'en' },
        },
        {
          tenant_id: TENANT_ID_B,
          user_id: USER_ID_3,
          user: { preferred_locale: 'en' },
        },
      ]);

      await service.ensureSeeded();

      const redisClient = mockRedis.getClient();
      // 2 recipients in tenant A + 1 in tenant B = 3 cache invalidations
      expect(redisClient.del).toHaveBeenCalledTimes(3);
      expect(redisClient.del).toHaveBeenCalledWith(
        `tenant:${TENANT_ID_A}:user:${USER_ID_1}:unread_notifications`,
      );
      expect(redisClient.del).toHaveBeenCalledWith(
        `tenant:${TENANT_ID_A}:user:${USER_ID_2}:unread_notifications`,
      );
      expect(redisClient.del).toHaveBeenCalledWith(
        `tenant:${TENANT_ID_B}:user:${USER_ID_3}:unread_notifications`,
      );
    });

    it('should log error but NOT throw when notification creation fails (fire-and-forget)', async () => {
      const loggerSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        {
          tenant_id: TENANT_ID_A,
          user_id: USER_ID_1,
          user: { preferred_locale: 'en' },
        },
      ]);
      mockPrisma.notification.createMany.mockRejectedValue(new Error('DB connection lost'));

      // ensureSeeded should NOT reject even though notification creation fails
      await expect(service.ensureSeeded()).resolves.toBeUndefined();

      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to notify tenant admins about sub-processor version'),
        expect.any(String),
      );

      loggerSpy.mockRestore();
    });

    it('edge: should handle empty memberships list without creating notifications', async () => {
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);

      await service.ensureSeeded();

      expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
      expect(mockRedis.getClient().del).not.toHaveBeenCalled();
    });

    it('edge: should deduplicate user_ids within a tenant for cache invalidation', async () => {
      // Same user appears twice for the same tenant (e.g., multiple admin roles)
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        {
          tenant_id: TENANT_ID_A,
          user_id: USER_ID_1,
          user: { preferred_locale: 'en' },
        },
        {
          tenant_id: TENANT_ID_A,
          user_id: USER_ID_1,
          user: { preferred_locale: 'en' },
        },
      ]);

      await service.ensureSeeded();

      const redisClient = mockRedis.getClient();
      // Notification createMany receives 2 entries (both memberships)
      const createCall = mockPrisma.notification.createMany.mock.calls[0]![0] as {
        data: Array<Record<string, unknown>>;
      };
      expect(createCall.data).toHaveLength(2);

      // But Redis cache invalidation should only happen once per unique user_id
      expect(redisClient.del).toHaveBeenCalledTimes(1);
      expect(redisClient.del).toHaveBeenCalledWith(
        `tenant:${TENANT_ID_A}:user:${USER_ID_1}:unread_notifications`,
      );
    });
  });
});
