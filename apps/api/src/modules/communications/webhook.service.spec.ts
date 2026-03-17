import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { WebhookService } from './webhook.service';

describe('WebhookService', () => {
  let service: WebhookService;
  let prisma: {
    notification: {
      findFirst: jest.Mock;
      update: jest.Mock;
      create: jest.Mock;
    };
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma = {
      notification: {
        findFirst: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  const makeNotification = (overrides: Record<string, unknown> = {}) => ({
    id: 'notif-1',
    tenant_id: 'tenant-1',
    recipient_user_id: 'user-1',
    channel: 'email',
    template_key: 'welcome',
    locale: 'en',
    status: 'sent',
    payload_json: { name: 'Test' },
    source_entity_type: 'enrollment',
    source_entity_id: 'enr-1',
    provider_message_id: 'msg-123',
    ...overrides,
  });

  describe('handleResendEvent()', () => {
    it('should update notification status to delivered on delivery event', async () => {
      const notification = makeNotification();
      prisma.notification.findFirst.mockResolvedValue(notification);
      prisma.notification.update.mockResolvedValue({});

      await service.handleResendEvent({
        type: 'email.delivered',
        data: { message_id: 'msg-123' },
      });

      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { provider_message_id: 'msg-123' },
      });
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: {
          status: 'delivered',
          delivered_at: expect.any(Date),
        },
      });
    });

    it('should update notification status to failed on bounce', async () => {
      const notification = makeNotification();
      prisma.notification.findFirst.mockResolvedValue(notification);
      prisma.notification.update.mockResolvedValue({});

      await service.handleResendEvent({
        type: 'email.bounced',
        data: { message_id: 'msg-123' },
      });

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: {
          status: 'failed',
          failure_reason: 'Email bounced',
        },
      });
    });

    it('should handle complaint event by marking failed', async () => {
      const notification = makeNotification();
      prisma.notification.findFirst.mockResolvedValue(notification);
      prisma.notification.update.mockResolvedValue({});

      await service.handleResendEvent({
        type: 'email.complained',
        data: { message_id: 'msg-123' },
      });

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: {
          status: 'failed',
          failure_reason: 'Spam complaint',
        },
      });
    });

    it('edge: should handle unknown provider_message_id gracefully', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await service.handleResendEvent({
        type: 'email.delivered',
        data: { message_id: 'unknown-msg' },
      });

      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { provider_message_id: 'unknown-msg' },
      });
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('edge: should handle missing message_id gracefully', async () => {
      await service.handleResendEvent({
        type: 'email.delivered',
        data: {},
      });

      expect(prisma.notification.findFirst).not.toHaveBeenCalled();
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });

  describe('handleTwilioEvent()', () => {
    it('should update notification status to delivered', async () => {
      const notification = makeNotification({
        channel: 'whatsapp',
        provider_message_id: 'SM123',
      });
      prisma.notification.findFirst.mockResolvedValue(notification);
      prisma.notification.update.mockResolvedValue({});

      await service.handleTwilioEvent({
        MessageSid: 'SM123',
        MessageStatus: 'delivered',
      });

      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { provider_message_id: 'SM123' },
      });
      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: {
          status: 'delivered',
          delivered_at: expect.any(Date),
        },
      });
    });

    it('should update status to failed and create email fallback on failure', async () => {
      const notification = makeNotification({
        channel: 'whatsapp',
        provider_message_id: 'SM123',
      });
      prisma.notification.findFirst.mockResolvedValue(notification);
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.handleTwilioEvent({
        MessageSid: 'SM123',
        MessageStatus: 'failed',
      });

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: {
          status: 'failed',
          failure_reason: 'Twilio status: failed',
        },
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'email',
          status: 'queued',
          tenant_id: 'tenant-1',
          recipient_user_id: 'user-1',
          template_key: 'welcome',
          locale: 'en',
        }),
      });
    });

    it('should update status to failed on undelivered', async () => {
      const notification = makeNotification({
        channel: 'whatsapp',
        provider_message_id: 'SM123',
      });
      prisma.notification.findFirst.mockResolvedValue(notification);
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.handleTwilioEvent({
        MessageSid: 'SM123',
        MessageStatus: 'undelivered',
      });

      expect(prisma.notification.update).toHaveBeenCalledWith({
        where: { id: 'notif-1' },
        data: {
          status: 'failed',
          failure_reason: 'Twilio status: undelivered',
        },
      });

      // Also creates email fallback for undelivered
      expect(prisma.notification.create).toHaveBeenCalled();
    });

    it('edge: fallback email notification has correct tenant_id', async () => {
      const notification = makeNotification({
        tenant_id: 'tenant-specific-42',
        channel: 'whatsapp',
        provider_message_id: 'SM456',
        recipient_user_id: 'user-42',
        template_key: 'alert',
        locale: 'ar',
        payload_json: { key: 'value' },
        source_entity_type: 'announcement',
        source_entity_id: 'ann-99',
      });
      prisma.notification.findFirst.mockResolvedValue(notification);
      prisma.notification.update.mockResolvedValue({});
      prisma.notification.create.mockResolvedValue({});

      await service.handleTwilioEvent({
        MessageSid: 'SM456',
        MessageStatus: 'failed',
      });

      expect(prisma.notification.create).toHaveBeenCalledWith({
        data: {
          tenant_id: 'tenant-specific-42',
          recipient_user_id: 'user-42',
          channel: 'email',
          template_key: 'alert',
          locale: 'ar',
          status: 'queued',
          payload_json: { key: 'value' },
          source_entity_type: 'announcement',
          source_entity_id: 'ann-99',
        },
      });
    });

    it('edge: should handle missing MessageSid gracefully', async () => {
      await service.handleTwilioEvent({
        MessageStatus: 'delivered',
      });

      expect(prisma.notification.findFirst).not.toHaveBeenCalled();
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });

    it('edge: should handle unknown MessageSid gracefully', async () => {
      prisma.notification.findFirst.mockResolvedValue(null);

      await service.handleTwilioEvent({
        MessageSid: 'SM-unknown',
        MessageStatus: 'delivered',
      });

      expect(prisma.notification.findFirst).toHaveBeenCalledWith({
        where: { provider_message_id: 'SM-unknown' },
      });
      expect(prisma.notification.update).not.toHaveBeenCalled();
    });
  });
});
