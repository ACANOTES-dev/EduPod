import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { CommunicationsReadFacade } from './communications-read.facade';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';

describe('CommunicationsReadFacade', () => {
  let facade: CommunicationsReadFacade;
  let mockPrisma: {
    notification: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      notification: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CommunicationsReadFacade, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    facade = module.get<CommunicationsReadFacade>(CommunicationsReadFacade);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── findNotificationsBySourceEntity() ──────────────────────────────────────

  describe('CommunicationsReadFacade — findNotificationsBySourceEntity', () => {
    it('should return notifications matching source entity type and id', async () => {
      const notifications = [
        {
          id: 'n-1',
          tenant_id: TENANT_ID,
          recipient_user_id: 'user-1',
          channel: 'email',
          template_key: 'welcome',
          locale: 'en',
          status: 'sent',
          source_entity_type: 'student',
          source_entity_id: 'stu-1',
          created_at: new Date(),
          sent_at: new Date(),
          read_at: null,
        },
      ];
      mockPrisma.notification.findMany.mockResolvedValue(notifications);

      const result = await facade.findNotificationsBySourceEntity(TENANT_ID, 'student', 'stu-1');

      expect(result).toEqual(notifications);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          source_entity_type: 'student',
          source_entity_id: 'stu-1',
        },
        select: {
          id: true,
          tenant_id: true,
          recipient_user_id: true,
          channel: true,
          template_key: true,
          locale: true,
          status: true,
          source_entity_type: true,
          source_entity_id: true,
          created_at: true,
          sent_at: true,
          read_at: true,
        },
        orderBy: { created_at: 'desc' },
      });
    });

    it('should return empty array when no notifications match', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      const result = await facade.findNotificationsBySourceEntity(
        TENANT_ID,
        'student',
        'nonexistent',
      );

      expect(result).toEqual([]);
    });
  });

  // ─── findNotificationsByRecipient() ─────────────────────────────────────────

  describe('CommunicationsReadFacade — findNotificationsByRecipient', () => {
    it('should return notifications for a specific recipient', async () => {
      const notifications = [
        {
          id: 'n-1',
          tenant_id: TENANT_ID,
          recipient_user_id: USER_ID,
          channel: 'in_app',
          template_key: null,
          locale: 'en',
          status: 'delivered',
          source_entity_type: null,
          source_entity_id: null,
          created_at: new Date(),
          sent_at: null,
          read_at: null,
        },
      ];
      mockPrisma.notification.findMany.mockResolvedValue(notifications);

      const result = await facade.findNotificationsByRecipient(TENANT_ID, USER_ID);

      expect(result).toEqual(notifications);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          recipient_user_id: USER_ID,
        },
        select: expect.objectContaining({
          id: true,
          recipient_user_id: true,
        }),
        orderBy: { created_at: 'desc' },
      });
    });

    it('should return empty array when recipient has no notifications', async () => {
      const result = await facade.findNotificationsByRecipient(TENANT_ID, 'no-notif-user');

      expect(result).toEqual([]);
    });
  });

  // ─── countNotificationsBeforeDate() ─────────────────────────────────────────

  describe('CommunicationsReadFacade — countNotificationsBeforeDate', () => {
    it('should return count of notifications before cutoff date', async () => {
      mockPrisma.notification.count.mockResolvedValue(42);
      const cutoff = new Date('2025-01-01');

      const result = await facade.countNotificationsBeforeDate(TENANT_ID, cutoff);

      expect(result).toBe(42);
      expect(mockPrisma.notification.count).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          created_at: { lt: cutoff },
        },
      });
    });

    it('should return 0 when no notifications exist before cutoff', async () => {
      mockPrisma.notification.count.mockResolvedValue(0);

      const result = await facade.countNotificationsBeforeDate(TENANT_ID, new Date());

      expect(result).toBe(0);
    });
  });

  // ─── findInAppNotificationsForUsers() ───────────────────────────────────────

  describe('CommunicationsReadFacade — findInAppNotificationsForUsers', () => {
    it('should return in-app notifications for given users since a date', async () => {
      const since = new Date('2025-06-01');
      const rows = [
        { id: 'n-1', recipient_user_id: 'u-1', read_at: null, created_at: new Date() },
        { id: 'n-2', recipient_user_id: 'u-2', read_at: new Date(), created_at: new Date() },
      ];
      mockPrisma.notification.findMany.mockResolvedValue(rows);

      const result = await facade.findInAppNotificationsForUsers(TENANT_ID, ['u-1', 'u-2'], since);

      expect(result).toEqual(rows);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          recipient_user_id: { in: ['u-1', 'u-2'] },
          channel: 'in_app',
          created_at: { gte: since },
        },
        select: {
          id: true,
          recipient_user_id: true,
          read_at: true,
          created_at: true,
        },
        orderBy: { created_at: 'desc' },
      });
    });

    it('should return empty array when userIds is empty', async () => {
      const result = await facade.findInAppNotificationsForUsers(TENANT_ID, [], new Date());

      expect(result).toEqual([]);
      expect(mockPrisma.notification.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── hasNotificationForSourceEntity() ───────────────────────────────────────

  describe('CommunicationsReadFacade — hasNotificationForSourceEntity', () => {
    it('should return true when notification exists for source entity', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue({ id: 'n-1' });

      const result = await facade.hasNotificationForSourceEntity(TENANT_ID, 'attendance', 'att-1');

      expect(result).toBe(true);
      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: {
          tenant_id: TENANT_ID,
          source_entity_type: 'attendance',
          source_entity_id: 'att-1',
        },
        select: { id: true },
      });
    });

    it('should return false when no notification exists', async () => {
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const result = await facade.hasNotificationForSourceEntity(
        TENANT_ID,
        'attendance',
        'nonexistent',
      );

      expect(result).toBe(false);
    });
  });

  // ─── findNotificationsGeneric() ─────────────────────────────────────────────

  describe('CommunicationsReadFacade — findNotificationsGeneric', () => {
    it('should query with additional where filters merged with tenant_id', async () => {
      const rows = [{ id: 'n-1' }];
      mockPrisma.notification.findMany.mockResolvedValue(rows);

      const result = await facade.findNotificationsGeneric(
        TENANT_ID,
        { channel: 'email' },
        { id: true, channel: true },
      );

      expect(result).toEqual(rows);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, channel: 'email' },
        select: { id: true, channel: true },
      });
    });

    it('should query with only tenant_id when no extra filters', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      const result = await facade.findNotificationsGeneric(TENANT_ID);

      expect(result).toEqual([]);
      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
      });
    });

    it('should pass select when provided but no where filter', async () => {
      mockPrisma.notification.findMany.mockResolvedValue([]);

      await facade.findNotificationsGeneric(TENANT_ID, undefined, { id: true });

      expect(mockPrisma.notification.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        select: { id: true },
      });
    });
  });
});
