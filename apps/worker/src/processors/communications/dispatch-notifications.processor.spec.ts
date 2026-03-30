import type { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';

import {
  DISPATCH_NOTIFICATIONS_JOB,
  DispatchNotificationsProcessor,
} from './dispatch-notifications.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const NOTIF_ID_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const NOTIF_ID_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const NOTIF_ID_3 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const ANNOUNCEMENT_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Mock Prisma ────────────────────────────────────────────────────────────

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
  };
}

function buildMockConfigService(): ConfigService {
  const configMap: Record<string, string> = {
    RESEND_API_KEY: 'test-resend-key',
    RESEND_FROM_EMAIL: 'test@edupod.app',
    TWILIO_ACCOUNT_SID: 'test-sid',
    TWILIO_AUTH_TOKEN: 'test-token',
    TWILIO_SMS_FROM: '+15551234567',
    TWILIO_WHATSAPP_FROM: 'whatsapp:+15551234567',
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

// ─── Test Suite ─────────────────────────────────────────────────────────────

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

  // ─── Job routing ────────────────────────────────────────────────────────

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

  // ─── In-app dispatch ──────────────────────────────────────────────────

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
  });

  // ─── No notifications to dispatch ─────────────────────────────────────

  describe('process — empty dispatch', () => {
    it('should handle empty notification_ids gracefully', async () => {
      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [],
      });

      await processor.process(job);

      // First findMany is for resolving notification IDs
      // Since empty list, should early-return
      expect(mockTx.notification.update).not.toHaveBeenCalled();
    });

    it('should resolve notification IDs from announcement_id when notification_ids is absent', async () => {
      // First call: resolve announcement notification IDs
      mockTx.notification.findMany
        .mockResolvedValueOnce([{ id: NOTIF_ID_2 }])
        // Second call: fetch full notifications
        .mockResolvedValueOnce([
          buildNotification({
            id: NOTIF_ID_2,
            channel: 'in_app',
            source_entity_type: 'announcement',
            source_entity_id: ANNOUNCEMENT_ID,
          }),
        ]);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        announcement_id: ANNOUNCEMENT_ID,
      });

      await processor.process(job);

      // Should query for announcement-related notifications
      expect(mockTx.notification.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            tenant_id: TENANT_ID,
            source_entity_type: 'announcement',
            source_entity_id: ANNOUNCEMENT_ID,
          }),
        }),
      );

      // Should dispatch the resolved notification
      expect(mockTx.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIF_ID_2 },
        data: expect.objectContaining({
          status: 'delivered',
        }),
      });
    });
  });

  // ─── Multiple notifications ───────────────────────────────────────────

  describe('process — multiple notifications', () => {
    it('should dispatch all notifications in the batch', async () => {
      const notifications = [
        buildNotification({ id: NOTIF_ID_1, channel: 'in_app' }),
        buildNotification({ id: NOTIF_ID_2, channel: 'in_app' }),
        buildNotification({ id: NOTIF_ID_3, channel: 'in_app' }),
      ];

      mockTx.notification.findMany.mockResolvedValue(notifications);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1, NOTIF_ID_2, NOTIF_ID_3],
      });

      await processor.process(job);

      expect(mockTx.notification.update).toHaveBeenCalledTimes(3);
    });
  });

  // ─── Email channel — missing template fallback ────────────────────────

  describe('process — email channel fallback', () => {
    it('should create in_app fallback when email template is missing', async () => {
      const notification = buildNotification({
        id: NOTIF_ID_1,
        channel: 'email',
      });

      mockTx.notification.findMany.mockResolvedValue([notification]);
      // No template found
      mockTx.notificationTemplate.findFirst.mockResolvedValue(null);

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      await processor.process(job);

      // Should mark the original as failed
      expect(mockTx.notification.update).toHaveBeenCalledWith({
        where: { id: NOTIF_ID_1 },
        data: expect.objectContaining({
          status: 'failed',
          failure_reason: expect.stringContaining('template'),
        }),
      });

      // Should create an in_app fallback
      expect(mockTx.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          recipient_user_id: USER_ID,
          channel: 'in_app',
          status: 'delivered',
        }),
      });
    });
  });

  // ─── Logging ──────────────────────────────────────────────────────────

  describe('process — logging', () => {
    it('should log the processing start', async () => {
      const logSpy = jest.spyOn(processor['logger'], 'log');

      const job = buildMockJob(DISPATCH_NOTIFICATIONS_JOB, {
        tenant_id: TENANT_ID,
        notification_ids: [NOTIF_ID_1],
      });

      // No notifications found
      mockTx.notification.findMany.mockResolvedValue([]);

      await processor.process(job);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(DISPATCH_NOTIFICATIONS_JOB));
    });
  });
});
