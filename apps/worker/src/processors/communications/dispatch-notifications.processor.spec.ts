import type { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';

import {
  DISPATCH_NOTIFICATIONS_JOB,
  DispatchNotificationsProcessor,
} from './dispatch-notifications.processor';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const NOTIF_ID_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NOTIF_ID_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NOTIF_ID_3 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ANNOUNCEMENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const TEMPLATE_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── Mock Prisma ──────────────────────────────────────────────────────────────

function buildMockTx() {
  return {
    notification: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({ id: 'new-notif' }),
    },
    notificationTemplate: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue(null),
    },
    parent: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

type MockTx = ReturnType<typeof buildMockTx>;

function buildMockPrisma(mockTx: MockTx) {
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    // Phase 2 uses flat prisma calls (outside tx)
    notification: mockTx.notification,
    notificationTemplate: mockTx.notificationTemplate,
    user: mockTx.user,
    parent: mockTx.parent,
  };
}

function buildMockConfigService(overrides: Record<string, string> = {}): ConfigService {
  const configMap: Record<string, string> = {
    RESEND_API_KEY: 'test-resend-key',
    RESEND_FROM_EMAIL: 'test@edupod.app',
    TWILIO_ACCOUNT_SID: 'test-sid',
    TWILIO_AUTH_TOKEN: 'test-token',
    TWILIO_SMS_FROM: '+15551234567',
    TWILIO_WHATSAPP_FROM: 'whatsapp:+15551234567',
    ...overrides,
  };

  return {
    get: jest.fn((key: string) => configMap[key]),
  } as unknown as ConfigService;
}

function buildMockJob(name: string, data: Record<string, unknown> = {}): Job {
  return { id: 'test-job-id', name, data } as unknown as Job;
}

function buildNotification(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTIF_ID_1,
    tenant_id: TENANT_ID,
    recipient_user_id: USER_ID,
    channel: 'in_app',
    template_key: 'test_template',
    locale: 'en',
    status: 'queued',
    payload_json: { student_name: 'Ahmed' },
    source_entity_type: null,
    source_entity_id: null,
    attempt_count: 0,
    max_attempts: 3,
    ...overrides,
  };
}

// ─── Mock Providers ───────────────────────────────────────────────────────────

function buildMockResend(overrides: { error?: boolean; messageId?: string } = {}) {
  return {
    emails: {
      send: jest.fn().mockResolvedValue({
        data: overrides.error ? null : { id: overrides.messageId || 'msg-123' },
        error: overrides.error ? { message: 'provider error' } : null,
      }),
    },
  };
}

function buildMockTwilio(overrides: { error?: boolean; messageSid?: string } = {}) {
  return {
    messages: {
      create: jest.fn().mockResolvedValue({
        sid: overrides.error ? undefined : overrides.messageSid || 'SM123',
      }),
    },
  };
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('DispatchNotificationsProcessor', () => {
  let processor: DispatchNotificationsProcessor;
  let mockTx: MockTx;

  beforeEach(() => {
    mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    const mockConfigService = buildMockConfigService();
    processor = new DispatchNotificationsProcessor(mockPrisma as never, mockConfigService);
  });

  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════════
  // JOB ROUTING
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('process — job routing', () => {
    it('should skip jobs with a different name', async () => {
      const job = buildMockJob('some-other-job', { tenant_id: TENANT_ID });
      await processor.process(job);

      expect(mockTx.notification.findMany).not.toHaveBeenCalled();
    });

    it('should reject jobs without tenant_id', async () => {
      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        notification_ids: [NOTIF_ID_1],
      });

      await expect(processor.process(job)).rejects.toThrow(
        'Job rejected: missing tenant_id in payload.',
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // IN-APP CHANNEL
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('process — in_app channel', () => {
    it('should mark in_app notifications as delivered', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'in_app',
        status: 'queued',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockTx.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIF_ID_1 },
        data: {
          status: 'delivered',
          delivered_at: expect.any(Date),
          attempt_count: 1,
        },
      });
    });

    it('should increment attempt count on in_app delivery', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'in_app',
        attempt_count: 2,
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockTx.notification.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attempt_count: 3,
          }),
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // EMAIL CHANNEL
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('process — email channel', () => {
    it('should successfully send email via Resend', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'email',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: '<p>Hello {{student_name}}</p>',
        subject_template: 'Welcome {{student_name}}',
      });
      mockTx.user.findUnique.mockResolvedValue({ email: 'parent@example.com' });

      const mockResend = buildMockResend({ messageId: 'email-msg-123' });
      (processor as unknown as { getResendClient: jest.Mock }).getResendClient = jest
        .fn()
        .mockReturnValue(mockResend);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockResend.emails.send).toHaveBeenCalledWith({
        from: 'test@edupod.app',
        to: ['parent@example.com'],
        subject: 'Welcome Ahmed',
        html: '<p>Hello Ahmed</p>',
        tags: [
          { name: 'notification_id', value: NOTIF_ID_1 },
          { name: 'template_key', value: 'test_template' },
        ],
      });

      expect(mockTx.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIF_ID_1 },
        data: {
          status: 'sent',
          provider_message_id: 'email-msg-123',
          sent_at: expect.any(Date),
          attempt_count: 1,
        },
      });
    });

    it('should create in_app fallback when email template is missing', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'email',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockTx.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIF_ID_1 },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: expect.stringContaining('template'),
        }),
      });

      expect(mockTx.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          recipient_user_id: USER_ID,
          channel: 'in_app',
          status: 'delivered',
        }),
      });
    });

    it('should create in_app fallback when recipient email is missing', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'email',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: '<p>Hello</p>',
        subject_template: 'Subject',
      });
      mockTx.user.findUnique.mockResolvedValue(null);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockTx.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIF_ID_1 },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'No email address found for recipient',
        }),
      });

      expect(mockTx.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'in_app',
          status: 'delivered',
        }),
      });
    });

    it('should use default subject when template subject is null', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'email',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: '<p>Hello</p>',
        subject_template: null,
      });
      mockTx.user.findUnique.mockResolvedValue({ email: 'test@test.com' });

      const mockResend = buildMockResend();
      (processor as unknown as { getResendClient: jest.Mock }).getResendClient = jest
        .fn()
        .mockReturnValue(mockResend);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          subject: 'Notification',
        }),
      );
    });

    it('should fall back to platform-level template when tenant-level not found', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'email',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        body_template: '<p>Platform template</p>',
        subject_template: 'Platform Subject',
      });
      mockTx.user.findUnique.mockResolvedValue({ email: 'test@test.com' });

      const mockResend = buildMockResend();
      (processor as unknown as { getResendClient: jest.Mock }).getResendClient = jest
        .fn()
        .mockReturnValue(mockResend);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockTx.notificationTemplate.findFirst).toHaveBeenNthCalledWith(1, {
        where: expect.objectContaining({ tenant_id: TENANT_ID }),
        select: expect.any(Object),
      });

      expect(mockTx.notificationTemplate.findFirst).toHaveBeenNthCalledWith(2, {
        where: expect.objectContaining({ tenant_id: null }),
        select: expect.any(Object),
      });

      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<p>Platform template</p>',
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // ANNOUNCEMENT ID RESOLUTION
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('process — announcement resolution', () => {
    it('should resolve notifications from announcement_id', async () => {
      mockTx.notification.findMany
        .mockResolvedValueOnce([{ id: NOTIF_ID_2 }])
        .mockResolvedValueOnce([buildNotification({ id: NOTIF_ID_2, channel: 'email' })]);

      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: '<p>Hello</p>',
        subject_template: 'Subject',
      });
      mockTx.user.findUnique.mockResolvedValue({ email: 'test@test.com' });

      const mockResend = buildMockResend();
      (processor as unknown as { getResendClient: jest.Mock }).getResendClient = jest
        .fn()
        .mockReturnValue(mockResend);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        announcement_id: ANNOUNCEMENT_ID,
      });

      await processor.process(job);

      expect(mockTx.notification.findMany).toHaveBeenNthCalledWith(1, {
        where: expect.objectContaining({
          tenant_id: TENANT_ID,
          source_entity_type: 'announcement',
          source_entity_id: ANNOUNCEMENT_ID,
          channel: { not: 'in_app' },
          status: { in: ['queued', 'failed'] },
        }),
        select: { id: true },
      });

      expect(mockTx.notification.findMany).toHaveBeenNthCalledWith(2, {
        where: expect.objectContaining({
          id: { in: [NOTIF_ID_2] },
          tenant_id: TENANT_ID,
          status: { in: ['queued', 'failed'] },
        }),
      });
    });

    it('should handle empty announcement resolution', async () => {
      mockTx.notification.findMany.mockResolvedValueOnce([]);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        announcement_id: ANNOUNCEMENT_ID,
      });

      await processor.process(job);

      // No notifications found, should early return
      expect(mockTx.notification.update).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // TEMPLATE RENDERING & HANDLEBARS HELPERS
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('process — template rendering', () => {
    it('should render template with Handlebars variables', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'email',
        payload_json: {
          student_name: 'Ahmed',
          school_name: 'Test School',
          date: '2026-04-01',
        },
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: '<p>Hello {{student_name}} from {{school_name}}</p>',
        subject_template: 'Welcome to {{school_name}}',
      });
      mockTx.user.findUnique.mockResolvedValue({ email: 'test@example.com' });

      const mockResend = buildMockResend();
      (processor as unknown as { getResendClient: jest.Mock }).getResendClient = jest
        .fn()
        .mockReturnValue(mockResend);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<p>Hello Ahmed from Test School</p>',
          subject: 'Welcome to Test School',
        }),
      );
    });

    it('should handle null template key gracefully', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'email',
        template_key: null,
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: '<p>Default message</p>',
        subject_template: 'Default Subject',
      });
      mockTx.user.findUnique.mockResolvedValue({ email: 'test@example.com' });

      const mockResend = buildMockResend();
      (processor as unknown as { getResendClient: jest.Mock }).getResendClient = jest
        .fn()
        .mockReturnValue(mockResend);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      // Should query with 'default' as fallback
      expect(mockTx.notificationTemplate.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            template_key: 'default',
          }),
        }),
      );
    });

    it('should handle empty payload_json', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'email',
        payload_json: null,
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: '<p>Hello {{student_name}}</p>',
        subject_template: 'Subject',
      });
      mockTx.user.findUnique.mockResolvedValue({ email: 'test@example.com' });

      const mockResend = buildMockResend();
      (processor as unknown as { getResendClient: jest.Mock }).getResendClient = jest
        .fn()
        .mockReturnValue(mockResend);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      // Should render with empty context (template keeps placeholders)
      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          html: '<p>Hello </p>',
        }),
      );
    });

    it('should use default from address when RESEND_FROM_EMAIL not set', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'email',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: '<p>Hello</p>',
        subject_template: 'Subject',
      });
      mockTx.user.findUnique.mockResolvedValue({ email: 'test@example.com' });

      const processorWithDefaultFrom = new DispatchNotificationsProcessor(
        buildMockPrisma(mockTx) as never,
        buildMockConfigService({ RESEND_FROM_EMAIL: undefined }),
      );

      const mockResend = buildMockResend();
      (processorWithDefaultFrom as unknown as { getResendClient: jest.Mock }).getResendClient = jest
        .fn()
        .mockReturnValue(mockResend);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processorWithDefaultFrom.process(job);

      expect(mockResend.emails.send).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'noreply@edupod.app',
        }),
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // SMS CHANNEL
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('process — sms channel', () => {
    it('should successfully send SMS via Twilio', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'sms',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: '<p>Hello {{student_name}}</p>',
        subject_template: null,
      });
      mockTx.parent.findFirst.mockResolvedValue({ phone: '+353871234567' });

      const mockTwilio = buildMockTwilio({ messageSid: 'SM123456' });
      (processor as unknown as { getTwilioClient: jest.Mock }).getTwilioClient = jest
        .fn()
        .mockReturnValue(mockTwilio);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockTwilio.messages.create).toHaveBeenCalledWith({
        body: 'Hello Ahmed',
        from: '+15551234567',
        to: '+353871234567',
      });

      expect(mockTx.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIF_ID_1 },
        data: {
          status: 'sent',
          provider_message_id: 'SM123456',
          sent_at: expect.any(Date),
          attempt_count: 1,
        },
      });
    });

    it('should strip HTML and truncate long SMS messages', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'sms',
      });

      // Use 2000 chars so after stripping HTML we still have >1600 chars
      const longBody = 'A'.repeat(2000);
      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: longBody,
        subject_template: null,
      });
      mockTx.parent.findFirst.mockResolvedValue({ phone: '+353871234567' });

      const mockTwilio = buildMockTwilio();
      (processor as unknown as { getTwilioClient: jest.Mock }).getTwilioClient = jest
        .fn()
        .mockReturnValue(mockTwilio);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      const callArgs = mockTwilio.messages.create.mock.calls[0][0];
      // Should be truncated to 1600 chars (1600-3 + '...' = 1597 + '...' = 1600 total)
      expect(callArgs.body.length).toBeLessThanOrEqual(1600);
      expect(callArgs.body.endsWith('...')).toBe(true);
    });

    it('should create email fallback when SMS template is missing', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'sms',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockTx.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIF_ID_1 },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: expect.stringContaining('No SMS template'),
        }),
      });

      expect(mockTx.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'email',
          status: 'queued',
        }),
      });
    });

    it('should create email fallback when phone number is missing', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'sms',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: '<p>Hello</p>',
        subject_template: null,
      });
      mockTx.parent.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockTx.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIF_ID_1 },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'No phone number found',
          next_retry_at: null,
        }),
      });

      expect(mockTx.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'email',
          status: 'queued',
        }),
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // SMS FALLBACK & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('process — sms edge cases', () => {
    it('should truncate long SMS messages', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'sms',
      });

      // Create a template that results in >1600 chars after stripping HTML
      const longContent = 'A'.repeat(2000);
      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: longContent,
        subject_template: null,
      });
      mockTx.parent.findFirst.mockResolvedValue({ phone: '+353871234567' });

      const mockTwilio = buildMockTwilio();
      (processor as unknown as { getTwilioClient: jest.Mock }).getTwilioClient = jest
        .fn()
        .mockReturnValue(mockTwilio);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      const callArgs = mockTwilio.messages.create.mock.calls[0][0];
      // Should be truncated to 1600 chars (1600-3 + '...' = 1597 + '...' = 1600 total)
      expect(callArgs.body.length).toBeLessThanOrEqual(1600);
      expect(callArgs.body.endsWith('...')).toBe(true);
    });

    it('should strip HTML before sending SMS', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'sms',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: '<p>Hello <strong>Ahmed</strong></p><br/>Line 2',
        subject_template: null,
      });
      mockTx.parent.findFirst.mockResolvedValue({ phone: '+353871234567' });

      const mockTwilio = buildMockTwilio();
      (processor as unknown as { getTwilioClient: jest.Mock }).getTwilioClient = jest
        .fn()
        .mockReturnValue(mockTwilio);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockTwilio.messages.create).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.stringContaining('Hello Ahmed'),
        }),
      );
    });

    it('should fall back to platform-level template for SMS', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'sms',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      // First call returns null (tenant-level not found), second returns platform template
      mockTx.notificationTemplate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        body_template: '<p>Platform SMS</p>',
        subject_template: null,
      });
      mockTx.parent.findFirst.mockResolvedValue({ phone: '+353871234567' });

      const mockTwilio = buildMockTwilio();
      (processor as unknown as { getTwilioClient: jest.Mock }).getTwilioClient = jest
        .fn()
        .mockReturnValue(mockTwilio);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      // Verify both calls were made
      expect(mockTx.notificationTemplate.findFirst).toHaveBeenCalledTimes(2);
      expect(mockTwilio.messages.create).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // WHATSAPP CHANNEL
  // ═══════════════════════════════════════════════════════════════════════════════

  describe('process — whatsapp channel', () => {
    it('should successfully send WhatsApp via Twilio', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'whatsapp',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: '<p>Hello {{student_name}}</p>',
        subject_template: null,
      });
      mockTx.parent.findFirst.mockResolvedValue({
        whatsapp_phone: '+353871234567',
        phone: '+353871234568',
      });

      const mockTwilio = buildMockTwilio({ messageSid: 'WA123456' });
      (processor as unknown as { getTwilioClient: jest.Mock }).getTwilioClient = jest
        .fn()
        .mockReturnValue(mockTwilio);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockTwilio.messages.create).toHaveBeenCalledWith({
        body: 'Hello Ahmed',
        from: 'whatsapp:+15551234567',
        to: 'whatsapp:+353871234567',
      });

      expect(mockTx.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIF_ID_1 },
        data: {
          status: 'sent',
          provider_message_id: 'WA123456',
          sent_at: expect.any(Date),
          attempt_count: 1,
        },
      });
    });

    it('should create SMS fallback when WhatsApp template is missing', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'whatsapp',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockTx.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIF_ID_1 },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: expect.stringContaining('No WhatsApp template'),
        }),
      });

      expect(mockTx.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'sms',
          status: 'queued',
        }),
      });
    });

    it('should create SMS fallback when WhatsApp phone is missing', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'whatsapp',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValue({
        body_template: '<p>Hello</p>',
        subject_template: null,
      });
      mockTx.parent.findFirst.mockResolvedValue({
        whatsapp_phone: null,
        phone: '+353871234568',
      });

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockTx.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIF_ID_1 },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: 'No WhatsApp phone number found',
          next_retry_at: null,
        }),
      });

      expect(mockTx.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'sms',
          status: 'queued',
        }),
      });
    });

    it('should fall back to platform-level WhatsApp template when tenant-level not found', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'whatsapp',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      mockTx.notificationTemplate.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
        body_template: '<p>Platform WhatsApp</p>',
        subject_template: null,
      });
      mockTx.parent.findFirst.mockResolvedValue({
        whatsapp_phone: '+353871234567',
      });

      const mockTwilio = buildMockTwilio();
      (processor as unknown as { getTwilioClient: jest.Mock }).getTwilioClient = jest
        .fn()
        .mockReturnValue(mockTwilio);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      expect(mockTx.notificationTemplate.findFirst).toHaveBeenCalledTimes(2);
      expect(mockTwilio.messages.create).toHaveBeenCalled();
    });
  });
});
