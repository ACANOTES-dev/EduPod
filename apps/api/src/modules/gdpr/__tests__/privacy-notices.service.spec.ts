/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn(),
}));

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';

import { PrivacyNoticesService } from '../privacy-notices.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const VERSION_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ─── Mock Factory ───────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    tenant: {
      findUnique: jest.fn(),
    },
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
  };
}

function buildMockRedis() {
  return {
    getClient: jest.fn().mockReturnValue({
      del: jest.fn().mockResolvedValue(1),
    }),
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PrivacyNoticesService', () => {
  let service: PrivacyNoticesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockRedis: ReturnType<typeof buildMockRedis>;
  const mockCreateRlsClient = createRlsClient as jest.Mock;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRedis = buildMockRedis();

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
        PrivacyNoticesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<PrivacyNoticesService>(PrivacyNoticesService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── listVersions ─────────────────────────────────────────────────────────

  describe('PrivacyNoticesService -- listVersions', () => {
    it('should scope privacy notice lists to the tenant and expose acknowledgement counts', async () => {
      mockPrisma.privacyNoticeVersion.findMany.mockResolvedValue([
        {
          id: VERSION_ID,
          tenant_id: TENANT_ID,
          version_number: 3,
          content_html: '<p>Notice</p>',
          content_html_ar: null,
          effective_date: new Date('2026-03-27'),
          published_at: new Date('2026-03-27T10:00:00Z'),
          created_by_user_id: USER_ID,
          created_at: new Date('2026-03-26T10:00:00Z'),
          _count: { acknowledgements: 42 },
        },
      ]);

      const result = await service.listVersions(TENANT_ID);

      expect(mockPrisma.privacyNoticeVersion.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        orderBy: [{ version_number: 'desc' }],
        include: { _count: { select: { acknowledgements: true } } },
      });
      expect(result).toEqual({
        data: [expect.objectContaining({ version_number: 3, acknowledgement_count: 42 })],
      });
    });

    it('should return empty data array when no versions exist', async () => {
      mockPrisma.privacyNoticeVersion.findMany.mockResolvedValue([]);

      const result = await service.listVersions(TENANT_ID);

      expect(result.data).toEqual([]);
    });
  });

  // ─── createVersion ─────────────────────────────────────────────────────────

  describe('PrivacyNoticesService -- createVersion', () => {
    it('should create a new version with auto-incremented version_number', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test School',
        branding: { support_email: 'support@test.ie' },
      });
      mockPrisma.privacyNoticeVersion.aggregate.mockResolvedValue({
        _max: { version_number: 2 },
      });
      mockPrisma.privacyNoticeVersion.create.mockResolvedValue({
        id: VERSION_ID,
        version_number: 3,
      });

      const result = await service.createVersion(TENANT_ID, USER_ID, {
        effective_date: '2026-04-01',
        content_html: '<p>Custom notice</p>',
      });

      expect(result).toEqual({ id: VERSION_ID, version_number: 3 });
      expect(mockPrisma.privacyNoticeVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          version_number: 3,
          content_html: '<p>Custom notice</p>',
          created_by_user_id: USER_ID,
        }),
      });
    });

    it('should generate default content when content_html is not provided', async () => {
      mockPrisma.tenant.findUnique.mockResolvedValue({
        name: 'Test School',
        branding: { support_email: 'support@test.ie' },
      });
      mockPrisma.privacyNoticeVersion.aggregate.mockResolvedValue({
        _max: { version_number: null },
      });
      mockPrisma.privacyNoticeVersion.create.mockResolvedValue({
        id: VERSION_ID,
        version_number: 1,
      });

      await service.createVersion(TENANT_ID, USER_ID, {
        effective_date: '2026-04-01',
      });

      expect(mockPrisma.privacyNoticeVersion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          version_number: 1,
          content_html: expect.any(String),
          content_html_ar: expect.any(String),
        }),
      });
    });
  });

  // ─── updateVersion ─────────────────────────────────────────────────────────

  describe('PrivacyNoticesService -- updateVersion', () => {
    it('should update a draft version', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: VERSION_ID,
        tenant_id: TENANT_ID,
        published_at: null,
      });
      mockPrisma.privacyNoticeVersion.update.mockResolvedValue({
        id: VERSION_ID,
        content_html: '<p>Updated</p>',
      });

      const result = await service.updateVersion(TENANT_ID, VERSION_ID, {
        content_html: '<p>Updated</p>',
      });

      expect(result).toEqual({ id: VERSION_ID, content_html: '<p>Updated</p>' });
    });

    it('should throw NotFoundException when version does not exist', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue(null);

      await expect(
        service.updateVersion(TENANT_ID, VERSION_ID, { content_html: '<p>Updated</p>' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when trying to update a published version', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: VERSION_ID,
        tenant_id: TENANT_ID,
        published_at: new Date(),
      });

      await expect(
        service.updateVersion(TENANT_ID, VERSION_ID, { content_html: '<p>Updated</p>' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ─── publishVersion ────────────────────────────────────────────────────────

  describe('PrivacyNoticesService -- publishVersion', () => {
    it('should publish a draft version and create in_app notifications', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: VERSION_ID,
        tenant_id: TENANT_ID,
        version_number: 4,
        content_html: '<p>Notice</p>',
        content_html_ar: null,
        effective_date: new Date('2026-04-05'),
        published_at: null,
        created_by_user_id: USER_ID,
        created_at: new Date('2026-04-04T10:00:00Z'),
      });
      mockPrisma.privacyNoticeVersion.update.mockResolvedValue({
        id: VERSION_ID,
        version_number: 4,
        published_at: new Date('2026-04-05T08:00:00Z'),
      });
      mockPrisma.tenantMembership.findMany.mockResolvedValue([
        { user_id: USER_ID, user: { preferred_locale: 'en' } },
      ]);

      await service.publishVersion(TENANT_ID, VERSION_ID);

      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            tenant_id: TENANT_ID,
            recipient_user_id: USER_ID,
            channel: 'in_app',
            template_key: 'legal.privacy_notice_published',
            status: 'delivered',
            payload_json: expect.objectContaining({ version_number: 4 }),
          }),
        ],
      });

      // Verify Redis cache invalidation
      const redisDel = mockRedis.getClient().del;
      expect(redisDel).toHaveBeenCalledWith(
        `tenant:${TENANT_ID}:user:${USER_ID}:unread_notifications`,
      );
    });

    it('should throw NotFoundException when version does not exist', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue(null);

      await expect(service.publishVersion(TENANT_ID, VERSION_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should return already-published version without republishing', async () => {
      const publishedVersion = {
        id: VERSION_ID,
        version_number: 4,
        published_at: new Date('2026-04-05T08:00:00Z'),
      };
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue(publishedVersion);
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);

      const result = await service.publishVersion(TENANT_ID, VERSION_ID);

      expect(result).toEqual(publishedVersion);
      expect(mockPrisma.privacyNoticeVersion.update).not.toHaveBeenCalled();
    });

    it('should skip notifications when no active memberships exist', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: VERSION_ID,
        version_number: 1,
        published_at: null,
      });
      mockPrisma.privacyNoticeVersion.update.mockResolvedValue({
        id: VERSION_ID,
        version_number: 1,
        published_at: new Date(),
      });
      mockPrisma.tenantMembership.findMany.mockResolvedValue([]);

      await service.publishVersion(TENANT_ID, VERSION_ID);

      expect(mockPrisma.notification.createMany).not.toHaveBeenCalled();
    });
  });

  // ─── getCurrentForUser ─────────────────────────────────────────────────────

  describe('PrivacyNoticesService -- getCurrentForUser', () => {
    it('should require re-acknowledgement when a newer published version exists', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: 'current-version-id',
        tenant_id: TENANT_ID,
        version_number: 2,
        content_html: '<p>Updated notice</p>',
        content_html_ar: null,
        effective_date: new Date('2026-04-01'),
        published_at: new Date('2026-04-01T09:00:00Z'),
        created_by_user_id: USER_ID,
        created_at: new Date('2026-03-31T09:00:00Z'),
      });
      mockPrisma.privacyNoticeAcknowledgement.findFirst.mockResolvedValue(null);

      const result = await service.getCurrentForUser(TENANT_ID, USER_ID);

      expect(result.requires_acknowledgement).toBe(true);
      expect(result.acknowledged).toBe(false);
      expect(result.current_version?.version_number).toBe(2);
    });

    it('should report acknowledged=true when user has acknowledged current version', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: 'current-version-id',
        tenant_id: TENANT_ID,
        version_number: 2,
        content_html: '<p>Notice</p>',
        published_at: new Date(),
      });
      const ackDate = new Date('2026-04-02T10:00:00Z');
      mockPrisma.privacyNoticeAcknowledgement.findFirst.mockResolvedValue({
        id: 'ack-id',
        acknowledged_at: ackDate,
      });

      const result = await service.getCurrentForUser(TENANT_ID, USER_ID);

      expect(result.acknowledged).toBe(true);
      expect(result.requires_acknowledgement).toBe(false);
      expect(result.acknowledged_at).toEqual(ackDate);
    });

    it('should return null current_version when no published notice exists', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue(null);

      const result = await service.getCurrentForUser(TENANT_ID, USER_ID);

      expect(result.current_version).toBeNull();
      expect(result.acknowledged).toBe(true);
      expect(result.requires_acknowledgement).toBe(false);
    });
  });

  // ─── acknowledgeCurrentVersion ─────────────────────────────────────────────

  describe('PrivacyNoticesService -- acknowledgeCurrentVersion', () => {
    it('should create an acknowledgement record for the current published version', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: 'current-version-id',
        published_at: new Date(),
      });
      mockPrisma.privacyNoticeAcknowledgement.findFirst.mockResolvedValue(null);
      mockPrisma.privacyNoticeAcknowledgement.create.mockResolvedValue({ id: 'ack-id' });

      const result = await service.acknowledgeCurrentVersion(TENANT_ID, USER_ID, '127.0.0.1');

      expect(result).toEqual({ id: 'ack-id' });
      expect(mockCreateRlsClient).toHaveBeenCalledWith(mockPrisma, {
        tenant_id: TENANT_ID,
        user_id: USER_ID,
      });
      expect(mockPrisma.privacyNoticeAcknowledgement.create).toHaveBeenCalledWith({
        data: {
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          privacy_notice_version_id: 'current-version-id',
          ip_address: '127.0.0.1',
        },
      });
    });

    it('should return existing acknowledgement idempotently', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: 'current-version-id',
        published_at: new Date(),
      });
      const existingAck = { id: 'existing-ack-id' };
      mockPrisma.privacyNoticeAcknowledgement.findFirst.mockResolvedValue(existingAck);

      const result = await service.acknowledgeCurrentVersion(TENANT_ID, USER_ID);

      expect(result).toEqual(existingAck);
      expect(mockPrisma.privacyNoticeAcknowledgement.create).not.toHaveBeenCalled();
    });

    it('should throw NotFoundException when no published notice exists', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue(null);

      await expect(service.acknowledgeCurrentVersion(TENANT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should store null for ip_address when not provided', async () => {
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: 'current-version-id',
        published_at: new Date(),
      });
      mockPrisma.privacyNoticeAcknowledgement.findFirst.mockResolvedValue(null);
      mockPrisma.privacyNoticeAcknowledgement.create.mockResolvedValue({ id: 'ack-id' });

      await service.acknowledgeCurrentVersion(TENANT_ID, USER_ID);

      expect(mockPrisma.privacyNoticeAcknowledgement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ ip_address: null }),
      });
    });
  });

  // ─── getParentPortalCurrent ────────────────────────────────────────────────

  describe('PrivacyNoticesService -- getParentPortalCurrent', () => {
    it('should return current notice status for an active parent membership', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue({ id: 'membership-id' });
      mockPrisma.privacyNoticeVersion.findFirst.mockResolvedValue({
        id: 'current-version-id',
        version_number: 1,
        published_at: new Date(),
        tenant_id: TENANT_ID,
      });
      mockPrisma.privacyNoticeAcknowledgement.findFirst.mockResolvedValue(null);

      const result = await service.getParentPortalCurrent(TENANT_ID, USER_ID);

      expect(result.requires_acknowledgement).toBe(true);
      expect(mockPrisma.tenantMembership.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          user_id: USER_ID,
          membership_status: 'active',
        },
        select: { id: true },
      });
    });

    it('should throw NotFoundException when parent has no active membership', async () => {
      mockPrisma.tenantMembership.findFirst.mockResolvedValue(null);

      await expect(service.getParentPortalCurrent(TENANT_ID, USER_ID)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
