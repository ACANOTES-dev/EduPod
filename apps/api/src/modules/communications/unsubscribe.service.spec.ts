import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import * as jwt from 'jsonwebtoken';

import { PrismaService } from '../prisma/prisma.service';

import { UnsubscribeService } from './unsubscribe.service';

const TENANT_ID = 'tenant-uuid-1';
const USER_ID = 'user-uuid-1';
const NOTIFICATION_ID = 'notification-uuid-1';
const JWT_SECRET = 'test-jwt-secret-for-unit-tests';
const APP_URL = 'https://app.edupod.test';

describe('UnsubscribeService', () => {
  let service: UnsubscribeService;
  let mockPrisma: {
    notification: {
      findFirst: jest.Mock;
    };
    tenantNotificationSetting: {
      upsert: jest.Mock;
    };
  };
  let mockConfigService: {
    get: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      notification: {
        findFirst: jest.fn(),
      },
      tenantNotificationSetting: {
        upsert: jest.fn(),
      },
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return JWT_SECRET;
        if (key === 'APP_URL') return APP_URL;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UnsubscribeService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<UnsubscribeService>(UnsubscribeService);

    jest.clearAllMocks();
    // Re-setup config after clearAllMocks
    mockConfigService.get.mockImplementation((key: string) => {
      if (key === 'JWT_SECRET') return JWT_SECRET;
      if (key === 'APP_URL') return APP_URL;
      return undefined;
    });
  });

  afterEach(() => jest.clearAllMocks());

  // ─── generateUrl() ────────────────────────────────────────────────────────

  describe('UnsubscribeService — generateUrl', () => {
    it('should generate a URL containing a signed JWT token', () => {
      const url = service.generateUrl(NOTIFICATION_ID, USER_ID);

      expect(url).toContain(`${APP_URL}/api/v1/notifications/unsubscribe?token=`);
      // Extract the token and verify it
      const token = url.split('token=')[1];
      expect(token).toBeDefined();

      const decoded = jwt.verify(token!, JWT_SECRET) as Record<string, unknown>;
      expect(decoded.notification_id).toBe(NOTIFICATION_ID);
      expect(decoded.user_id).toBe(USER_ID);
      expect(decoded.sub).toBe('notification-unsubscribe');
    });

    it('should generate token with 90-day expiry', () => {
      const url = service.generateUrl(NOTIFICATION_ID, USER_ID);
      const token = url.split('token=')[1]!;

      const decoded = jwt.verify(token, JWT_SECRET) as Record<string, unknown>;
      const exp = decoded.exp as number;
      const iat = decoded.iat as number;

      // 90 days = 7,776,000 seconds
      const diff = exp - iat;
      expect(diff).toBe(7_776_000);
    });

    it('should throw when JWT_SECRET is not configured', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'APP_URL') return APP_URL;
        return undefined;
      });

      expect(() => service.generateUrl(NOTIFICATION_ID, USER_ID)).toThrow(
        'JWT_SECRET is not configured',
      );
    });

    it('should throw when APP_URL is not configured', () => {
      mockConfigService.get.mockImplementation((key: string) => {
        if (key === 'JWT_SECRET') return JWT_SECRET;
        return undefined;
      });

      expect(() => service.generateUrl(NOTIFICATION_ID, USER_ID)).toThrow(
        'APP_URL is not configured',
      );
    });

    it('should generate unique tokens for different notification IDs', () => {
      const url1 = service.generateUrl('notif-1', USER_ID);
      const url2 = service.generateUrl('notif-2', USER_ID);

      const token1 = url1.split('token=')[1]!;
      const token2 = url2.split('token=')[1]!;
      expect(token1).not.toBe(token2);
    });
  });

  // ─── processUnsubscribe() ─────────────────────────────────────────────────

  describe('UnsubscribeService — processUnsubscribe', () => {
    function generateValidToken(overrides: Partial<Record<string, string>> = {}): string {
      return jwt.sign(
        {
          notification_id: NOTIFICATION_ID,
          user_id: USER_ID,
          ...overrides,
        },
        JWT_SECRET,
        {
          expiresIn: '90d',
          subject: 'notification-unsubscribe',
        },
      );
    }

    it('should disable the notification type for the tenant', async () => {
      const token = generateValidToken();

      mockPrisma.notification.findFirst.mockResolvedValue({
        id: NOTIFICATION_ID,
        tenant_id: TENANT_ID,
        template_key: 'announcement.published',
      });
      mockPrisma.tenantNotificationSetting.upsert.mockResolvedValue({});

      await service.processUnsubscribe(token);

      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: {
          id: NOTIFICATION_ID,
          recipient_user_id: USER_ID,
        },
        select: {
          id: true,
          tenant_id: true,
          template_key: true,
        },
      });

      expect(mockPrisma.tenantNotificationSetting.upsert).toHaveBeenCalledWith({
        where: {
          tenant_id_notification_type: {
            tenant_id: TENANT_ID,
            notification_type: 'announcement.published',
          },
        },
        create: {
          tenant_id: TENANT_ID,
          notification_type: 'announcement.published',
          is_enabled: false,
          channels: [],
        },
        update: {
          is_enabled: false,
        },
      });
    });

    it('should throw when token is invalid', async () => {
      await expect(service.processUnsubscribe('invalid-token')).rejects.toThrow(
        'Invalid or expired unsubscribe token',
      );
    });

    it('should throw when token has expired', async () => {
      // Create a token that expired 1 second ago
      const expiredToken = jwt.sign(
        {
          notification_id: NOTIFICATION_ID,
          user_id: USER_ID,
        },
        JWT_SECRET,
        {
          expiresIn: '-1s',
          subject: 'notification-unsubscribe',
        },
      );

      await expect(service.processUnsubscribe(expiredToken)).rejects.toThrow(
        'Invalid or expired unsubscribe token',
      );
    });

    it('should throw when token has wrong subject', async () => {
      const wrongSubjectToken = jwt.sign(
        {
          notification_id: NOTIFICATION_ID,
          user_id: USER_ID,
        },
        JWT_SECRET,
        {
          expiresIn: '90d',
          subject: 'password-reset',
        },
      );

      await expect(service.processUnsubscribe(wrongSubjectToken)).rejects.toThrow(
        'Invalid or expired unsubscribe token',
      );
    });

    it('should throw when notification not found', async () => {
      const token = generateValidToken();
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      await expect(service.processUnsubscribe(token)).rejects.toThrow('Notification not found');
    });

    it('should throw when notification has no template_key', async () => {
      const token = generateValidToken();
      mockPrisma.notification.findFirst.mockResolvedValue({
        id: NOTIFICATION_ID,
        tenant_id: TENANT_ID,
        template_key: null,
      });

      await expect(service.processUnsubscribe(token)).rejects.toThrow(
        'Cannot determine notification type for unsubscribe',
      );
    });

    it('should throw when JWT_SECRET is not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      await expect(service.processUnsubscribe('some-token')).rejects.toThrow(
        'JWT_SECRET is not configured',
      );
    });

    it('edge: different users cannot unsubscribe each others notifications', async () => {
      // Token was created for USER_ID, notification belongs to different user
      const token = generateValidToken({ user_id: 'other-user-id' });
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      // The query includes recipient_user_id from the token, so if user
      // doesn't match, findFirst returns null
      await expect(service.processUnsubscribe(token)).rejects.toThrow('Notification not found');

      expect(mockPrisma.notification.findFirst).toHaveBeenCalledWith({
        where: {
          id: NOTIFICATION_ID,
          recipient_user_id: 'other-user-id',
        },
        select: {
          id: true,
          tenant_id: true,
          template_key: true,
        },
      });
    });
  });
});
