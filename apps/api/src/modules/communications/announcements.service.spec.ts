import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, ConfigurationReadFacade } from '../../common/tests/mock-facades';
import { ApprovalRequestsService } from '../approvals/approval-requests.service';
import { PrismaService } from '../prisma/prisma.service';

import { AnnouncementsService } from './announcements.service';
import { AudienceResolutionService } from './audience-resolution.service';
import { NotificationsService } from './notifications.service';

// Mock RLS middleware — createRlsClient returns a mock with $transaction that delegates to the callback
const mockRlsTx: Record<string, Record<string, jest.Mock>> = {};
jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// Mock sanitise-html module
jest.mock('../../common/utils/sanitise-html', () => ({
  sanitiseHtml: jest.fn((html: string) =>
    html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ''),
  ),
}));

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const ANNOUNCEMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function buildMockAnnouncement(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: ANNOUNCEMENT_ID,
    tenant_id: TENANT_ID,
    title: 'Test Announcement',
    body_html: '<p>Hello world</p>',
    status: 'draft',
    scope: 'school',
    target_payload: {},
    scheduled_publish_at: null,
    published_at: null,
    author_user_id: USER_ID,
    approval_request_id: null,
    approval_request: null,
    created_at: new Date(),
    updated_at: new Date(),
    author: {
      id: USER_ID,
      first_name: 'Test',
      last_name: 'User',
      email: 'test@school.com',
    },
    ...overrides,
  };
}

describe('AnnouncementsService', () => {
  let service: AnnouncementsService;
  let mockPrisma: {
    announcement: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    notification: {
      findMany: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
    tenantSetting: {
      findFirst: jest.Mock;
    };
  };
  let mockApprovalService: {
    checkAndCreateIfNeeded: jest.Mock;
  };
  let mockAudienceService: {
    resolve: jest.Mock;
  };
  let mockNotificationsService: {
    createBatch: jest.Mock;
  };
  let mockQueue: {
    add: jest.Mock;
  };
  let mockConfigFacade: {
    findSettings: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      announcement: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      notification: {
        findMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      tenantSetting: {
        findFirst: jest.fn(),
      },
    };

    // Wire RLS tx mock to use the same prisma mocks
    mockRlsTx.announcement = mockPrisma.announcement;
    mockRlsTx.notification = mockPrisma.notification;
    mockRlsTx.tenantSetting = mockPrisma.tenantSetting;

    mockApprovalService = {
      checkAndCreateIfNeeded: jest.fn(),
    };

    mockAudienceService = {
      resolve: jest.fn(),
    };

    mockNotificationsService = {
      createBatch: jest.fn(),
    };

    mockQueue = {
      add: jest.fn(),
    };

    mockConfigFacade = {
      findSettings: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        AnnouncementsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ApprovalRequestsService, useValue: mockApprovalService },
        { provide: AudienceResolutionService, useValue: mockAudienceService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: getQueueToken('notifications'), useValue: mockQueue },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
      ],
    }).compile();

    service = module.get<AnnouncementsService>(AnnouncementsService);

    jest.clearAllMocks();
  });

  // ─── create() ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('should create announcement with status draft', async () => {
      const dto = {
        title: 'School Event',
        body_html: '<p>Welcome</p>',
        scope: 'school',
        target_payload: {},
      };
      const expected = buildMockAnnouncement({ title: dto.title, body_html: dto.body_html });
      mockPrisma.announcement.create.mockResolvedValue(expected);

      const result = await service.create(TENANT_ID, USER_ID, dto);

      expect(result.status).toBe('draft');
      expect(mockPrisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'draft',
            scope: 'school',
            author_user_id: USER_ID,
          }),
        }),
      );
    });

    it('should sanitise body_html on create', async () => {
      const dto = {
        title: 'XSS Test',
        body_html: '<p>Hello</p><script>alert(1)</script>',
        scope: 'school',
        target_payload: {},
      };
      mockPrisma.announcement.create.mockResolvedValue(
        buildMockAnnouncement({ body_html: '<p>Hello</p>' }),
      );

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            body_html: '<p>Hello</p>',
          }),
        }),
      );
    });

    it('should create with scope year_group and valid target_payload', async () => {
      const dto = {
        title: 'Year Group Announcement',
        body_html: '<p>Year group update</p>',
        scope: 'year_group',
        target_payload: { year_group_ids: ['yg-1', 'yg-2'] },
      };
      mockPrisma.announcement.create.mockResolvedValue(
        buildMockAnnouncement({ scope: 'year_group', target_payload: dto.target_payload }),
      );

      const result = await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope: 'year_group',
            target_payload: { year_group_ids: ['yg-1', 'yg-2'] },
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('should create with scope class and valid target_payload', async () => {
      const dto = {
        title: 'Class Announcement',
        body_html: '<p>Class update</p>',
        scope: 'class',
        target_payload: { class_ids: ['cls-1'] },
      };
      mockPrisma.announcement.create.mockResolvedValue(
        buildMockAnnouncement({ scope: 'class', target_payload: dto.target_payload }),
      );

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope: 'class',
            target_payload: { class_ids: ['cls-1'] },
          }),
        }),
      );
    });

    it('should create with scope household', async () => {
      const dto = {
        title: 'Household Announcement',
        body_html: '<p>Household update</p>',
        scope: 'household',
        target_payload: { household_ids: ['hh-1', 'hh-2'] },
      };
      mockPrisma.announcement.create.mockResolvedValue(
        buildMockAnnouncement({ scope: 'household', target_payload: dto.target_payload }),
      );

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope: 'household',
            target_payload: { household_ids: ['hh-1', 'hh-2'] },
          }),
        }),
      );
    });

    it('should create with scope custom and user_ids', async () => {
      const dto = {
        title: 'Custom Announcement',
        body_html: '<p>Custom update</p>',
        scope: 'custom',
        target_payload: { user_ids: ['u-1', 'u-2', 'u-3'] },
      };
      mockPrisma.announcement.create.mockResolvedValue(
        buildMockAnnouncement({ scope: 'custom', target_payload: dto.target_payload }),
      );

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            scope: 'custom',
            target_payload: { user_ids: ['u-1', 'u-2', 'u-3'] },
          }),
        }),
      );
    });
  });

  // ─── update() ───────────────────────────────────────────────────────────────

  describe('update()', () => {
    it('should update draft announcement title', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(buildMockAnnouncement());
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ title: 'Updated Title' }),
      );

      const result = await service.update(TENANT_ID, ANNOUNCEMENT_ID, { title: 'Updated Title' });

      expect(result.title).toBe('Updated Title');
      expect(mockPrisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ANNOUNCEMENT_ID },
          data: expect.objectContaining({ title: 'Updated Title' }),
        }),
      );
    });

    it('should sanitise body_html on update', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(buildMockAnnouncement());
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ body_html: '<p>Safe</p>' }),
      );

      await service.update(TENANT_ID, ANNOUNCEMENT_ID, {
        body_html: '<p>Safe</p><script>evil()</script>',
      });

      expect(mockPrisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ body_html: '<p>Safe</p>' }),
        }),
      );
    });

    it('should throw ANNOUNCEMENT_NOT_DRAFT when updating non-draft', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(
        buildMockAnnouncement({ status: 'published' }),
      );

      await expect(service.update(TENANT_ID, ANNOUNCEMENT_ID, { title: 'Nope' })).rejects.toThrow(
        BadRequestException,
      );

      await expect(
        service.update(TENANT_ID, ANNOUNCEMENT_ID, { title: 'Nope' }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ANNOUNCEMENT_NOT_DRAFT' }),
      });
    });

    it('should throw ANNOUNCEMENT_NOT_FOUND when ID missing', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(null);

      await expect(service.update(TENANT_ID, 'nonexistent-id', { title: 'Nope' })).rejects.toThrow(
        NotFoundException,
      );
    });

    it('edge: should allow updating target_payload when scope unchanged', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(
        buildMockAnnouncement({
          scope: 'year_group',
          target_payload: { year_group_ids: ['yg-1'] },
        }),
      );
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ target_payload: { year_group_ids: ['yg-1', 'yg-2'] } }),
      );

      await service.update(TENANT_ID, ANNOUNCEMENT_ID, {
        target_payload: { year_group_ids: ['yg-1', 'yg-2'] },
      });

      expect(mockPrisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            target_payload: { year_group_ids: ['yg-1', 'yg-2'] },
          }),
        }),
      );
    });
  });

  // ─── publish() — without approval ──────────────────────────────────────────

  describe('publish() — without approval required', () => {
    it('should publish immediately when no approval and no schedule', async () => {
      const draftAnnouncement = buildMockAnnouncement();
      mockPrisma.announcement.findFirst.mockResolvedValue(draftAnnouncement);
      mockConfigFacade.findSettings.mockResolvedValue({
        settings: { communications: { requireApprovalForAnnouncements: false } },
      });

      // executePublish internals
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ status: 'published', published_at: new Date() }),
      );
      mockAudienceService.resolve.mockResolvedValue([]);

      const result = await service.publish(TENANT_ID, USER_ID, ANNOUNCEMENT_ID, {});

      expect(result.approval_required).toBe(false);
      expect(mockPrisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'published' }),
        }),
      );
    });

    it('should schedule when scheduled_publish_at is in the future', async () => {
      const draftAnnouncement = buildMockAnnouncement();
      mockPrisma.announcement.findFirst.mockResolvedValue(draftAnnouncement);
      mockConfigFacade.findSettings.mockResolvedValue({
        settings: { communications: { requireApprovalForAnnouncements: false } },
      });

      const futureDate = new Date(Date.now() + 86_400_000).toISOString();
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ status: 'scheduled', scheduled_publish_at: futureDate }),
      );

      const result = await service.publish(TENANT_ID, USER_ID, ANNOUNCEMENT_ID, {
        scheduled_publish_at: futureDate,
      });

      expect(result.data.status).toBe('scheduled');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'communications:publish-announcement',
        expect.objectContaining({ tenant_id: TENANT_ID, announcement_id: ANNOUNCEMENT_ID }),
        expect.objectContaining({ delay: expect.any(Number) }),
      );
    });

    it('should throw ANNOUNCEMENT_NOT_DRAFT when already published', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(
        buildMockAnnouncement({ status: 'published' }),
      );

      await expect(service.publish(TENANT_ID, USER_ID, ANNOUNCEMENT_ID, {})).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.publish(TENANT_ID, USER_ID, ANNOUNCEMENT_ID, {})).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ANNOUNCEMENT_NOT_DRAFT' }),
      });
    });
  });

  // ─── publish() — with approval required ────────────────────────────────────

  describe('publish() — with approval required', () => {
    beforeEach(() => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: { communications: { requireApprovalForAnnouncements: true } },
      });
    });

    it('should transition to pending_approval when approval required', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(buildMockAnnouncement());
      mockApprovalService.checkAndCreateIfNeeded.mockResolvedValue({
        approved: false,
        request_id: 'approval-req-1',
      });
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({
          status: 'pending_approval',
          approval_request_id: 'approval-req-1',
        }),
      );

      const result = await service.publish(TENANT_ID, USER_ID, ANNOUNCEMENT_ID, {});

      expect(result.approval_required).toBe(true);
      expect(result.data.status).toBe('pending_approval');
      expect(mockPrisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'pending_approval',
            approval_request_id: 'approval-req-1',
          }),
        }),
      );
    });

    it('should publish immediately when approval required but auto-approved', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(buildMockAnnouncement());
      mockApprovalService.checkAndCreateIfNeeded.mockResolvedValue({ approved: true });

      // executePublish internals
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ status: 'published', published_at: new Date() }),
      );
      mockAudienceService.resolve.mockResolvedValue([]);

      const result = await service.publish(TENANT_ID, USER_ID, ANNOUNCEMENT_ID, {});

      expect(result.approval_required).toBe(false);
    });

    it('edge: requester cannot approve own request (canSelfApprove=false)', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(buildMockAnnouncement());
      mockApprovalService.checkAndCreateIfNeeded.mockResolvedValue({
        approved: false,
        request_id: 'approval-req-2',
      });
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ status: 'pending_approval' }),
      );

      await service.publish(TENANT_ID, USER_ID, ANNOUNCEMENT_ID, {});

      // The 6th parameter (hasDirectAuthority / canSelfApprove) must be false
      expect(mockApprovalService.checkAndCreateIfNeeded).toHaveBeenCalledWith(
        TENANT_ID,
        'announcement_publish',
        'announcement',
        ANNOUNCEMENT_ID,
        USER_ID,
        false,
        expect.anything(),
      );
    });
  });

  // ─── executePublish() ──────────────────────────────────────────────────────

  describe('executePublish()', () => {
    it('should set status to published and call AudienceResolutionService', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(
        buildMockAnnouncement({ scope: 'school', target_payload: {} }),
      );
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ status: 'published' }),
      );
      mockAudienceService.resolve.mockResolvedValue([]);

      await service.executePublish(TENANT_ID, ANNOUNCEMENT_ID);

      expect(mockPrisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'published' }),
        }),
      );
      expect(mockAudienceService.resolve).toHaveBeenCalledWith(TENANT_ID, 'school', {});
    });

    it('should create notification records in batches of 100 (250 targets -> 3 batches)', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(
        buildMockAnnouncement({ scope: 'school', target_payload: {} }),
      );
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ status: 'published' }),
      );

      // Generate 250 targets with in_app channel only
      const targets = Array.from({ length: 250 }, (_, i) => ({
        user_id: `user-${i}`,
        locale: 'en',
        channels: ['in_app'],
      }));
      mockAudienceService.resolve.mockResolvedValue(targets);
      mockNotificationsService.createBatch.mockResolvedValue(undefined);

      await service.executePublish(TENANT_ID, ANNOUNCEMENT_ID);

      // 250 targets / 100 batch size = 3 batches
      expect(mockNotificationsService.createBatch).toHaveBeenCalledTimes(3);
    });

    it('should create notifications with correct source_entity_type and source_entity_id', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(
        buildMockAnnouncement({ scope: 'school', target_payload: {} }),
      );
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ status: 'published' }),
      );

      const targets = [{ user_id: 'user-1', locale: 'en', channels: ['in_app'] }];
      mockAudienceService.resolve.mockResolvedValue(targets);
      mockNotificationsService.createBatch.mockResolvedValue(undefined);
      mockQueue.add.mockResolvedValue(undefined);

      await service.executePublish(TENANT_ID, ANNOUNCEMENT_ID);

      expect(mockNotificationsService.createBatch).toHaveBeenCalledWith(
        TENANT_ID,
        expect.arrayContaining([
          expect.objectContaining({
            source_entity_type: 'announcement',
            source_entity_id: ANNOUNCEMENT_ID,
            recipient_user_id: 'user-1',
            channel: 'in_app',
            template_key: 'announcement.published',
          }),
        ]),
      );
    });
  });

  // ─── archive() ─────────────────────────────────────────────────────────────

  describe('archive()', () => {
    it('should archive published announcement', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(
        buildMockAnnouncement({ status: 'published' }),
      );
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ status: 'archived' }),
      );

      const result = await service.archive(TENANT_ID, ANNOUNCEMENT_ID);

      expect(result.status).toBe('archived');
      expect(mockPrisma.announcement.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { status: 'archived' },
        }),
      );
    });

    it('should archive draft announcement', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(
        buildMockAnnouncement({ status: 'draft' }),
      );
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ status: 'archived' }),
      );

      const result = await service.archive(TENANT_ID, ANNOUNCEMENT_ID);

      expect(result.status).toBe('archived');
    });

    it('edge: should throw when archiving pending_approval announcement', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(
        buildMockAnnouncement({ status: 'pending_approval' }),
      );

      await expect(service.archive(TENANT_ID, ANNOUNCEMENT_ID)).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.archive(TENANT_ID, ANNOUNCEMENT_ID)).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'INVALID_STATUS' }),
      });
    });
  });

  // ─── list() ────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('should return paginated announcements for a tenant', async () => {
      const announcements = [
        buildMockAnnouncement({ id: 'ann-1' }),
        buildMockAnnouncement({ id: 'ann-2' }),
      ];
      mockPrisma.announcement.findMany.mockResolvedValue(announcements);
      mockPrisma.announcement.count.mockResolvedValue(2);

      const result = await service.list(TENANT_ID, { page: 1, pageSize: 20 });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: TENANT_ID }),
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should filter by status when provided', async () => {
      mockPrisma.announcement.findMany.mockResolvedValue([]);
      mockPrisma.announcement.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 20, status: 'published' });

      expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            status: 'published',
          }),
        }),
      );
    });

    it('should calculate correct skip for page 2', async () => {
      mockPrisma.announcement.findMany.mockResolvedValue([]);
      mockPrisma.announcement.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 2, pageSize: 10 });

      expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 10,
          take: 10,
        }),
      );
    });

    it('should apply custom sort order', async () => {
      mockPrisma.announcement.findMany.mockResolvedValue([]);
      mockPrisma.announcement.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 20, sort: 'title', order: 'asc' });

      expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { title: 'asc' },
        }),
      );
    });

    it('should use default sort created_at desc', async () => {
      mockPrisma.announcement.findMany.mockResolvedValue([]);
      mockPrisma.announcement.count.mockResolvedValue(0);

      await service.list(TENANT_ID, { page: 1, pageSize: 20 });

      expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { created_at: 'desc' },
        }),
      );
    });

    it('edge: should not return announcements from other tenants', async () => {
      mockPrisma.announcement.findMany.mockResolvedValue([]);
      mockPrisma.announcement.count.mockResolvedValue(0);

      await service.list('other-tenant-id', { page: 1, pageSize: 20 });

      expect(mockPrisma.announcement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ tenant_id: 'other-tenant-id' }),
        }),
      );
    });
  });

  // ─── getById() ────────────────────────────────────────────────────────────

  describe('getById()', () => {
    it('should return announcement by id with author included', async () => {
      const announcement = buildMockAnnouncement();
      mockPrisma.announcement.findFirst.mockResolvedValue(announcement);

      const result = await service.getById(TENANT_ID, ANNOUNCEMENT_ID);

      expect(result).toEqual(announcement);
      expect(mockPrisma.announcement.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ANNOUNCEMENT_ID, tenant_id: TENANT_ID },
          include: expect.objectContaining({
            author: expect.objectContaining({
              select: expect.objectContaining({ id: true, first_name: true }),
            }),
          }),
        }),
      );
    });

    it('should throw ANNOUNCEMENT_NOT_FOUND when id does not exist', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(null);

      await expect(service.getById(TENANT_ID, 'nonexistent')).rejects.toThrow(NotFoundException);

      await expect(service.getById(TENANT_ID, 'nonexistent')).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ANNOUNCEMENT_NOT_FOUND' }),
      });
    });

    it('edge: should not return announcement from another tenant (RLS)', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(null);

      await expect(service.getById('other-tenant', ANNOUNCEMENT_ID)).rejects.toThrow(
        NotFoundException,
      );

      expect(mockPrisma.announcement.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: ANNOUNCEMENT_ID, tenant_id: 'other-tenant' },
        }),
      );
    });
  });

  // ─── executePublish() — delivery channels ────────────────────────────────

  describe('executePublish() — delivery channels', () => {
    it('should create notifications per delivery channel for each target', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(
        buildMockAnnouncement({
          scope: 'school',
          target_payload: {},
          delivery_channels: ['in_app', 'email'],
        }),
      );
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ status: 'published' }),
      );

      const targets = [{ user_id: 'user-1', locale: 'en', channels: ['in_app', 'email'] }];
      mockAudienceService.resolve.mockResolvedValue(targets);
      mockNotificationsService.createBatch.mockResolvedValue(undefined);
      mockQueue.add.mockResolvedValue(undefined);

      await service.executePublish(TENANT_ID, ANNOUNCEMENT_ID);

      // 1 target * 2 channels = 2 notification records
      const batchArg = mockNotificationsService.createBatch.mock.calls[0][1];
      expect(batchArg).toHaveLength(2);
      expect(batchArg[0].channel).toBe('in_app');
      expect(batchArg[1].channel).toBe('email');
    });

    it('should enqueue dispatch job only when non-in_app notifications exist', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(
        buildMockAnnouncement({
          scope: 'school',
          target_payload: {},
          delivery_channels: ['in_app', 'email'],
        }),
      );
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ status: 'published' }),
      );

      const targets = [{ user_id: 'user-1', locale: 'en', channels: ['in_app', 'email'] }];
      mockAudienceService.resolve.mockResolvedValue(targets);
      mockNotificationsService.createBatch.mockResolvedValue(undefined);
      mockQueue.add.mockResolvedValue(undefined);

      await service.executePublish(TENANT_ID, ANNOUNCEMENT_ID);

      expect(mockQueue.add).toHaveBeenCalledWith(
        'communications:dispatch-notifications',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          announcement_id: ANNOUNCEMENT_ID,
        }),
        expect.any(Object),
      );
    });

    it('should not enqueue dispatch job when only in_app notifications', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(
        buildMockAnnouncement({
          scope: 'school',
          target_payload: {},
          delivery_channels: ['in_app'],
        }),
      );
      mockPrisma.announcement.update.mockResolvedValue(
        buildMockAnnouncement({ status: 'published' }),
      );

      const targets = [{ user_id: 'user-1', locale: 'en', channels: ['in_app'] }];
      mockAudienceService.resolve.mockResolvedValue(targets);
      mockNotificationsService.createBatch.mockResolvedValue(undefined);

      await service.executePublish(TENANT_ID, ANNOUNCEMENT_ID);

      expect(mockQueue.add).not.toHaveBeenCalled();
    });

    it('should return early without creating notifications when announcement not found', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(null);

      await service.executePublish(TENANT_ID, 'nonexistent-id');

      expect(mockPrisma.announcement.update).not.toHaveBeenCalled();
      expect(mockAudienceService.resolve).not.toHaveBeenCalled();
      expect(mockNotificationsService.createBatch).not.toHaveBeenCalled();
    });
  });

  // ─── create() — delivery_channels ─────────────────────────────────────────

  describe('create() — delivery_channels', () => {
    it('should default to in_app when no delivery_channels provided', async () => {
      const dto = {
        title: 'Test',
        body_html: '<p>Hello</p>',
        scope: 'school',
        target_payload: {},
      };
      mockPrisma.announcement.create.mockResolvedValue(buildMockAnnouncement());

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            delivery_channels: ['in_app'],
          }),
        }),
      );
    });

    it('should prepend in_app if not in delivery_channels', async () => {
      const dto = {
        title: 'Test',
        body_html: '<p>Hello</p>',
        scope: 'school',
        target_payload: {},
        delivery_channels: ['email'],
      };
      mockPrisma.announcement.create.mockResolvedValue(buildMockAnnouncement());

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            delivery_channels: ['in_app', 'email'],
          }),
        }),
      );
    });

    it('should not duplicate in_app if already in delivery_channels', async () => {
      const dto = {
        title: 'Test',
        body_html: '<p>Hello</p>',
        scope: 'school',
        target_payload: {},
        delivery_channels: ['in_app', 'email'],
      };
      mockPrisma.announcement.create.mockResolvedValue(buildMockAnnouncement());

      await service.create(TENANT_ID, USER_ID, dto);

      expect(mockPrisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            delivery_channels: ['in_app', 'email'],
          }),
        }),
      );
    });
  });

  // ─── getDeliveryStatus() ───────────────────────────────────────────────────

  describe('getDeliveryStatus()', () => {
    it('should aggregate notification statuses for an announcement', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(buildMockAnnouncement());
      mockPrisma.notification.groupBy.mockResolvedValue([
        { status: 'queued', _count: 5 },
        { status: 'sent', _count: 10 },
        { status: 'delivered', _count: 20 },
        { status: 'read', _count: 8 },
        { status: 'failed', _count: 2 },
      ]);

      const result = await service.getDeliveryStatus(TENANT_ID, ANNOUNCEMENT_ID);

      expect(result).toEqual({
        total: 45,
        queued: 5,
        sent: 10,
        delivered: 20,
        read: 8,
        failed: 2,
      });
    });

    it('should return all-zero counts when no notifications exist', async () => {
      mockPrisma.announcement.findFirst.mockResolvedValue(buildMockAnnouncement());
      mockPrisma.notification.groupBy.mockResolvedValue([]);

      const result = await service.getDeliveryStatus(TENANT_ID, ANNOUNCEMENT_ID);

      expect(result).toEqual({
        total: 0,
        queued: 0,
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
      });
    });
  });

  // ─── listForParent() ──────────────────────────────────────────────────────

  describe('listForParent()', () => {
    it('should return only announcements the parent received a notification for', async () => {
      const parentUserId = 'parent-user-1';
      mockPrisma.notification.findMany.mockResolvedValue([
        { source_entity_id: 'ann-1' },
        { source_entity_id: 'ann-2' },
      ]);
      mockPrisma.announcement.findMany.mockResolvedValue([
        {
          id: 'ann-1',
          title: 'Announcement 1',
          body_html: '<p>1</p>',
          published_at: new Date(),
          scope: 'school',
        },
        {
          id: 'ann-2',
          title: 'Announcement 2',
          body_html: '<p>2</p>',
          published_at: new Date(),
          scope: 'school',
        },
      ]);
      mockPrisma.announcement.count.mockResolvedValue(2);

      const result = await service.listForParent(TENANT_ID, parentUserId, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            recipient_user_id: parentUserId,
            source_entity_type: 'announcement',
          }),
        }),
      );
    });

    it('should not return announcements from other users notifications', async () => {
      const parentUserId = 'parent-user-1';
      // This parent has no notifications
      mockPrisma.notification.findMany.mockResolvedValue([]);

      const result = await service.listForParent(TENANT_ID, parentUserId, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
      // Should NOT have called announcement.findMany since no notification IDs
      expect(mockPrisma.announcement.findMany).not.toHaveBeenCalled();
    });
  });
});
