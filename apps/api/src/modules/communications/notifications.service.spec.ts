import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

import { NotificationsService } from './notifications.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const NOTIFICATION_ID = 'notification-uuid-1';

function buildMockNotification(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: NOTIFICATION_ID,
    tenant_id: TENANT_ID,
    recipient_user_id: USER_ID,
    channel: 'in_app',
    template_key: 'announcement.published',
    locale: 'en',
    status: 'delivered',
    payload_json: { announcement_id: 'ann-1', announcement_title: 'Hello' },
    source_entity_type: 'announcement',
    source_entity_id: 'ann-1',
    read_at: null,
    delivered_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

describe('NotificationsService', () => {
  let service: NotificationsService;
  let mockPrisma: {
    notification: {
      findFirst: jest.Mock;
      findMany: jest.Mock;
      count: jest.Mock;
      createMany: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
  };
  let mockRedisClient: {
    get: jest.Mock;
    set: jest.Mock;
    del: jest.Mock;
  };
  let mockRedis: {
    getClient: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      notification: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
    };

    mockRedisClient = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };

    mockRedis = {
      getClient: jest.fn().mockReturnValue(mockRedisClient),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);

    jest.clearAllMocks();
    // Re-setup getClient after clearAllMocks
    mockRedis.getClient.mockReturnValue(mockRedisClient);
  });

  // ─── listForUser() ────────────────────────────────────────────────────────

  describe('listForUser()', () => {
    it('should return paginated notifications for current user only', async () => {
      const notifications = [
        buildMockNotification({ id: 'n-1' }),
        buildMockNotification({ id: 'n-2' }),
      ];
      mockPrisma.notification.findMany.mockResolvedValue(notifications);
      mockPrisma.notification.count.mockResolvedValue(2);

      const result = await service.listForUser(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta).toEqual({ page: 1, pageSize: 20, total: 2 });
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            recipient_user_id: USER_ID,
          }),
          skip: 0,
          take: 20,
        }),
      );
    });

    it('should filter by unread_only', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await service.listForUser(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 20,
        unread_only: true,
      });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['queued', 'sent', 'delivered'] },
          }),
        }),
      );
    });

    it('should return empty list when user has no notifications', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      const result = await service.listForUser(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should order by created_at descending', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await service.listForUser(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 20,
      });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { created_at: 'desc' },
        }),
      );
    });
  });

  // ─── getUnreadCount() ─────────────────────────────────────────────────────

  describe('getUnreadCount()', () => {
    it('should return cached count when Redis key exists', async () => {
      mockRedisClient.get.mockResolvedValue('5');

      const result = await service.getUnreadCount(TENANT_ID, USER_ID);

      expect(result).toBe(5);
      expect(mockPrisma.notification.count).not.toHaveBeenCalled();
    });

    it('should count from DB and cache when Redis miss', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.notification.count.mockResolvedValue(12);

      const result = await service.getUnreadCount(TENANT_ID, USER_ID);

      expect(result).toBe(12);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            recipient_user_id: USER_ID,
            status: { in: ['queued', 'sent', 'delivered'] },
          }),
        }),
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        expect.stringContaining(USER_ID),
        '12',
        'EX',
        30,
      );
    });

    it('should return 0 when user has no unread notifications', async () => {
      mockRedisClient.get.mockResolvedValue(null);
      mockPrisma.notification.count.mockResolvedValue(0);

      const result = await service.getUnreadCount(TENANT_ID, USER_ID);

      expect(result).toBe(0);
    });
  });

  // ─── markAsRead() ─────────────────────────────────────────────────────────

  describe('markAsRead()', () => {
    it('should mark notification as read and update read_at', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(
        buildMockNotification({ status: 'delivered' }),
      );
      mockPrisma.notification.update.mockResolvedValue(
        buildMockNotification({ status: 'read', read_at: new Date() }),
      );
      mockRedisClient.del.mockResolvedValue(1);

      await service.markAsRead(TENANT_ID, USER_ID, NOTIFICATION_ID);

      expect(mockPrisma.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: NOTIFICATION_ID },
          data: expect.objectContaining({ status: 'read' }),
        }),
      );
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        `tenant:${TENANT_ID}:user:${USER_ID}:unread_notifications`,
      );
    });

    it('should throw when notification belongs to different user', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.markAsRead(TENANT_ID, USER_ID, 'other-notification-id')).rejects.toThrow(
        NotFoundException,
      );

      await expect(
        service.markAsRead(TENANT_ID, USER_ID, 'other-notification-id'),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'NOTIFICATION_NOT_FOUND' }),
      });
    });

    it('edge: should not error when notification already read', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(
        buildMockNotification({ status: 'read', read_at: new Date() }),
      );

      // Should return early without calling update
      await service.markAsRead(TENANT_ID, USER_ID, NOTIFICATION_ID);

      expect(mockPrisma.notification.update).not.toHaveBeenCalled();
      expect(mockRedisClient.del).not.toHaveBeenCalled();
    });
  });

  // ─── markAllAsRead() ──────────────────────────────────────────────────────

  describe('markAllAsRead()', () => {
    it('should mark all unread notifications as read', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 5 });
      mockRedisClient.set.mockResolvedValue('OK');

      await service.markAllAsRead(TENANT_ID, USER_ID);

      expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            recipient_user_id: USER_ID,
            status: { in: ['queued', 'sent', 'delivered'] },
          }),
          data: expect.objectContaining({ status: 'read' }),
        }),
      );
      expect(mockRedisClient.set).toHaveBeenCalledWith(
        `tenant:${TENANT_ID}:user:${USER_ID}:unread_notifications`,
        '0',
        'EX',
        30,
      );
    });

    it('should only mark this users notifications', async () => {
      mockPrisma.notification.updateMany.mockResolvedValue({ count: 0 });
      mockRedisClient.set.mockResolvedValue('OK');

      await service.markAllAsRead(TENANT_ID, USER_ID);

      const callArgs = mockPrisma.notification.updateMany.mock.calls[0][0];
      expect(callArgs.where.recipient_user_id).toBe(USER_ID);
      expect(callArgs.where.tenant_id).toBe(TENANT_ID);
    });
  });

  // ─── listForUser() — status filter ──────────────────────────────────────

  describe('listForUser() — status filter', () => {
    it('should filter by status when provided', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await service.listForUser(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 20,
        status: 'failed',
      });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: 'failed',
          }),
        }),
      );
    });

    it('edge: unread_only should override status filter', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await service.listForUser(TENANT_ID, USER_ID, {
        page: 1,
        pageSize: 20,
        status: 'failed',
        unread_only: true,
      });

      // unread_only sets status to { in: [...] }, overriding the explicit status
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: ['queued', 'sent', 'delivered'] },
          }),
        }),
      );
    });
  });

  // ─── listFailed() ────────────────────────────────────────────────────────

  describe('listFailed()', () => {
    it('should return paginated failed notifications with recipient info', async () => {
      const failedNotifications = [
        {
          ...buildMockNotification({ id: 'n-1', status: 'failed' }),
          recipient: { id: USER_ID, first_name: 'Test', last_name: 'User', email: 'test@test.com' },
        },
      ];
      mockPrisma.notification.findMany.mockResolvedValue(failedNotifications);
      mockPrisma.notification.count.mockResolvedValue(1);

      const result = await service.listFailed(TENANT_ID, { page: 1, pageSize: 100 });

      expect(result.data).toHaveLength(1);
      expect(result.meta).toEqual({ page: 1, pageSize: 100, total: 1 });
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenant_id: TENANT_ID, status: 'failed' },
          skip: 0,
          take: 100,
          orderBy: { created_at: 'desc' },
          include: {
            recipient: {
              select: { id: true, first_name: true, last_name: true, email: true },
            },
          },
        }),
      );
    });

    it('should return empty list when no failed notifications', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      const result = await service.listFailed(TENANT_ID, { page: 1, pageSize: 100 });

      expect(result.data).toEqual([]);
      expect(result.meta.total).toBe(0);
    });

    it('should paginate correctly on page 2', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);
      mockPrisma.notification.count.mockResolvedValue(0);

      await service.listFailed(TENANT_ID, { page: 2, pageSize: 50 });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 50,
          take: 50,
        }),
      );
    });
  });

  // ─── getUnreadCount() — cached undefined ──────────────────────────────────

  describe('getUnreadCount() — cached undefined', () => {
    it('should query DB when Redis returns undefined (not null)', async () => {
      mockRedisClient.get.mockResolvedValue(undefined);
      mockPrisma.notification.count.mockResolvedValue(7);

      const result = await service.getUnreadCount(TENANT_ID, USER_ID);

      // undefined fails the `!== null && !== undefined` check, so falls through to DB
      expect(result).toBe(7);
      expect(mockPrisma.notification.count).toHaveBeenCalled();
    });

    it('should return cached value 0 as number', async () => {
      mockRedisClient.get.mockResolvedValue('0');

      const result = await service.getUnreadCount(TENANT_ID, USER_ID);

      // '0' is not null/undefined so it should be parsed
      expect(result).toBe(0);
      expect(mockPrisma.notification.count).not.toHaveBeenCalled();
    });
  });

  // ─── createBatch() — source entity defaults ──────────────────────────────

  describe('createBatch() — source entity defaults', () => {
    it('should default source_entity_type and source_entity_id to null when not provided', async () => {
      const notifications = [
        {
          tenant_id: TENANT_ID,
          recipient_user_id: 'user-1',
          channel: 'in_app',
          template_key: null,
          locale: 'en',
          payload_json: {},
        },
      ];
      mockPrisma.notification.createMany.mockResolvedValue({ count: 1 });
      mockRedisClient.del.mockResolvedValue(1);

      await service.createBatch(TENANT_ID, notifications);

      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
        data: [
          expect.objectContaining({
            source_entity_type: null,
            source_entity_id: null,
          }),
        ],
      });
    });
  });

  // ─── createBatch() ────────────────────────────────────────────────────────

  describe('createBatch()', () => {
    it('should bulk insert notification records', async () => {
      const notifications = [
        {
          tenant_id: TENANT_ID,
          recipient_user_id: 'user-1',
          channel: 'in_app',
          template_key: 'announcement.published',
          locale: 'en',
          payload_json: { announcement_id: 'ann-1' },
          source_entity_type: 'announcement',
          source_entity_id: 'ann-1',
        },
        {
          tenant_id: TENANT_ID,
          recipient_user_id: 'user-2',
          channel: 'email',
          template_key: 'announcement.published',
          locale: 'en',
          payload_json: { announcement_id: 'ann-1' },
          source_entity_type: 'announcement',
          source_entity_id: 'ann-1',
        },
      ];
      mockPrisma.notification.createMany.mockResolvedValue({ count: 2 });
      mockRedisClient.del.mockResolvedValue(1);

      await service.createBatch(TENANT_ID, notifications);

      expect(mockPrisma.notification.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({
            tenant_id: TENANT_ID,
            recipient_user_id: 'user-1',
            channel: 'in_app',
            status: 'delivered', // in_app gets delivered status
          }),
          expect.objectContaining({
            tenant_id: TENANT_ID,
            recipient_user_id: 'user-2',
            channel: 'email',
            status: 'queued', // non-in_app gets queued status
          }),
        ]),
      });
    });

    it('should invalidate Redis unread count for each recipient', async () => {
      const notifications = [
        {
          tenant_id: TENANT_ID,
          recipient_user_id: 'user-1',
          channel: 'in_app',
          template_key: null,
          locale: 'en',
          payload_json: {},
        },
        {
          tenant_id: TENANT_ID,
          recipient_user_id: 'user-2',
          channel: 'in_app',
          template_key: null,
          locale: 'en',
          payload_json: {},
        },
        {
          tenant_id: TENANT_ID,
          recipient_user_id: 'user-1', // duplicate user
          channel: 'email',
          template_key: null,
          locale: 'en',
          payload_json: {},
        },
      ];
      mockPrisma.notification.createMany.mockResolvedValue({ count: 3 });
      mockRedisClient.del.mockResolvedValue(1);

      await service.createBatch(TENANT_ID, notifications);

      // Should de-duplicate: only 2 unique user IDs
      expect(mockRedisClient.del).toHaveBeenCalledTimes(2);
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        `tenant:${TENANT_ID}:user:user-1:unread_notifications`,
      );
      expect(mockRedisClient.del).toHaveBeenCalledWith(
        `tenant:${TENANT_ID}:user:user-2:unread_notifications`,
      );
    });
  });
});
