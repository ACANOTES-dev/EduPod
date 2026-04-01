import { Job } from 'bullmq';

import {
  REGULATORY_DEADLINE_CHECK_JOB,
  RegulatoryDeadlineCheckProcessor,
} from './deadline-check.processor';

const TENANT_A_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_B_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_USER_A = '33333333-3333-3333-3333-333333333333';
const ADMIN_USER_B = '44444444-4444-4444-4444-444444444444';
const EVENT_ID = '55555555-5555-5555-5555-555555555555';

interface RegulatoryEvent {
  domain: string;
  due_date: Date;
  id: string;
  reminder_days: number[];
  title: string;
}

interface BuildMockPrismaOptions {
  activeTenants?: Array<{ id: string }>;
  adminUserIdsByTenant?: Record<string, string[]>;
  existingNotificationKeys?: string[];
  failingTenants?: string[];
  overdueByTenant?: Record<string, RegulatoryEvent[]>;
  upcomingByTenant?: Record<string, RegulatoryEvent[]>;
}

function buildEvent(overrides: Partial<RegulatoryEvent> = {}): RegulatoryEvent {
  return {
    domain: 'tusla',
    due_date: new Date('2026-04-04T00:00:00.000Z'),
    id: EVENT_ID,
    reminder_days: [3],
    title: 'Tusla return',
    ...overrides,
  };
}

function notificationKey(
  tenantId: string,
  recipientUserId: string,
  templateKey: string,
  sourceEntityId: string,
): string {
  return `${tenantId}::${recipientUserId}::${templateKey}::${sourceEntityId}`;
}

function buildMockPrisma(options: BuildMockPrismaOptions = {}) {
  const existingNotificationKeys = new Set(options.existingNotificationKeys ?? []);
  const failingTenants = new Set(options.failingTenants ?? []);

  return {
    membershipRole: {
      findMany: jest
        .fn()
        .mockImplementation(async (args: { where: { tenant_id: string } }) =>
          (options.adminUserIdsByTenant?.[args.where.tenant_id] ?? []).map((user_id) => ({
            membership: { user_id },
          })),
        ),
    },
    notification: {
      create: jest.fn().mockResolvedValue({ id: 'notification-id' }),
      findFirst: jest.fn().mockImplementation(
        async (args: {
          where: {
            recipient_user_id: string;
            source_entity_id: string;
            template_key: string;
            tenant_id: string;
          };
        }) => {
          const key = notificationKey(
            args.where.tenant_id,
            args.where.recipient_user_id,
            args.where.template_key,
            args.where.source_entity_id,
          );

          return existingNotificationKeys.has(key) ? { id: `existing-${key}` } : null;
        },
      ),
    },
    regulatoryCalendarEvent: {
      findMany: jest.fn().mockImplementation(
        async (args: {
          where: {
            due_date: { gte?: Date; lt?: Date };
            tenant_id: string;
          };
        }) => {
          const tenantId = args.where.tenant_id;

          if (failingTenants.has(tenantId)) {
            throw new Error(`failed tenant ${tenantId}`);
          }

          if ('gte' in args.where.due_date) {
            return options.upcomingByTenant?.[tenantId] ?? [];
          }

          return options.overdueByTenant?.[tenantId] ?? [];
        },
      ),
    },
    tenant: {
      findMany: jest.fn().mockResolvedValue(options.activeTenants ?? [{ id: TENANT_A_ID }]),
    },
  };
}

function buildJob(name: string = REGULATORY_DEADLINE_CHECK_JOB): Job {
  return { data: {}, name } as unknown as Job;
}

describe('RegulatoryDeadlineCheckProcessor', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should ignore jobs with a different name', async () => {
    const mockPrisma = buildMockPrisma();
    const processor = new RegulatoryDeadlineCheckProcessor(mockPrisma as never);

    await processor.process(buildJob('regulatory:other-job'));

    expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.regulatoryCalendarEvent.findMany).not.toHaveBeenCalled();
  });

  it('should iterate active tenants and continue after a tenant failure', async () => {
    const mockPrisma = buildMockPrisma({
      activeTenants: [{ id: TENANT_A_ID }, { id: TENANT_B_ID }],
      adminUserIdsByTenant: { [TENANT_B_ID]: [ADMIN_USER_A] },
      failingTenants: [TENANT_A_ID],
      overdueByTenant: { [TENANT_B_ID]: [] },
      upcomingByTenant: { [TENANT_B_ID]: [] },
    });
    const processor = new RegulatoryDeadlineCheckProcessor(mockPrisma as never);

    await expect(processor.process(buildJob())).resolves.toBeUndefined();

    expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
      where: { status: 'active' },
      select: { id: true },
    });
    expect(mockPrisma.membershipRole.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.membershipRole.findMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_B_ID,
        role: { role_tier: 'admin' },
        membership: { membership_status: 'active' },
      },
      select: {
        membership: { select: { user_id: true } },
      },
    });
  });

  it('should create reminder notifications when due dates match reminder_days', async () => {
    const event = buildEvent({
      due_date: new Date('2026-04-04T00:00:00.000Z'),
      reminder_days: [3, 7],
    });

    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));

    try {
      const mockPrisma = buildMockPrisma({
        adminUserIdsByTenant: { [TENANT_A_ID]: [ADMIN_USER_A] },
        overdueByTenant: { [TENANT_A_ID]: [] },
        upcomingByTenant: { [TENANT_A_ID]: [event] },
      });
      const processor = new RegulatoryDeadlineCheckProcessor(mockPrisma as never);

      await processor.process(buildJob());

      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          channel: 'in_app',
          payload_json: expect.objectContaining({
            days_until: 3,
            domain: 'tusla',
            event_id: EVENT_ID,
            event_title: 'Tusla return',
          }),
          recipient_user_id: ADMIN_USER_A,
          source_entity_id: EVENT_ID,
          source_entity_type: 'regulatory_calendar_event',
          status: 'delivered',
          template_key: 'regulatory_deadline_reminder',
          tenant_id: TENANT_A_ID,
        }),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('should skip reminder creation when a matching notification already exists', async () => {
    const event = buildEvent();
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));

    try {
      const mockPrisma = buildMockPrisma({
        adminUserIdsByTenant: { [TENANT_A_ID]: [ADMIN_USER_A] },
        existingNotificationKeys: [
          notificationKey(TENANT_A_ID, ADMIN_USER_A, 'regulatory_deadline_reminder', EVENT_ID),
        ],
        overdueByTenant: { [TENANT_A_ID]: [] },
        upcomingByTenant: { [TENANT_A_ID]: [event] },
      });
      const processor = new RegulatoryDeadlineCheckProcessor(mockPrisma as never);

      await processor.process(buildJob());

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('should create overdue notifications for all admin users', async () => {
    const event = buildEvent({
      due_date: new Date('2026-03-25T00:00:00.000Z'),
    });
    jest.useFakeTimers().setSystemTime(new Date('2026-04-01T12:00:00.000Z'));

    try {
      const mockPrisma = buildMockPrisma({
        adminUserIdsByTenant: { [TENANT_A_ID]: [ADMIN_USER_A, ADMIN_USER_B] },
        overdueByTenant: { [TENANT_A_ID]: [event] },
        upcomingByTenant: { [TENANT_A_ID]: [] },
      });
      const processor = new RegulatoryDeadlineCheckProcessor(mockPrisma as never);

      await processor.process(buildJob());

      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recipient_user_id: ADMIN_USER_A,
          template_key: 'regulatory_deadline_overdue',
        }),
      });
      expect(mockPrisma.notification.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          recipient_user_id: ADMIN_USER_B,
          template_key: 'regulatory_deadline_overdue',
        }),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it('should skip notifications when no admin users exist for a tenant', async () => {
    const mockPrisma = buildMockPrisma({
      adminUserIdsByTenant: { [TENANT_A_ID]: [] },
      upcomingByTenant: { [TENANT_A_ID]: [buildEvent()] },
    });
    const processor = new RegulatoryDeadlineCheckProcessor(mockPrisma as never);

    await processor.process(buildJob());

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });
});
