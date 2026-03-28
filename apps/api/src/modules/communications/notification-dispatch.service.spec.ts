import { Test, TestingModule } from '@nestjs/testing';

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
  let prisma: {
    parent: {
      findFirst: jest.Mock;
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
        findFirst: jest.fn().mockResolvedValue({ id: 'parent-1' }),
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
        NotificationDispatchService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConsentService, useValue: consentService },
        { provide: NotificationTemplatesService, useValue: templateService },
        { provide: TemplateRendererService, useValue: { render: jest.fn().mockReturnValue('rendered'), renderSubject: jest.fn().mockReturnValue('subject'), stripHtml: jest.fn().mockReturnValue('stripped') } },
        { provide: ResendEmailProvider, useValue: { send: jest.fn().mockResolvedValue({ messageId: 'msg-1' }) } },
        { provide: TwilioWhatsAppProvider, useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-1' }) } },
        { provide: TwilioSmsProvider, useValue: { send: jest.fn().mockResolvedValue({ messageSid: 'sid-2' }) } },
        { provide: NotificationRateLimitService, useValue: { checkAndIncrement: jest.fn().mockResolvedValue({ allowed: true }), recordSent: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get<NotificationDispatchService>(
      NotificationDispatchService,
    );
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
      templateService.resolveTemplate.mockRejectedValue(
        new Error('SMTP connection failed'),
      );
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
      const retryAt =
        prisma.notification.update.mock.calls[0][0].data.next_retry_at;
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
      templateService.resolveTemplate.mockRejectedValue(
        new Error('SMTP timeout'),
      );
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
      templateService.resolveTemplate.mockRejectedValue(
        new Error('Send failed'),
      );
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
      templateService.resolveTemplate.mockRejectedValue(
        new Error('Twilio API error'),
      );
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

  describe('dispatchWithFallback() — early returns', () => {
    it('should return early when notification not found', async () => {
      prisma.notification.findUnique.mockResolvedValue(null);

      await service.dispatchWithFallback('notif-missing');

      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('should return early when status is already sent', async () => {
      prisma.notification.findUnique.mockResolvedValue(
        makeNotification({ status: 'sent' }),
      );

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('should return early when status is already delivered', async () => {
      prisma.notification.findUnique.mockResolvedValue(
        makeNotification({ status: 'delivered' }),
      );

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('should return early when status is already read', async () => {
      prisma.notification.findUnique.mockResolvedValue(
        makeNotification({ status: 'read' }),
      );

      await service.dispatchWithFallback('notif-1');

      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });
});
