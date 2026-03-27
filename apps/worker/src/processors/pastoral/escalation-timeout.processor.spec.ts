import { PrismaClient } from '@prisma/client';

import {
  EscalationTimeoutProcessor,
  EscalationTimeoutPayload,
  ESCALATION_TIMEOUT_JOB,
} from './escalation-timeout.processor';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONCERN_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const DLP_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PRINCIPAL_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Helpers ────────────────────────────────────────────────────────────────

function buildConcern(overrides: Record<string, unknown> = {}) {
  return {
    id: CONCERN_ID,
    tenant_id: TENANT_ID,
    student_id: STUDENT_ID,
    category: 'emotional',
    severity: 'urgent',
    tier: 2,
    logged_by_user_id: 'author-user-id',
    acknowledged_at: null,
    acknowledged_by_user_id: null,
    created_at: new Date('2026-03-01T10:00:00Z'),
    updated_at: new Date('2026-03-01T10:00:00Z'),
    student: {
      id: STUDENT_ID,
      first_name: 'Ahmed',
      last_name: 'Hassan',
    },
    ...overrides,
  };
}

function buildMockTx() {
  return {
    pastoralConcern: {
      findFirst: jest.fn().mockResolvedValue(buildConcern()),
      update: jest.fn().mockResolvedValue(buildConcern({ severity: 'critical' })),
    },
    pastoralEvent: {
      create: jest.fn().mockResolvedValue({ id: 'event-1' }),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          pastoral: {
            designated_liaison_user_id: DLP_USER_ID,
            notification_recipients: {
              critical: {
                user_ids: [DLP_USER_ID, PRINCIPAL_ID],
                fallback_roles: ['dlp', 'principal'],
              },
            },
            escalation: {
              urgent_timeout_minutes: 120,
              critical_timeout_minutes: 30,
            },
          },
        },
      }),
    },
    membershipRole: {
      findMany: jest.fn().mockResolvedValue([
        { membership: { user_id: PRINCIPAL_ID } },
      ]),
    },
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

function buildMockPrisma(mockTx: ReturnType<typeof buildMockTx>) {
  return {
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
  } as unknown as PrismaClient;
}

function buildMockPastoralQueue() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'followup-job-1' }),
  };
}

function buildMockNotificationsQueue() {
  return {
    add: jest.fn().mockResolvedValue({ id: 'dispatch-job-1' }),
  };
}

function buildJob(
  payload: EscalationTimeoutPayload,
  name: string = ESCALATION_TIMEOUT_JOB,
) {
  return {
    name,
    data: payload,
  };
}

function buildPayload(
  overrides: Partial<EscalationTimeoutPayload> = {},
): EscalationTimeoutPayload {
  return {
    tenant_id: TENANT_ID,
    concern_id: CONCERN_ID,
    escalation_type: 'urgent_to_critical',
    original_severity: 'urgent',
    enqueued_at: new Date('2026-03-01T10:00:00Z').toISOString(),
    ...overrides,
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('EscalationTimeoutProcessor', () => {
  let processor: EscalationTimeoutProcessor;
  let mockTx: ReturnType<typeof buildMockTx>;
  let mockPastoralQueue: ReturnType<typeof buildMockPastoralQueue>;
  let mockNotificationsQueue: ReturnType<typeof buildMockNotificationsQueue>;

  beforeEach(() => {
    mockTx = buildMockTx();
    const mockPrisma = buildMockPrisma(mockTx);
    mockPastoralQueue = buildMockPastoralQueue();
    mockNotificationsQueue = buildMockNotificationsQueue();

    processor = new EscalationTimeoutProcessor(
      mockPrisma,
      mockPastoralQueue as never,
      mockNotificationsQueue as never,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Acknowledged concern — no escalation ─────────────────────────────

  it('should skip escalation when concern is already acknowledged', async () => {
    mockTx.pastoralConcern.findFirst.mockResolvedValue(
      buildConcern({
        acknowledged_at: new Date('2026-03-01T11:00:00Z'),
        acknowledged_by_user_id: DLP_USER_ID,
      }),
    );

    const payload = buildPayload();

    await processor.process(buildJob(payload) as never);

    // Should NOT update concern severity
    expect(mockTx.pastoralConcern.update).not.toHaveBeenCalled();

    // Should NOT create any audit events for escalation
    expect(mockTx.pastoralEvent.create).not.toHaveBeenCalled();

    // Should NOT create any notifications
    expect(mockTx.notification.create).not.toHaveBeenCalled();

    // No follow-up escalation job enqueued
    expect(mockPastoralQueue.add).not.toHaveBeenCalled();
  });

  // ─── Urgent -> Critical escalation ────────────────────────────────────

  it('should escalate urgent to critical when unacknowledged', async () => {
    const payload = buildPayload({
      escalation_type: 'urgent_to_critical',
      original_severity: 'urgent',
    });

    await processor.process(buildJob(payload) as never);

    // Should update concern severity to critical
    expect(mockTx.pastoralConcern.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: CONCERN_ID }),
        data: expect.objectContaining({
          severity: 'critical',
        }),
      }),
    );
  });

  it('should write concern_auto_escalated audit event on urgent to critical escalation', async () => {
    const payload = buildPayload({
      escalation_type: 'urgent_to_critical',
    });

    await processor.process(buildJob(payload) as never);

    expect(mockTx.pastoralEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenant_id: TENANT_ID,
          event_type: 'concern_auto_escalated',
          entity_type: 'concern',
          entity_id: CONCERN_ID,
          payload: expect.objectContaining({
            old_severity: 'urgent',
            new_severity: 'critical',
            reason: 'unacknowledged_timeout',
          }),
        }),
      }),
    );
  });

  it('should create notification records after urgent to critical escalation', async () => {
    const payload = buildPayload({
      escalation_type: 'urgent_to_critical',
    });

    await processor.process(buildJob(payload) as never);

    // Should create notification records (via tx.notification.create per recipient per channel)
    expect(mockTx.notification.create).toHaveBeenCalled();
  });

  it('should enqueue critical_second_round follow-up job after urgent to critical escalation', async () => {
    const payload = buildPayload({
      escalation_type: 'urgent_to_critical',
    });

    await processor.process(buildJob(payload) as never);

    // Should enqueue a follow-up escalation job for critical_second_round
    expect(mockPastoralQueue.add).toHaveBeenCalledWith(
      ESCALATION_TIMEOUT_JOB,
      expect.objectContaining({
        escalation_type: 'critical_second_round',
        concern_id: CONCERN_ID,
        tenant_id: TENANT_ID,
      }),
      expect.objectContaining({
        delay: 30 * 60 * 1000, // 30 minutes default
        jobId: expect.stringContaining(
          `pastoral:escalation:${TENANT_ID}:${CONCERN_ID}:critical_second_round`,
        ),
      }),
    );
  });

  // ─── Second-round critical ────────────────────────────────────────────

  it('should record critical_concern_unacknowledged event on second round', async () => {
    // Concern is critical and still unacknowledged
    mockTx.pastoralConcern.findFirst.mockResolvedValue(
      buildConcern({
        severity: 'critical',
        tier: 3,
        acknowledged_at: null,
      }),
    );

    const payload = buildPayload({
      escalation_type: 'critical_second_round',
      original_severity: 'critical',
    });

    await processor.process(buildJob(payload) as never);

    expect(mockTx.pastoralEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          event_type: 'critical_concern_unacknowledged',
          entity_type: 'concern',
          entity_id: CONCERN_ID,
          payload: expect.objectContaining({
            concern_id: CONCERN_ID,
            severity: 'critical',
            notification_round: 2,
          }),
        }),
      }),
    );
  });

  it('should send second-round notifications to principal', async () => {
    mockTx.pastoralConcern.findFirst.mockResolvedValue(
      buildConcern({
        severity: 'critical',
        tier: 3,
        acknowledged_at: null,
      }),
    );

    const payload = buildPayload({
      escalation_type: 'critical_second_round',
      original_severity: 'critical',
    });

    await processor.process(buildJob(payload) as never);

    // Should create notification records for principal
    expect(mockTx.notification.create).toHaveBeenCalled();
  });

  it('should not enqueue further escalation after second round (chain terminates)', async () => {
    mockTx.pastoralConcern.findFirst.mockResolvedValue(
      buildConcern({
        severity: 'critical',
        tier: 3,
        acknowledged_at: null,
      }),
    );

    const payload = buildPayload({
      escalation_type: 'critical_second_round',
      original_severity: 'critical',
    });

    await processor.process(buildJob(payload) as never);

    // No further follow-up escalation enqueued — chain terminates
    expect(mockPastoralQueue.add).not.toHaveBeenCalledWith(
      ESCALATION_TIMEOUT_JOB,
      expect.anything(),
      expect.anything(),
    );
  });

  // ─── Acknowledgement between escalation rounds ────────────────────────

  it('should not act when concern was acknowledged between escalation and second round', async () => {
    // Concern was acknowledged after first escalation but before second fires
    mockTx.pastoralConcern.findFirst.mockResolvedValue(
      buildConcern({
        severity: 'critical',
        tier: 3,
        acknowledged_at: new Date('2026-03-01T12:30:00Z'),
        acknowledged_by_user_id: DLP_USER_ID,
      }),
    );

    const payload = buildPayload({
      escalation_type: 'critical_second_round',
      original_severity: 'critical',
    });

    await processor.process(buildJob(payload) as never);

    // No update, no events, no notifications
    expect(mockTx.pastoralConcern.update).not.toHaveBeenCalled();
    expect(mockTx.pastoralEvent.create).not.toHaveBeenCalled();
    expect(mockTx.notification.create).not.toHaveBeenCalled();
    expect(mockPastoralQueue.add).not.toHaveBeenCalled();
  });

  // ─── Missing concern ─────────────────────────────────────────────────

  it('should handle missing concern gracefully', async () => {
    mockTx.pastoralConcern.findFirst.mockResolvedValue(null);

    const payload = buildPayload();

    // Should not throw
    await expect(
      processor.process(buildJob(payload) as never),
    ).resolves.toBeUndefined();

    // Should not attempt any updates
    expect(mockTx.pastoralConcern.update).not.toHaveBeenCalled();
    expect(mockTx.pastoralEvent.create).not.toHaveBeenCalled();
  });

  // ─── Job name guard ───────────────────────────────────────────────────

  it('should ignore jobs with non-matching name', async () => {
    const payload = buildPayload();

    await processor.process(
      buildJob(payload, 'some-other-job') as never,
    );

    // Should not interact with DB at all
    expect(mockTx.pastoralConcern.findFirst).not.toHaveBeenCalled();
  });

  // ─── Missing tenant_id ────────────────────────────────────────────────

  it('should reject jobs missing tenant_id', async () => {
    const payload = {
      concern_id: CONCERN_ID,
      escalation_type: 'urgent_to_critical',
      original_severity: 'urgent',
      enqueued_at: new Date().toISOString(),
    } as EscalationTimeoutPayload;

    await expect(
      processor.process(buildJob(payload) as never),
    ).rejects.toThrow('tenant_id');
  });

  // ─── Dispatch job enqueue ─────────────────────────────────────────────

  it('should enqueue notification dispatch job when notifications are created during escalation', async () => {
    const payload = buildPayload({
      escalation_type: 'urgent_to_critical',
    });

    await processor.process(buildJob(payload) as never);

    // Should enqueue a dispatch-notifications job on the notifications queue
    expect(mockNotificationsQueue.add).toHaveBeenCalled();
  });
});
