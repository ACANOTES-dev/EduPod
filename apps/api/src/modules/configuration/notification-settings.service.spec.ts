import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { NotificationSettingsService } from './notification-settings.service';

const TENANT_ID = 'tenant-uuid-1';
const SETTING_ID = 'setting-uuid-1';

describe('NotificationSettingsService', () => {
  let service: NotificationSettingsService;
  let mockPrisma: {
    tenantNotificationSetting: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
  };

  beforeEach(async () => {
    mockPrisma = {
      tenantNotificationSetting: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationSettingsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NotificationSettingsService>(NotificationSettingsService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('listSettings', () => {
    it('should return all notification settings ordered by type', async () => {
      const settings = [
        { id: '1', notification_type: 'attendance.exception', is_enabled: true },
        { id: '2', notification_type: 'invoice.issued', is_enabled: true },
      ];
      mockPrisma.tenantNotificationSetting.findMany.mockResolvedValue(settings);

      const result = await service.listSettings(TENANT_ID);

      expect(mockPrisma.tenantNotificationSetting.findMany).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID },
        orderBy: { notification_type: 'asc' },
      });
      expect(result).toEqual(settings);
    });

    it('should return empty array when no settings exist', async () => {
      mockPrisma.tenantNotificationSetting.findMany.mockResolvedValue([]);

      const result = await service.listSettings(TENANT_ID);

      expect(result).toEqual([]);
    });
  });

  describe('updateSetting', () => {
    it('should update is_enabled for a valid notification type', async () => {
      const existing = { id: SETTING_ID, tenant_id: TENANT_ID, notification_type: 'invoice.issued', is_enabled: true };
      mockPrisma.tenantNotificationSetting.findFirst.mockResolvedValue(existing);
      mockPrisma.tenantNotificationSetting.update.mockResolvedValue({ ...existing, is_enabled: false });

      const result = await service.updateSetting(TENANT_ID, 'invoice.issued', { is_enabled: false });

      expect(mockPrisma.tenantNotificationSetting.findFirst).toHaveBeenCalledWith({
        where: { tenant_id: TENANT_ID, notification_type: 'invoice.issued' },
      });
      expect(mockPrisma.tenantNotificationSetting.update).toHaveBeenCalledWith({
        where: { id: SETTING_ID },
        data: { is_enabled: false },
      });
      expect(result.is_enabled).toBe(false);
    });

    it('should update channels for a valid notification type', async () => {
      const existing = { id: SETTING_ID, tenant_id: TENANT_ID, notification_type: 'payment.received' };
      mockPrisma.tenantNotificationSetting.findFirst.mockResolvedValue(existing);
      mockPrisma.tenantNotificationSetting.update.mockResolvedValue({
        ...existing,
        channels: ['email', 'in_app'],
      });

      const result = await service.updateSetting(TENANT_ID, 'payment.received', {
        channels: ['email', 'in_app'],
      });

      expect(mockPrisma.tenantNotificationSetting.update).toHaveBeenCalledWith({
        where: { id: SETTING_ID },
        data: { channels: ['email', 'in_app'] },
      });
      expect(result.channels).toEqual(['email', 'in_app']);
    });

    it('should throw BadRequestException for an invalid notification type', async () => {
      await expect(
        service.updateSetting(TENANT_ID, 'invalid.type', { is_enabled: false }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when setting does not exist', async () => {
      mockPrisma.tenantNotificationSetting.findFirst.mockResolvedValue(null);

      await expect(
        service.updateSetting(TENANT_ID, 'invoice.issued', { is_enabled: false }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should only include defined fields in the update data', async () => {
      const existing = { id: SETTING_ID, tenant_id: TENANT_ID, notification_type: 'invoice.issued' };
      mockPrisma.tenantNotificationSetting.findFirst.mockResolvedValue(existing);
      mockPrisma.tenantNotificationSetting.update.mockResolvedValue(existing);

      // Only pass is_enabled, not channels
      await service.updateSetting(TENANT_ID, 'invoice.issued', { is_enabled: true });

      expect(mockPrisma.tenantNotificationSetting.update).toHaveBeenCalledWith({
        where: { id: SETTING_ID },
        data: { is_enabled: true },
      });
    });
  });
});
