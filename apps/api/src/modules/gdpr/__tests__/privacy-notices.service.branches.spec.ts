/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import {
  MOCK_FACADE_PROVIDERS,
  RbacReadFacade,
  TenantReadFacade,
} from '../../../common/tests/mock-facades';
import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

import { PrivacyNoticesService } from '../privacy-notices.service';

// ─���─ Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VERSION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Mock Factory ───────────────────────────────────────────────────────────

function buildMockPrisma() {
  const prisma = {
    tenant: { findUnique: jest.fn() },
    privacyNoticeVersion: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    privacyNoticeAcknowledgement: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    tenantMembership: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    notification: {
      createMany: jest.fn(),
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

// ─── Test Suite — Branch Coverage ──────────────────────────────────────────

describe('PrivacyNoticesService — branch coverage', () => {
  let service: PrivacyNoticesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  let mockRbacFindMembershipSummary: jest.Mock;
  const mockCreateRlsClient = createRlsClient as jest.Mock;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();
    mockRbacFindMembershipSummary = jest.fn();

    mockCreateRlsClient.mockReturnValue({
      $transaction: jest
        .fn()
        .mockImplementation(
          async (fn: (tx: ReturnType<typeof buildMockPrisma>) => Promise<unknown>) =>
            fn(mockPrisma),
        ),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        PrivacyNoticesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
        {
          provide: RbacReadFacade,
          useValue: {
            findActiveMembershipsWithLocale: mockPrisma.tenantMembership.findMany,
            findMembershipSummary: mockRbacFindMembershipSummary,
          },
        },
        {
          provide: TenantReadFacade,
          useValue: {
            findById: jest.fn().mockResolvedValue({ id: TENANT_ID, name: 'Test School' }),
            findBranding: jest.fn().mockResolvedValue({ support_email: 'support@school.ie' }),
          },
        },
      ],
    }).compile();

    service = module.get<PrivacyNoticesService>(PrivacyNoticesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── updateVersion — effective_date update branch ─────────────────────────

  describe('PrivacyNoticesService — updateVersion effective_date branch', () => {
    it('should update effective_date when provided', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: VERSION_ID,
        tenant_id: TENANT_ID,
        published_at: null,
      });
      mockPrisma.privacyNoticeVersion.update.mockResolvedValue({
        id: VERSION_ID,
        effective_date: new Date('2026-05-01'),
      });

      await service.updateVersion(TENANT_ID, VERSION_ID, {
        effective_date: '2026-05-01',
      });

      expect(mockPrisma.privacyNoticeVersion.update).toHaveBeenCalledWith({
        where: { id: VERSION_ID },
        data: expect.objectContaining({
          effective_date: new Date('2026-05-01'),
        }),
      });
    });

    it('should not update effective_date when not provided', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: VERSION_ID,
        tenant_id: TENANT_ID,
        published_at: null,
      });
      mockPrisma.privacyNoticeVersion.update.mockResolvedValue({
        id: VERSION_ID,
        content_html: '<p>Updated</p>',
      });

      await service.updateVersion(TENANT_ID, VERSION_ID, {
        content_html: '<p>Updated</p>',
      });

      expect(mockPrisma.privacyNoticeVersion.update).toHaveBeenCalledWith({
        where: { id: VERSION_ID },
        data: expect.objectContaining({
          effective_date: undefined,
        }),
      });
    });
  });

  // ─── createVersion — custom content_html_ar provided ──────────────────────

  describe('PrivacyNoticesService — createVersion with custom Arabic content', () => {
    it('should use provided content_html_ar instead of template', async () => {
      mockPrisma.privacyNoticeVersion.aggregate.mockResolvedValue({
        _max: { version_number: 1 },
      });
      mockPrisma.privacyNoticeVersion.create.mockResolvedValue({
        id: VERSION_ID,
        version_number: 2,
      });

      await service.createVersion(TENANT_ID, USER_ID, {
        effective_date: '2026-04-01',
        content_html: '<p>Custom English</p>',
        content_html_ar: '<p>Custom Arabic</p>',
      });

      expect(mockPrisma.privacyNoticeVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          content_html: '<p>Custom English</p>',
          content_html_ar: '<p>Custom Arabic</p>',
        }),
      });
    });
  });

  // ─── createVersion — tenant branding with support_email ────────────────────

  describe('PrivacyNoticesService — createVersion with branding support_email', () => {
    it('should use branding support_email when available', async () => {
      mockPrisma.privacyNoticeVersion.aggregate.mockResolvedValue({
        _max: { version_number: 0 },
      });
      mockPrisma.privacyNoticeVersion.create.mockResolvedValue({
        id: VERSION_ID,
        version_number: 1,
      });

      await service.createVersion(TENANT_ID, USER_ID, {
        effective_date: '2026-04-01',
      });

      // Verify that a template was generated (since content_html not provided)
      const createCall = mockPrisma.privacyNoticeVersion.create.mock.calls[0][0] as {
        data: { content_html: string };
      };
      expect(createCall.data.content_html).toContain('support@school.ie');
    });
  });

  // ─── getParentPortalCurrent — inactive membership ─────────────────────────

  describe('PrivacyNoticesService — getParentPortalCurrent membership status branches', () => {
    it('should throw when membership exists but status is not active', async () => {
      mockRbacFindMembershipSummary.mockResolvedValue({
        id: 'membership-id',
        membership_status: 'suspended',
      });

      await expect(service.getParentPortalCurrent(TENANT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── notifyAllUsers — locale null fallback to 'en' ────────────────────────

  describe('PrivacyNoticesService — publishVersion notification locale fallback', () => {
    it('should default to "en" locale when user preferred_locale is null', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: VERSION_ID,
        tenant_id: TENANT_ID,
        version_number: 1,
        published_at: null,
      });
      mockPrisma.privacyNoticeVersion.update.mockResolvedValue({
        id: VERSION_ID,
        version_number: 1,
        published_at: new Date(),
      });
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        { user_id: USER_ID, user: { preferred_locale: null } },
      ]);

      await service.publishVersion(TENANT_ID, VERSION_ID);

      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            locale: 'en',
          }),
        ],
      });
    });
  });

  // ─── notifyAllUsers — deduplication of user IDs in Redis cache ────────────

  describe('PrivacyNoticesService — publishVersion Redis cache deduplication', () => {
    it('should deduplicate user IDs for Redis cache invalidation', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: VERSION_ID,
        tenant_id: TENANT_ID,
        version_number: 2,
        published_at: null,
      });
      mockPrisma.privacyNoticeVersion.update.mockResolvedValue({
        id: VERSION_ID,
        version_number: 2,
        published_at: new Date(),
      });
      // Same user appears twice (e.g., different membership entries)
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        { user_id: USER_ID, user: { preferred_locale: 'en' } },
        { user_id: USER_ID, user: { preferred_locale: 'en' } },
      ]);

      await service.publishVersion(TENANT_ID, VERSION_ID);

      const redisDel = mockRedis.getClient().del;
      // Only one Redis del call for the deduplicated user
      expect(redisDel).toHaveBeenCalledTimes(1);
    });
  });
});
