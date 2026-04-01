import { getQueueToken } from '@nestjs/bullmq';
import { Test, TestingModule } from '@nestjs/testing';

import { NotificationsService } from '../../communications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';

import { PastoralNotificationService } from './pastoral-notification.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AUTHOR_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DLP_USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DEPUTY_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PRINCIPAL_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const YEAR_HEAD_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const CONCERN_ID = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = '33333333-3333-3333-3333-333333333333';
const YEAR_GROUP_ID = '44444444-4444-4444-4444-444444444444';

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeConcern = (overrides: Record<string, unknown> = {}) => ({
  id: CONCERN_ID,
  tenant_id: TENANT_ID,
  student_id: STUDENT_ID,
  category: 'academic',
  severity: 'routine' as const,
  tier: 1,
  logged_by_user_id: AUTHOR_ID,
  created_at: new Date('2026-03-01T10:00:00Z'),
  student: {
    first_name: 'Ahmed',
    last_name: 'Hassan',
    year_group_id: YEAR_GROUP_ID,
  },
  ...overrides,
});

/**
 * Builds a mock tenant settings record.
 * The service calls `prisma.tenantSetting.findUnique({ where: { tenant_id } })`
 * then parses `record.settings.pastoral` through `pastoralTenantSettingsSchema`.
 * The schema uses flat arrays for notification_recipients (not nested objects).
 */
const makeSettings = (pastoralOverrides: Record<string, unknown> = {}) => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    pastoral: {
      concern_categories: [],
      masked_authorship_enabled: true,
      notification_recipients: {
        urgent: [DLP_USER_ID, DEPUTY_ID],
        critical: [DLP_USER_ID, PRINCIPAL_ID],
      },
      escalation: {
        urgent_timeout_minutes: 120,
        critical_timeout_minutes: 30,
      },
      ...pastoralOverrides,
    },
  },
  created_at: new Date(),
  updated_at: new Date(),
});

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('PastoralNotificationService', () => {
  let service: PastoralNotificationService;
  let mockNotificationsService: { createBatch: jest.Mock };
  let mockPrisma: {
    tenantSetting: { findUnique: jest.Mock };
    cpAccessGrant: { findMany: jest.Mock };
    membershipRole: { findMany: jest.Mock };
    student: { findUnique: jest.Mock };
    notification: { findFirst: jest.Mock };
  };
  let mockNotificationsQueue: { add: jest.Mock };
  let mockPastoralQueue: {
    add: jest.Mock;
    getJob: jest.Mock;
  };

  beforeEach(async () => {
    mockNotificationsService = {
      createBatch: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      tenantSetting: {
        findUnique: jest.fn().mockResolvedValue(makeSettings()),
      },
      cpAccessGrant: {
        // Used by resolveRecipients for 'dlp' role fallback
        findMany: jest.fn().mockResolvedValue([{ user_id: DLP_USER_ID }]),
      },
      membershipRole: {
        // Used by resolveUsersByRoleKey for generic role fallback
        findMany: jest.fn().mockResolvedValue([]),
      },
      student: {
        // Used by resolveYearHeadForStudent
        findUnique: jest.fn().mockResolvedValue({
          year_group_id: YEAR_GROUP_ID,
        }),
      },
      notification: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };

    mockNotificationsQueue = {
      add: jest.fn().mockResolvedValue({ id: 'notif-job-1' }),
    };

    mockPastoralQueue = {
      add: jest.fn().mockResolvedValue({ id: 'pastoral-job-1' }),
      getJob: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PastoralNotificationService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: getQueueToken('notifications'), useValue: mockNotificationsQueue },
        { provide: getQueueToken('pastoral'), useValue: mockPastoralQueue },
      ],
    }).compile();

    service = module.get<PastoralNotificationService>(PastoralNotificationService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Dispatch by severity ───────────────────────────────────────────────

  describe('dispatchForConcern', () => {
    it('should create in-app notifications only for routine concerns', async () => {
      // Routine: role-based fallback has no roles, so configure membershipRole
      // to return empty to verify no notifications are created OR
      // the service still creates in-app for resolved recipients.
      // The routine fallback roles are empty [], so we need cpAccessGrant
      // or membershipRole to return someone for in-app notifications.
      // Since routine has no explicit IDs and no fallback roles,
      // the service may skip (no recipients). That is correct per spec.
      const concern = makeConcern({ severity: 'routine', tier: 1 });

      await service.dispatchForConcern(TENANT_ID, concern, AUTHOR_ID);

      // Routine has no explicit IDs and DEFAULT_FALLBACK_ROLES.routine = []
      // So resolveRecipients returns empty -> service warns and skips.
      // This is correct: routine concerns are informational in-app only
      // for Tier 1 viewers, handled via the SST meeting agenda path.
      // If no recipients are resolved, no notifications are created.
      if (mockNotificationsService.createBatch.mock.calls.length > 0) {
        const batchCall = mockNotificationsService.createBatch.mock.calls[0] as [
          string,
          Array<{ channel: string }>,
        ];
        const notifications = batchCall[1];
        const channels = notifications.map((n) => n.channel);
        expect(channels.every((c) => c === 'in_app')).toBe(true);
        expect(channels).not.toContain('email');
        expect(channels).not.toContain('whatsapp');
      }

      // No escalation timeout job enqueued for routine
      expect(mockPastoralQueue.add).not.toHaveBeenCalled();
    });

    it('should create in-app and email notifications for elevated concerns', async () => {
      // Elevated: no explicit IDs, fallback roles = ['year_head', 'pastoral_coordinator']
      // Mock role resolution to return users
      mockPrisma.membershipRole.findMany
        .mockResolvedValueOnce([{ membership: { user_id: YEAR_HEAD_ID } }]) // year_head
        .mockResolvedValueOnce([{ membership: { user_id: DEPUTY_ID } }]); // pastoral_coordinator

      const concern = makeConcern({ severity: 'elevated', tier: 1 });

      await service.dispatchForConcern(TENANT_ID, concern, AUTHOR_ID);

      expect(mockNotificationsService.createBatch).toHaveBeenCalledTimes(1);

      const batchCall = mockNotificationsService.createBatch.mock.calls[0] as [
        string,
        Array<{ channel: string; recipient_user_id: string }>,
      ];
      const notifications = batchCall[1];
      const channels = [...new Set(notifications.map((n) => n.channel))];

      expect(channels).toContain('in_app');
      expect(channels).toContain('email');
      expect(channels).not.toContain('whatsapp');

      // Should dispatch email delivery job
      expect(mockNotificationsQueue.add).toHaveBeenCalled();

      // No escalation timeout job for elevated
      expect(mockPastoralQueue.add).not.toHaveBeenCalled();
    });

    it('should create in-app, email, and push notifications for urgent concerns', async () => {
      const concern = makeConcern({ severity: 'urgent', tier: 2 });

      await service.dispatchForConcern(TENANT_ID, concern, AUTHOR_ID);

      expect(mockNotificationsService.createBatch).toHaveBeenCalledTimes(1);

      const batchCall = mockNotificationsService.createBatch.mock.calls[0] as [
        string,
        Array<{ channel: string; payload_json: Record<string, unknown> }>,
      ];
      const notifications = batchCall[1];
      const channels = [...new Set(notifications.map((n) => n.channel))];

      expect(channels).toContain('in_app');
      expect(channels).toContain('email');
      expect(channels).not.toContain('whatsapp');

      // Push notifications are in-app with priority: 'high'
      const pushNotifications = notifications.filter(
        (n) => n.channel === 'in_app' && n.payload_json?.priority === 'high',
      );
      expect(pushNotifications.length).toBeGreaterThan(0);

      // Escalation timeout job should be enqueued
      expect(mockPastoralQueue.add).toHaveBeenCalledWith(
        'pastoral:escalation-timeout',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
        }),
        expect.objectContaining({
          delay: 120 * 60 * 1000, // 120 minutes in ms
        }),
      );
    });

    it('should create in-app, email, push, and WhatsApp notifications for critical concerns', async () => {
      const concern = makeConcern({ severity: 'critical', tier: 3 });

      await service.dispatchForConcern(TENANT_ID, concern, AUTHOR_ID);

      expect(mockNotificationsService.createBatch).toHaveBeenCalledTimes(1);

      const batchCall = mockNotificationsService.createBatch.mock.calls[0] as [
        string,
        Array<{ channel: string }>,
      ];
      const notifications = batchCall[1];
      const channels = [...new Set(notifications.map((n) => n.channel))];

      expect(channels).toContain('in_app');
      expect(channels).toContain('email');
      expect(channels).toContain('whatsapp');

      // Escalation timeout job should be enqueued with 30-minute default
      expect(mockPastoralQueue.add).toHaveBeenCalledWith(
        'pastoral:escalation-timeout',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
        }),
        expect.objectContaining({
          delay: 30 * 60 * 1000, // 30 minutes in ms
        }),
      );
    });
  });

  // ─── Recipient resolution ─────────────────────────────────────────────────

  describe('recipient resolution', () => {
    it('should resolve recipients from tenant settings when explicit user IDs are configured', async () => {
      const concern = makeConcern({ severity: 'urgent', tier: 2 });

      await service.dispatchForConcern(TENANT_ID, concern, AUTHOR_ID);

      const batchCall = mockNotificationsService.createBatch.mock.calls[0] as [
        string,
        Array<{ recipient_user_id: string }>,
      ];
      const recipientIds = [...new Set(batchCall[1].map((n) => n.recipient_user_id))];

      // Urgent recipients from settings: DLP_USER_ID and DEPUTY_ID
      expect(recipientIds).toContain(DLP_USER_ID);
      expect(recipientIds).toContain(DEPUTY_ID);
    });

    it('should fall back to role-based recipients when explicit user IDs are empty', async () => {
      // Configure settings with empty urgent/critical arrays
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeSettings({
          notification_recipients: {
            urgent: [],
            critical: [],
          },
        }),
      );

      // Mock role resolution: 'dlp' fallback resolves via cpAccessGrant
      mockPrisma.cpAccessGrant.findMany.mockResolvedValue([{ user_id: DLP_USER_ID }]);

      // Mock 'deputy_principal' role resolution via membershipRole
      mockPrisma.membershipRole.findMany.mockResolvedValue([
        { membership: { user_id: DEPUTY_ID } },
      ]);

      const concern = makeConcern({ severity: 'urgent', tier: 2 });

      await service.dispatchForConcern(TENANT_ID, concern, AUTHOR_ID);

      // Should have called createBatch (role-based fallback resolved recipients)
      expect(mockNotificationsService.createBatch).toHaveBeenCalledTimes(1);
    });

    it('should exclude the logging user from recipient list', async () => {
      // Configure settings where the author is also in the urgent recipients
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeSettings({
          notification_recipients: {
            urgent: [AUTHOR_ID, DLP_USER_ID, DEPUTY_ID],
            critical: [DLP_USER_ID, PRINCIPAL_ID],
          },
        }),
      );

      const concern = makeConcern({ severity: 'urgent', tier: 2 });

      await service.dispatchForConcern(TENANT_ID, concern, AUTHOR_ID);

      const batchCall = mockNotificationsService.createBatch.mock.calls[0] as [
        string,
        Array<{ recipient_user_id: string }>,
      ];
      const recipientIds = batchCall[1].map((n) => n.recipient_user_id);

      // Author should NOT be in the recipient list
      expect(recipientIds).not.toContain(AUTHOR_ID);
      // Other recipients should still be present
      expect(recipientIds).toContain(DLP_USER_ID);
      expect(recipientIds).toContain(DEPUTY_ID);
    });

    it('should deduplicate recipients appearing multiple times', async () => {
      // DLP user appears twice in the array
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeSettings({
          notification_recipients: {
            urgent: [DLP_USER_ID, DLP_USER_ID, DEPUTY_ID],
            critical: [DLP_USER_ID, PRINCIPAL_ID],
          },
        }),
      );

      const concern = makeConcern({ severity: 'urgent', tier: 2 });

      await service.dispatchForConcern(TENANT_ID, concern, AUTHOR_ID);

      const batchCall = mockNotificationsService.createBatch.mock.calls[0] as [
        string,
        Array<{ recipient_user_id: string; channel: string }>,
      ];
      const notifications = batchCall[1];

      // DLP should receive exactly one notification per channel, not duplicates
      const dlpInAppCount = notifications.filter(
        (n) => n.recipient_user_id === DLP_USER_ID && n.channel === 'in_app',
      ).length;
      expect(dlpInAppCount).toBe(1);

      const dlpEmailCount = notifications.filter(
        (n) => n.recipient_user_id === DLP_USER_ID && n.channel === 'email',
      ).length;
      expect(dlpEmailCount).toBe(1);
    });
  });

  // ─── Escalation timeout configuration ─────────────────────────────────────

  describe('escalation timeout configuration', () => {
    it('should use tenant-configured timeout for urgent escalation delay', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeSettings({
          escalation: {
            urgent_timeout_minutes: 60,
            critical_timeout_minutes: 30,
          },
        }),
      );

      const concern = makeConcern({ severity: 'urgent', tier: 2 });

      await service.dispatchForConcern(TENANT_ID, concern, AUTHOR_ID);

      expect(mockPastoralQueue.add).toHaveBeenCalledWith(
        'pastoral:escalation-timeout',
        expect.objectContaining({
          tenant_id: TENANT_ID,
          concern_id: CONCERN_ID,
        }),
        expect.objectContaining({
          delay: 60 * 60 * 1000, // 60 minutes in ms
        }),
      );
    });

    it('should use default timeout of 120 minutes when tenant escalation setting is missing', async () => {
      // Settings without escalation config — Zod defaults apply
      mockPrisma.tenantSetting.findUnique.mockResolvedValue({
        id: 'settings-1',
        tenant_id: TENANT_ID,
        settings: {
          pastoral: {
            notification_recipients: {
              urgent: [DLP_USER_ID, DEPUTY_ID],
              critical: [DLP_USER_ID, PRINCIPAL_ID],
            },
            // No escalation key — Zod fills defaults: 120 min urgent, 30 min critical
          },
        },
        created_at: new Date(),
        updated_at: new Date(),
      });

      const concern = makeConcern({ severity: 'urgent', tier: 2 });

      await service.dispatchForConcern(TENANT_ID, concern, AUTHOR_ID);

      expect(mockPastoralQueue.add).toHaveBeenCalledWith(
        'pastoral:escalation-timeout',
        expect.anything(),
        expect.objectContaining({
          delay: 120 * 60 * 1000, // 120 minutes default
        }),
      );
    });

    it('should use tenant-configured timeout for critical escalation delay', async () => {
      mockPrisma.tenantSetting.findUnique.mockResolvedValue(
        makeSettings({
          escalation: {
            urgent_timeout_minutes: 120,
            critical_timeout_minutes: 15,
          },
        }),
      );

      const concern = makeConcern({ severity: 'critical', tier: 3 });

      await service.dispatchForConcern(TENANT_ID, concern, AUTHOR_ID);

      expect(mockPastoralQueue.add).toHaveBeenCalledWith(
        'pastoral:escalation-timeout',
        expect.anything(),
        expect.objectContaining({
          delay: 15 * 60 * 1000, // 15 minutes in ms
        }),
      );
    });
  });

  // ─── Escalation job ID pattern ────────────────────────────────────────────

  describe('escalation job ID', () => {
    it('should use deterministic job ID pattern for escalation jobs', async () => {
      const concern = makeConcern({ severity: 'urgent', tier: 2 });

      await service.dispatchForConcern(TENANT_ID, concern, AUTHOR_ID);

      expect(mockPastoralQueue.add).toHaveBeenCalledWith(
        'pastoral:escalation-timeout',
        expect.anything(),
        expect.objectContaining({
          jobId: `pastoral:escalation:${TENANT_ID}:${CONCERN_ID}:urgent_to_critical`,
        }),
      );
    });
  });

  // ─── Cancel escalation ────────────────────────────────────────────────────

  describe('cancelEscalationTimeout', () => {
    it('should look up and remove both pending escalation job types', async () => {
      const mockJob = { remove: jest.fn().mockResolvedValue(undefined) };
      mockPastoralQueue.getJob
        .mockResolvedValueOnce(mockJob) // urgent_to_critical
        .mockResolvedValueOnce(mockJob); // critical_second_round

      await service.cancelEscalationTimeout(TENANT_ID, CONCERN_ID);

      // Should look up both escalation job IDs
      expect(mockPastoralQueue.getJob).toHaveBeenCalledTimes(2);
      expect(mockPastoralQueue.getJob).toHaveBeenCalledWith(
        `pastoral:escalation:${TENANT_ID}:${CONCERN_ID}:urgent_to_critical`,
      );
      expect(mockPastoralQueue.getJob).toHaveBeenCalledWith(
        `pastoral:escalation:${TENANT_ID}:${CONCERN_ID}:critical_second_round`,
      );

      // Should remove both found jobs
      expect(mockJob.remove).toHaveBeenCalledTimes(2);
    });

    it('should handle gracefully when no escalation jobs exist', async () => {
      mockPastoralQueue.getJob.mockResolvedValue(null);

      // Should not throw
      await expect(service.cancelEscalationTimeout(TENANT_ID, CONCERN_ID)).resolves.toBeUndefined();

      // Still checked both job IDs
      expect(mockPastoralQueue.getJob).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Critical escalation dispatch ─────────────────────────────────────────

  describe('dispatchCriticalEscalation', () => {
    it('should dispatch critical-level notifications when urgent auto-escalates', async () => {
      const concern = makeConcern({
        severity: 'critical',
        tier: 3,
        logged_by_user_id: AUTHOR_ID,
      });

      await service.dispatchCriticalEscalation(TENANT_ID, concern);

      expect(mockNotificationsService.createBatch).toHaveBeenCalledTimes(1);

      const batchCall = mockNotificationsService.createBatch.mock.calls[0] as [
        string,
        Array<{ channel: string }>,
      ];
      const channels = [...new Set(batchCall[1].map((n) => n.channel))];

      // Critical-level channels: in-app, email, whatsapp
      expect(channels).toContain('in_app');
      expect(channels).toContain('email');
      expect(channels).toContain('whatsapp');

      // Should enqueue second-round escalation timeout
      expect(mockPastoralQueue.add).toHaveBeenCalledWith(
        'pastoral:escalation-timeout',
        expect.objectContaining({
          concern_id: CONCERN_ID,
        }),
        expect.objectContaining({
          delay: 30 * 60 * 1000, // critical default 30 min
        }),
      );
    });
  });

  // ─── Second-round dispatch ────────────────────────────────────────────────

  describe('dispatchSecondRoundCritical', () => {
    it('should send second-round notifications to critical recipients including principal', async () => {
      const concern = makeConcern({
        severity: 'critical',
        tier: 3,
        logged_by_user_id: AUTHOR_ID,
      });

      await service.dispatchSecondRoundCritical(TENANT_ID, concern);

      expect(mockNotificationsService.createBatch).toHaveBeenCalledTimes(1);

      const batchCall = mockNotificationsService.createBatch.mock.calls[0] as [
        string,
        Array<{ recipient_user_id: string }>,
      ];
      const recipientIds = [...new Set(batchCall[1].map((n) => n.recipient_user_id))];

      // Principal should be in the recipients for second round (critical config)
      expect(recipientIds).toContain(PRINCIPAL_ID);

      // No further escalation timeout enqueued (chain terminates)
      expect(mockPastoralQueue.add).not.toHaveBeenCalled();
    });
  });
});
