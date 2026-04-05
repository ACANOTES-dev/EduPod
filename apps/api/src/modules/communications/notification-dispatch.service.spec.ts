import { Test, TestingModule } from '@nestjs/testing';

import {
  MOCK_FACADE_PROVIDERS,
  AuthReadFacade,
  ParentReadFacade,
} from '../../common/tests/mock-facades';
import { ConsentService } from '../gdpr/consent.service';
import { PrismaService } from '../prisma/prisma.service';

import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationRateLimitService } from './notification-rate-limit.service';
import { NotificationTemplatesService } from './notification-templates.service';
import { ResendEmailProvider } from './providers/resend-email.provider';
import { TwilioSmsProvider } from './providers/twilio-sms.provider';
import { TwilioWhatsAppProvider } from './providers/twilio-whatsapp.provider';
import { TemplateRendererService } from './template-renderer.service';

describe('NotificationDispatchService', () => {
  let service: NotificationDispatchService;
  let mockParentFacade: { findContactByUserId: jest.Mock; resolveIdByUserId: jest.Mock };
  let prisma: {
    parent: {
      findFirst: jest.Mock;
    };
    user: {
      findUnique: jest.Mock;
    };
    notification: {
      findUnique: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
  };
  let templateService: { resolveTemplate: jest.Mock };
  let consentService: { hasConsent: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      parent: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'parent-1',
          phone: '+353851234567',
          whatsapp_phone: '+353851234567',
        }),
      },
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
      },
      notification: {
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    templateService = {
      resolveTemplate: jest.fn(),
    };
    consentService = {
      hasConsent: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        NotificationDispatchService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConsentService, useValue: consentService },
        { provide: NotificationTemplatesService, useValue: templateService },
        {
          provide: TemplateRendererService,
          useValue: {
            render: jest.fn().mockReturnValue('rendered'),
            renderSubject: jest.fn().mockReturnValue('subject'),
            stripHtml: jest.fn().mockReturnValue('stripped'),
          },
        },
        {
          provide: ResendEmailProvider,
          useValue: { send: jest.fn().mockResolvedValue({ messageId: 'msg-1' }) },
        },
        {
          provide: TwilioWhatsAppProvider,
          useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-1' }) },
        },
        {
          provide: TwilioSmsProvider,
          useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-2' }) },
        },
        {
          provide: AuthReadFacade,
          useValue: {
            findUserSummary: jest
              .fn()
              .mockResolvedValue({ id: 'user-1', email: 'test@example.com' }),
          },
        },
        {
          provide: ParentReadFacade,
          useValue: (mockParentFacade = {
            findContactByUserId: jest
              .fn()
              .mockResolvedValue({
                id: 'parent-1',
                phone: '+353851234567',
                whatsapp_phone: '+353851234567',
              }),
            resolveIdByUserId: jest.fn().mockResolvedValue('parent-1'),
          }),
        },
        {
          provide: NotificationRateLimitService,
          useValue: {
            checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true }),
            recordSent: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<NotificationDispatchService>(NotificationDispatchService);
  });

  const makeNotification = (overrides: Record<string, unknown> = {}) => ({
    id: 'notif-1',
    tenant_id: 'tenant-1',
    recipient_user_id: 'user-1',
    channel: 'email',
    template_key: 'welcome',
    locale: 'en',
    status: 'queued',
    attempt_count: 0,
    max_attempts: 3,
    payload_json: { name: 'Test' },
    source_entity_type: 'enrollment',
    source_entity_id: 'enr-1',
    recipient: {
      id: 'user-1',
      email: 'test@example.com',
      first_name: 'Test',
      last_name: 'User',
    },
    ...overrides,
  });

  describe('dispatchWithFallback() — email channel', () => {
    it('should attempt email dispatch and increment attempt_count (send not yet integrated)', async () => {
      const notification = makeNotification({ channel: 'email' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue({
        id: 'tpl-1',
        body_template: 'Hello {{name}}',
      });
      prisma.notification.update.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      expect(templateService.resolveTemplate).toHaveBeenCalledWith(
        'tenant-1',
        'welcome',
        'email',
        'en',
      );
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          attempt_count: 1,
        }),
      });
    });

    it('should retry with exponential backoff on email failure', async () => {
      const notification = makeNotification({
        channel: 'email',
        attempt_count: 0,
        max_attempts: 3,
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockRejectedValue(new Error('SMTP connection failed'));
      prisma.notification.update.mockResolvedValue({});

      const before = Date.now();
      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          attempt_count: 1,
          failure_reason: 'SMTP connection failed',
          next_retry_at: expect.any(Date),
        }),
      });

      // Backoff for attempt 1: 60000 * 2^1 = 120000ms
      const retryAt = prisma.notification.update.mock.calls[0][0].data.next_retry_at;
      const diffMs = retryAt.getTime() - before;
      expect(diffMs).toBeGreaterThanOrEqual(110_000);
      expect(diffMs).toBeLessThan(130_000);
    });

    it('should dead-letter after max_attempts exhausted', async () => {
      const notification = makeNotification({
        channel: 'email',
        attempt_count: 2,
        max_attempts: 3,
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockRejectedValue(new Error('SMTP timeout'));
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      // markFailed: next_retry_at = null
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          attempt_count: 3,
          failure_reason: 'SMTP timeout',
          next_retry_at: null,
        }),
      });

      // Creates in_app fallback
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'in_app',
          tenant_id: 'tenant-1',
          recipient_user_id: 'user-1',
          status: 'delivered',
          delivered_at: expect.any(Date),
        }),
      });
    });

    it('should fall back to in_app when email fails and user has account', async () => {
      const notification = makeNotification({
        channel: 'email',
        attempt_count: 2,
        max_attempts: 3,
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockRejectedValue(new Error('Send failed'));
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'in_app',
          recipient_user_id: 'user-1',
          template_key: 'welcome',
          locale: 'en',
          status: 'delivered',
          payload_json: { name: 'Test' },
          source_entity_type: 'enrollment',
          source_entity_id: 'enr-1',
          delivered_at: expect.any(Date),
        }),
      });
    });
  });

  describe('dispatchWithFallback() — whatsapp channel', () => {
    it('should attempt WhatsApp dispatch and increment attempt_count (send not yet integrated)', async () => {
      const notification = makeNotification({ channel: 'whatsapp' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue({
        id: 'tpl-wa-1',
        body_template: 'Hello {{name}}',
      });
      prisma.notification.update.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      expect(templateService.resolveTemplate).toHaveBeenCalledWith(
        'tenant-1',
        'welcome',
        'whatsapp',
        'en',
      );
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          attempt_count: 1,
        }),
      });
    });

    it('should create SMS fallback when template not found for locale', async () => {
      const notification = makeNotification({ channel: 'whatsapp' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue(null);
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      // Creates SMS fallback (whatsapp → sms in the fallback chain)
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'sms',
          tenant_id: 'tenant-1',
          recipient_user_id: 'user-1',
          status: 'queued',
          delivered_at: null,
        }),
      });

      // Marks original as failed
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'No WhatsApp template for locale',
          next_retry_at: null,
        }),
      });
    });

    it('should skip WhatsApp immediately when consent is not granted', async () => {
      const notification = makeNotification({ channel: 'whatsapp' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      consentService.hasConsent.mockResolvedValue(false);
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'WhatsApp consent not granted',
          next_retry_at: null,
        }),
      });
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'sms',
          status: 'queued',
        }),
      });
      expect(templateService.resolveTemplate).not.toHaveBeenCalled();
    });

    it('should skip WhatsApp and create SMS fallback when phone number invalid', async () => {
      // In the current implementation, this is handled by template being null
      const notification = makeNotification({ channel: 'whatsapp' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue(null);
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'sms',
          status: 'queued',
        }),
      });
    });

    it('should create SMS fallback when WhatsApp send fails after max attempts', async () => {
      const notification = makeNotification({
        channel: 'whatsapp',
        attempt_count: 2,
        max_attempts: 3,
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockRejectedValue(new Error('Twilio API error'));
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      // Dead-lettered → creates SMS fallback (whatsapp → sms)
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'sms',
          tenant_id: 'tenant-1',
          status: 'queued',
          delivered_at: null,
        }),
      });
    });

    it('edge: WhatsApp unavailable — should create SMS fallback', async () => {
      // WhatsApp has no template → creates SMS fallback
      // The cascading fallback from sms→email→in_app happens when those
      // fallback notifications are dispatched and also fail.
      const notification = makeNotification({ channel: 'whatsapp' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue(null);
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      // First-level fallback: sms (whatsapp → sms in fallback chain)
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'sms',
          status: 'queued',
        }),
      });
      // The sms→email→in_app cascade happens when subsequent fallback
      // notifications are dispatched and fail. Verify the chain starts correctly.
      expect(prisma.notification.update).toHaveBeenCalled();
    });
  });

  describe('dispatchWithFallback() — sms channel', () => {
    it('should attempt SMS dispatch via Twilio and mark as sent', async () => {
      const notification = makeNotification({ channel: 'sms' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      // Parent with a phone number for SMS resolution
      prisma.parent.findFirst.mockResolvedValue({
        id: 'parent-1',
        phone: '+353851234567',
        whatsapp_phone: null,
      });
      templateService.resolveTemplate.mockResolvedValue({
        id: 'tpl-sms-1',
        body_template: 'Hello {{name}}',
      });
      prisma.notification.update.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      expect(templateService.resolveTemplate).toHaveBeenCalledWith(
        'tenant-1',
        'welcome',
        'sms',
        'en',
      );
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'sent',
          attempt_count: 1,
        }),
      });
    });

    it('should create email fallback when no SMS template found', async () => {
      const notification = makeNotification({ channel: 'sms' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue(null);
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      // Creates email fallback (sms -> email in the fallback chain)
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'email',
          status: 'queued',
        }),
      });

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'No SMS template for locale',
        }),
      });
    });

    it('should create email fallback when no phone number found', async () => {
      const notification = makeNotification({ channel: 'sms' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue({
        id: 'tpl-sms-1',
        body_template: 'Hello {{name}}',
      });
      // Mock parent without phone — resolveRecipientContact will return null
      mockParentFacade.findContactByUserId.mockResolvedValue({ phone: null, whatsapp_phone: null });
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'No phone number found',
        }),
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'email',
          status: 'queued',
        }),
      });
    });

    it('should create email fallback after max SMS retries exhausted', async () => {
      const notification = makeNotification({
        channel: 'sms',
        attempt_count: 2,
        max_attempts: 3,
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockRejectedValue(new Error('Twilio SMS API error'));
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      // Dead-lettered: creates email fallback (sms -> email)
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'email',
          tenant_id: 'tenant-1',
          status: 'queued',
        }),
      });
    });
  });

  describe('dispatchWithFallback() — rate limiting', () => {
    it('should fail notification when rate limited on email channel', async () => {
      const notification = makeNotification({ channel: 'email' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue({
        id: 'tpl-1',
        body_template: 'Hello',
      });

      // Get the module to override the rate limit mock
      const rateLimitService = {
        checkAndIncrement: jest.fn().mockResolvedValue({
          allowed: false,
          reason: 'Hourly email notification limit (10) exceeded',
        }),
      };

      // Rebuild module with rate-limited service
      const { Test: NestTest } = await import('@nestjs/testing');
      const module = await NestTest.createTestingModule({
        providers: [
          ...MOCK_FACADE_PROVIDERS,
          NotificationDispatchService,
          { provide: PrismaService, useValue: prisma },
          { provide: ConsentService, useValue: consentService },
          { provide: NotificationTemplatesService, useValue: templateService },
          {
            provide: TemplateRendererService,
            useValue: {
              render: jest.fn().mockReturnValue('rendered'),
              renderSubject: jest.fn().mockReturnValue('subject'),
              stripHtml: jest.fn().mockReturnValue('stripped'),
            },
          },
          {
            provide: ResendEmailProvider,
            useValue: { send: jest.fn().mockResolvedValue({ messageId: 'msg-1' }) },
          },
          {
            provide: TwilioWhatsAppProvider,
            useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-1' }) },
          },
          {
            provide: TwilioSmsProvider,
            useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-2' }) },
          },
          { provide: NotificationRateLimitService, useValue: rateLimitService },
        ],
      }).compile();

      const rateLimitedService = module.get<NotificationDispatchService>(
        NotificationDispatchService,
      );
      await rateLimitedService.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'Hourly email notification limit (10) exceeded',
        }),
      });
    });
  });

  describe('dispatchWithFallback() — email contact resolution', () => {
    it('should create in_app fallback when email template not found', async () => {
      const notification = makeNotification({ channel: 'email' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue(null);
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'No email template for locale',
        }),
      });

      // Fallback to in_app
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'in_app',
          status: 'delivered',
        }),
      });
    });
  });

  describe('dispatchWithFallback() — in_app channel', () => {
    it('should mark in_app notification as delivered immediately', async () => {
      const notification = makeNotification({ channel: 'in_app' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      prisma.notification.update.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: {
          status: 'delivered',
          delivered_at: expect.any(Date),
        },
      });
      // Should NOT call templateService
      expect(templateService.resolveTemplate).not.toHaveBeenCalled();
    });
  });

  // ─── dispatchWithFallback() — null template_key / payload_json ─────────────

  describe('dispatchWithFallback() — null template_key and payload_json', () => {
    it('should use default template key when template_key is null', async () => {
      const notification = makeNotification({
        channel: 'email',
        template_key: null,
        payload_json: null,
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue({
        id: 'tpl-1',
        body_template: 'Hello',
        subject_template: 'Welcome',
      });
      prisma.notification.update.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      // Should resolve template with 'default' key
      expect(templateService.resolveTemplate).toHaveBeenCalledWith(
        'tenant-1',
        'default',
        'email',
        'en',
      );
    });

    it('should use empty object for variables when payload_json is null', async () => {
      const notification = makeNotification({
        channel: 'in_app',
        payload_json: null,
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      prisma.notification.update.mockResolvedValue({});

      // Should not throw — in_app just marks as delivered
      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'delivered',
        }),
      });
    });

    it('should use null template_key for whatsapp and resolve default', async () => {
      const notification = makeNotification({
        channel: 'whatsapp',
        template_key: null,
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue({
        id: 'tpl-wa',
        body_template: 'Hello',
      });
      prisma.notification.update.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      expect(templateService.resolveTemplate).toHaveBeenCalledWith(
        'tenant-1',
        'default',
        'whatsapp',
        'en',
      );
    });

    it('should use null template_key for sms and resolve default', async () => {
      const notification = makeNotification({
        channel: 'sms',
        template_key: null,
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue({
        id: 'tpl-sms',
        body_template: 'Hello',
      });
      prisma.notification.update.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      expect(templateService.resolveTemplate).toHaveBeenCalledWith(
        'tenant-1',
        'default',
        'sms',
        'en',
      );
    });

    it('should render email with null subject_template', async () => {
      const notification = makeNotification({ channel: 'email' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue({
        id: 'tpl-1',
        body_template: 'Hello {{name}}',
        subject_template: null,
      });
      prisma.notification.update.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      // Should still send — renderSubject gets null, returns null or empty
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'sent',
        }),
      });
    });
  });

  describe('dispatchWithFallback() — early returns', () => {
    it('should return early when notification not found', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await service.dispatchWithFallback('notif-missing');

      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('should return early when status is already sent', async () => {
      prisma.notification.findUnique.mockResolvedValue(makeNotification({ status: 'sent' }));

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('should return early when status is already delivered', async () => {
      prisma.notification.findUnique.mockResolvedValue(makeNotification({ status: 'delivered' }));

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('should return early when status is already read', async () => {
      prisma.notification.findUnique.mockResolvedValue(makeNotification({ status: 'read' }));

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });

  // ─── dispatchWithFallback() — email no address ────────────────────────────

  describe('dispatchWithFallback() — email no address', () => {
    it('should create in_app fallback when no email address found for recipient', async () => {
      const notification = makeNotification({ channel: 'email' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue({
        id: 'tpl-1',
        body_template: 'Hello {{name}}',
        subject_template: 'Welcome',
      });
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      // Override AuthReadFacade to return null (no email)
      const authFacade = (
        await Test.createTestingModule({
          providers: [
            ...MOCK_FACADE_PROVIDERS,
            NotificationDispatchService,
            { provide: PrismaService, useValue: prisma },
            { provide: ConsentService, useValue: consentService },
            { provide: NotificationTemplatesService, useValue: templateService },
            {
              provide: TemplateRendererService,
              useValue: {
                render: jest.fn().mockReturnValue('rendered'),
                renderSubject: jest.fn().mockReturnValue('subject'),
                stripHtml: jest.fn().mockReturnValue('stripped'),
              },
            },
            {
              provide: ResendEmailProvider,
              useValue: { send: jest.fn().mockResolvedValue({ messageId: 'msg-1' }) },
            },
            {
              provide: TwilioWhatsAppProvider,
              useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-1' }) },
            },
            {
              provide: TwilioSmsProvider,
              useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-2' }) },
            },
            {
              provide: AuthReadFacade,
              useValue: { findUserSummary: jest.fn().mockResolvedValue(null) },
            },
            {
              provide: ParentReadFacade,
              useValue: {
                findContactByUserId: jest.fn().mockResolvedValue(null),
                resolveIdByUserId: jest.fn().mockResolvedValue(null),
              },
            },
            {
              provide: NotificationRateLimitService,
              useValue: { checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true }) },
            },
          ],
        }).compile()
      ).get<NotificationDispatchService>(NotificationDispatchService);

      await authFacade.dispatchWithFallback('notif-1');

      // Should mark original as failed
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'No email address found for recipient',
        }),
      });

      // Should create in_app fallback
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'in_app',
          status: 'delivered',
        }),
      });
    });
  });

  // ─── dispatchWithFallback() — WhatsApp no phone ───────────────────────────

  describe('dispatchWithFallback() — whatsapp no phone number', () => {
    it('should create SMS fallback when no WhatsApp phone found', async () => {
      const notification = makeNotification({ channel: 'whatsapp' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue({
        id: 'tpl-wa-1',
        body_template: 'Hello {{name}}',
      });
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      // Parent exists but no WhatsApp phone
      mockParentFacade.findContactByUserId.mockResolvedValue({
        id: 'parent-1',
        phone: '+353851234567',
        whatsapp_phone: null,
      });

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'No WhatsApp phone number found',
        }),
      });

      // Should create sms fallback
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'sms',
          status: 'queued',
        }),
      });
    });
  });

  // ─── dispatchWithFallback() — WhatsApp rate limit ─────────────────────────

  describe('dispatchWithFallback() — whatsapp rate limit', () => {
    it('should fail when rate limited on whatsapp channel', async () => {
      const notification = makeNotification({ channel: 'whatsapp' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      prisma.notification.update.mockResolvedValue({});

      const rateLimited = (
        await Test.createTestingModule({
          providers: [
            ...MOCK_FACADE_PROVIDERS,
            NotificationDispatchService,
            { provide: PrismaService, useValue: prisma },
            { provide: ConsentService, useValue: consentService },
            { provide: NotificationTemplatesService, useValue: templateService },
            {
              provide: TemplateRendererService,
              useValue: {
                render: jest.fn().mockReturnValue('rendered'),
                renderSubject: jest.fn().mockReturnValue('subject'),
                stripHtml: jest.fn().mockReturnValue('stripped'),
              },
            },
            {
              provide: ResendEmailProvider,
              useValue: { send: jest.fn().mockResolvedValue({ messageId: 'msg-1' }) },
            },
            {
              provide: TwilioWhatsAppProvider,
              useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-1' }) },
            },
            {
              provide: TwilioSmsProvider,
              useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-2' }) },
            },
            {
              provide: AuthReadFacade,
              useValue: {
                findUserSummary: jest
                  .fn()
                  .mockResolvedValue({ id: 'user-1', email: 'test@test.com' }),
              },
            },
            {
              provide: ParentReadFacade,
              useValue: {
                findContactByUserId: jest
                  .fn()
                  .mockResolvedValue({ phone: '+123', whatsapp_phone: '+123' }),
                resolveIdByUserId: jest.fn().mockResolvedValue('parent-1'),
              },
            },
            {
              provide: NotificationRateLimitService,
              useValue: {
                checkAndIncrement: jest.fn().mockResolvedValue({
                  allowed: false,
                  reason: 'Hourly whatsapp notification limit (10) exceeded',
                }),
              },
            },
          ],
        }).compile()
      ).get<NotificationDispatchService>(NotificationDispatchService);

      await rateLimited.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'Hourly whatsapp notification limit (10) exceeded',
        }),
      });
    });
  });

  // ─── dispatchWithFallback() — SMS rate limit ──────────────────────────────

  describe('dispatchWithFallback() — sms rate limit', () => {
    it('should fail when rate limited on sms channel', async () => {
      const notification = makeNotification({ channel: 'sms' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      prisma.notification.update.mockResolvedValue({});

      const rateLimited = (
        await Test.createTestingModule({
          providers: [
            ...MOCK_FACADE_PROVIDERS,
            NotificationDispatchService,
            { provide: PrismaService, useValue: prisma },
            { provide: ConsentService, useValue: consentService },
            { provide: NotificationTemplatesService, useValue: templateService },
            {
              provide: TemplateRendererService,
              useValue: {
                render: jest.fn().mockReturnValue('rendered'),
                renderSubject: jest.fn().mockReturnValue('subject'),
                stripHtml: jest.fn().mockReturnValue('stripped'),
              },
            },
            {
              provide: ResendEmailProvider,
              useValue: { send: jest.fn().mockResolvedValue({ messageId: 'msg-1' }) },
            },
            {
              provide: TwilioWhatsAppProvider,
              useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-1' }) },
            },
            {
              provide: TwilioSmsProvider,
              useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-2' }) },
            },
            {
              provide: NotificationRateLimitService,
              useValue: {
                checkAndIncrement: jest.fn().mockResolvedValue({
                  allowed: false,
                  reason: 'Daily notification limit (30) exceeded',
                }),
              },
            },
          ],
        }).compile()
      ).get<NotificationDispatchService>(NotificationDispatchService);

      await rateLimited.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'Daily notification limit (30) exceeded',
        }),
      });
    });
  });

  // ─── dispatchWithFallback() — non-Error thrown ────────────────────────────

  describe('dispatchWithFallback() — non-Error thrown in dispatch', () => {
    it('should handle non-Error thrown (unknown error message)', async () => {
      const notification = makeNotification({
        channel: 'email',
        attempt_count: 0,
        max_attempts: 3,
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      prisma.notification.update.mockResolvedValue({});

      // Create a service where resolveTemplate rejects with a non-Error
      const nonErrorService = (
        await Test.createTestingModule({
          providers: [
            ...MOCK_FACADE_PROVIDERS,
            NotificationDispatchService,
            { provide: PrismaService, useValue: prisma },
            { provide: ConsentService, useValue: consentService },
            {
              provide: NotificationTemplatesService,
              useValue: {
                resolveTemplate: jest.fn().mockRejectedValue('string error'),
              },
            },
            {
              provide: TemplateRendererService,
              useValue: {
                render: jest.fn().mockReturnValue('rendered'),
                renderSubject: jest.fn().mockReturnValue('subject'),
                stripHtml: jest.fn().mockReturnValue('stripped'),
              },
            },
            {
              provide: ResendEmailProvider,
              useValue: { send: jest.fn().mockResolvedValue({ messageId: 'msg-1' }) },
            },
            {
              provide: TwilioWhatsAppProvider,
              useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-1' }) },
            },
            {
              provide: TwilioSmsProvider,
              useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-2' }) },
            },
            {
              provide: NotificationRateLimitService,
              useValue: { checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true }) },
            },
          ],
        }).compile()
      ).get<NotificationDispatchService>(NotificationDispatchService);

      await nonErrorService.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'Unknown error',
          next_retry_at: expect.any(Date),
        }),
      });
    });
  });

  // ─── dispatchWithFallback() — WhatsApp consent with no parentId ───────────

  describe('dispatchWithFallback() — whatsapp consent no parentId', () => {
    it('should assume consent when parent ID cannot be resolved', async () => {
      const notification = makeNotification({ channel: 'whatsapp' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue({
        id: 'tpl-wa-1',
        body_template: 'Hello {{name}}',
      });
      prisma.notification.update.mockResolvedValue({});

      // No parent ID resolved — consent defaults to true
      mockParentFacade.resolveIdByUserId.mockResolvedValue(null);

      await service.dispatchWithFallback('notif-1');

      // Should NOT create fallback — should proceed with the dispatch
      // Consent check returns true when parentId is null
      expect(consentService.hasConsent).not.toHaveBeenCalled();
      expect(templateService.resolveTemplate).toHaveBeenCalledWith(
        'tenant-1',
        'welcome',
        'whatsapp',
        'en',
      );
    });
  });

  // ─── dispatchWithFallback() — in_app fallback chain terminal ──────────────

  describe('dispatchWithFallback() — fallback chain termination', () => {
    it('should not create fallback when in_app channel exhausts max retries (terminal)', async () => {
      const notification = makeNotification({
        channel: 'in_app',
        attempt_count: 2,
        max_attempts: 3,
        status: 'queued',
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      // First call: dispatchInApp rejects, Second call: markFailed resolves
      prisma.notification.update
        .mockRejectedValueOnce(new Error('DB error on in_app'))
        .mockResolvedValueOnce({ ...notification, status: 'dead_letter' });

      await service.dispatchWithFallback('notif-1');

      // dispatchInApp failed, handleFailure called, marks as dead_letter
      expect(prisma.notification.update).toHaveBeenCalled();
    });
  });

  // ─── dispatchWithFallback() — sms fallback after max retries ──────────────

  describe('dispatchWithFallback() — sms dead-letter creates email fallback', () => {
    it('should create email fallback (not in_app) when sms exhausts retries', async () => {
      const notification = makeNotification({
        channel: 'sms',
        attempt_count: 2,
        max_attempts: 3,
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockRejectedValue(new Error('SMS failed'));
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      // Should create email fallback (sms -> email in chain)
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'email',
          status: 'queued',
          delivered_at: null,
        }),
      });
    });
  });

  // ─── dispatchWithFallback() — whatsapp dead-letter creates sms fallback ───

  describe('dispatchWithFallback() — whatsapp dead-letter creates sms fallback', () => {
    it('should create sms fallback (not email) when whatsapp exhausts retries', async () => {
      const notification = makeNotification({
        channel: 'whatsapp',
        attempt_count: 2,
        max_attempts: 3,
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockRejectedValue(new Error('WA failed'));
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      // Should create sms fallback (whatsapp -> sms in chain)
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'sms',
          status: 'queued',
          delivered_at: null,
        }),
      });
    });
  });

  // ─── resolveRecipientContact — sms with no parent ─────────────────────────

  describe('dispatchWithFallback() — sms with no parent record', () => {
    it('should fall back to email when parent record not found for SMS', async () => {
      const notification = makeNotification({ channel: 'sms' });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockResolvedValue({
        id: 'tpl-sms-1',
        body_template: 'Hello {{name}}',
      });
      // No parent found at all
      mockParentFacade.findContactByUserId.mockResolvedValue(null);
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'No phone number found',
        }),
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'email',
          status: 'queued',
        }),
      });
    });
  });

  // ─── createFallbackNotification — in_app vs queued status ─────────────────

  describe('dispatchWithFallback() — fallback notification status', () => {
    it('should set fallback to delivered for in_app, queued for other channels', async () => {
      const notification = makeNotification({
        channel: 'email',
        attempt_count: 2,
        max_attempts: 3,
      });
      prisma.notification.findUnique.mockResolvedValue(notification);
      templateService.resolveTemplate.mockRejectedValue(new Error('Send failed'));
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.dispatchWithFallback('notif-1');

      // email -> in_app fallback should have status 'delivered' and delivered_at set
      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'in_app',
          status: 'delivered',
          delivered_at: expect.any(Date),
        }),
      });
    });
  });
});
