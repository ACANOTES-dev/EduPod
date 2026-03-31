import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';

import {
  PARENT_DAILY_DIGEST_JOB,
  ParentDailyDigestProcessor,
} from './parent-daily-digest.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const TENANT_ID_2 = '22222222-2222-2222-2222-222222222222';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID_2 = 'cccccccc-cccc-cccc-cccc-dddddddddddd';
const PARENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PARENT_USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const HOUSEHOLD_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

/** Current UTC hour — keeps send_hour_utc in sync so tests never fail by clock. */
const NOW_HOUR = new Date().getUTCHours();

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          parent_digest: {
            enabled: true,
            send_hour_utc: NOW_HOUR,
            include_attendance: true,
            include_grades: true,
            include_behaviour: true,
            include_homework: true,
            include_fees: false,
          },
        },
      }),
    },
    studentParent: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    dailyAttendanceSummary: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    grade: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourIncident: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    behaviourRecognitionAward: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    classEnrolment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    homeworkAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    tenant: {
      findUnique: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    invoice: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    notification: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'notif-1' }),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

type MockPrisma = ReturnType<typeof buildMockPrisma>;

function buildMockJob(name: string, data: Record<string, unknown> = {}): Job {
  return { name, data } as unknown as Job;
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

function buildActiveStudentParentLink(overrides: Record<string, unknown> = {}) {
  return {
    tenant_id: TENANT_ID,
    parent: {
      id: PARENT_ID,
      user_id: PARENT_USER_ID,
      status: 'active',
      preferred_contact_channels: [],
    },
    student: {
      id: STUDENT_ID,
      first_name: 'Ahmed',
      last_name: 'Hassan',
      full_name: 'Ahmed Hassan',
      full_name_ar: null,
      status: 'active',
      household_id: HOUSEHOLD_ID,
    },
    ...overrides,
  };
}

function buildDefaultSettings(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      parent_digest: {
        enabled: true,
        send_hour_utc: NOW_HOUR,
        include_attendance: true,
        include_grades: true,
        include_behaviour: true,
        include_homework: true,
        include_fees: false,
        ...overrides,
      },
    },
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('ParentDailyDigestProcessor', () => {
  let processor: ParentDailyDigestProcessor;
  let mockPrisma: MockPrisma;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    // Default $transaction: execute the callback, passing mockPrisma as tx
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: MockPrisma) => Promise<unknown>) => {
      const txProxy: MockPrisma = {
        ...mockPrisma,
        $executeRaw: jest.fn().mockResolvedValue(undefined),
      };
      return fn(txProxy);
    });

    const module = await Test.createTestingModule({
      providers: [ParentDailyDigestProcessor, { provide: 'PRISMA_CLIENT', useValue: mockPrisma }],
    }).compile();

    processor = module.get<ParentDailyDigestProcessor>(ParentDailyDigestProcessor);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Job routing ──────────────────────────────────────────────────────────

  describe('process — job routing', () => {
    it('should skip jobs with different name', async () => {
      const job = buildMockJob('some-other-job', { tenant_id: TENANT_ID });
      await processor.process(job);

      expect(mockPrisma.tenantSetting.findFirst).not.toHaveBeenCalled();
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    });

    it('should process matching job name with tenant_id', async () => {
      mockPrisma.studentParent.findMany.mockResolvedValue([buildActiveStudentParentLink()]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  // ─── Tenant validation ────────────────────────────────────────────────────

  describe('process — tenant validation', () => {
    it('should fall through to cross-tenant cron mode when tenant_id is missing', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {});
      await processor.process(job);

      // Processor iterates tenants — none found, so no work done
      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        select: { id: true },
      });
    });

    it('should reject via TenantAwareJob.execute when tenant_id is invalid UUID format', async () => {
      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: 'not-a-uuid',
      });

      await expect(processor.process(job)).rejects.toThrow('invalid tenant_id format');
    });
  });

  // ─── Settings gate ────────────────────────────────────────────────────────

  describe('process — settings gate', () => {
    it('should skip if digest enabled is false', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(
        buildDefaultSettings({ enabled: false }),
      );

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.studentParent.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should skip if tenant settings are missing (defaults to disabled)', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // When settings are null, rawSettings.parent_digest is undefined,
      // schema parses {} -> enabled defaults to false -> skip
      expect(mockPrisma.studentParent.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Hour mismatch ────────────────────────────────────────────────────────

  describe('process — hour mismatch', () => {
    it('should skip if current UTC hour does not match send_hour_utc', async () => {
      const mismatchedHour = (NOW_HOUR + 1) % 24;
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(
        buildDefaultSettings({ send_hour_utc: mismatchedHour }),
      );

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.studentParent.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── No active links ─────────────────────────────────────────────────────

  describe('process — no active links', () => {
    it('should skip if no active student-parent links', async () => {
      mockPrisma.studentParent.findMany.mockResolvedValue([]);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Happy path — single child ───────────────────────────────────────────

  describe('process — happy path single child', () => {
    it('should create in_app notification with correct payload structure', async () => {
      mockPrisma.studentParent.findMany.mockResolvedValue([buildActiveStudentParentLink()]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);
      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          tenant_id: TENANT_ID,
          derived_status: 'present',
          summary_date: new Date(),
        },
      ]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            recipient_user_id: PARENT_USER_ID,
            channel: 'in_app',
            template_key: 'parent_daily_digest',
            locale: 'en',
            status: 'delivered',
            payload_json: expect.objectContaining({
              has_content: true,
              children: expect.arrayContaining([
                expect.objectContaining({
                  student_id: STUDENT_ID,
                  student_name: 'Ahmed Hassan',
                  attendance: { status: 'present' },
                }),
              ]),
            }),
          }),
        }),
      );
    });
  });

  // ─── Happy path — multi-child ────────────────────────────────────────────

  describe('process — happy path multi-child', () => {
    it('should create single notification with both children in payload', async () => {
      mockPrisma.studentParent.findMany.mockResolvedValue([
        buildActiveStudentParentLink(),
        buildActiveStudentParentLink({
          student: {
            id: STUDENT_ID_2,
            first_name: 'Fatima',
            last_name: 'Hassan',
            full_name: 'Fatima Hassan',
            full_name_ar: null,
            status: 'active',
            household_id: HOUSEHOLD_ID,
          },
        }),
      ]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload_json: expect.objectContaining({
              children: expect.arrayContaining([
                expect.objectContaining({ student_id: STUDENT_ID }),
                expect.objectContaining({ student_id: STUDENT_ID_2 }),
              ]),
            }),
          }),
        }),
      );
    });
  });

  // ─── Locale resolution ────────────────────────────────────────────────────

  describe('process — locale resolution', () => {
    it('should use User.preferred_locale for notification locale field', async () => {
      mockPrisma.studentParent.findMany.mockResolvedValue([buildActiveStudentParentLink()]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'ar' }]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            locale: 'ar',
          }),
        }),
      );
    });
  });

  // ─── Channel routing ─────────────────────────────────────────────────────

  describe('process — channel routing', () => {
    it('should create notifications for each channel with correct status', async () => {
      mockPrisma.studentParent.findMany.mockResolvedValue([
        buildActiveStudentParentLink({
          parent: {
            id: PARENT_ID,
            user_id: PARENT_USER_ID,
            status: 'active',
            preferred_contact_channels: ['email'],
          },
        }),
      ]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // in_app (always) + email = 2 notifications
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(2);

      // in_app gets 'delivered'
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: 'in_app',
            status: 'delivered',
          }),
        }),
      );

      // email gets 'queued'
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            channel: 'email',
            status: 'queued',
          }),
        }),
      );
    });
  });

  // ─── Deduplication ────────────────────────────────────────────────────────

  describe('process — deduplication', () => {
    it('should NOT create notification when digest already exists for today', async () => {
      mockPrisma.studentParent.findMany.mockResolvedValue([buildActiveStudentParentLink()]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);
      // Existing digest already sent today
      mockPrisma.notification.findFirst.mockResolvedValue({
        id: 'existing-digest-notif',
      });

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Section toggles ─────────────────────────────────────────────────────

  describe('process — section toggles', () => {
    beforeEach(() => {
      mockPrisma.studentParent.findMany.mockResolvedValue([buildActiveStudentParentLink()]);
      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);
    });

    it('should NOT call dailyAttendanceSummary.findMany when include_attendance is false', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(
        buildDefaultSettings({ include_attendance: false }),
      );

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.dailyAttendanceSummary.findMany).not.toHaveBeenCalled();
    });

    it('should NOT call grade.findMany when include_grades is false', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(
        buildDefaultSettings({ include_grades: false }),
      );

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.grade.findMany).not.toHaveBeenCalled();
    });

    it('should NOT call behaviourIncident or behaviourRecognitionAward when include_behaviour is false', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(
        buildDefaultSettings({ include_behaviour: false }),
      );

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.behaviourIncident.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.behaviourRecognitionAward.findMany).not.toHaveBeenCalled();
    });

    it('should NOT call classEnrolment or homeworkAssignment when include_homework is false', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(
        buildDefaultSettings({ include_homework: false }),
      );

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.classEnrolment.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.homeworkAssignment.findMany).not.toHaveBeenCalled();
    });

    it('should call invoice.findMany and tenant.findUnique when include_fees is true', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(
        buildDefaultSettings({ include_fees: true }),
      );
      mockPrisma.tenant.findUnique.mockResolvedValue({
        currency_code: 'EUR',
      });
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          household_id: HOUSEHOLD_ID,
          balance_amount: 250.0,
        },
      ]);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.tenant.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: TENANT_ID },
          select: { currency_code: true },
        }),
      );
      expect(mockPrisma.invoice.findMany).toHaveBeenCalled();

      // Verify fees are included in the payload
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload_json: expect.objectContaining({
              fees: expect.objectContaining({
                outstanding_count: 1,
                total_amount: 250.0,
                currency_code: 'EUR',
              }),
            }),
          }),
        }),
      );
    });
  });

  // ─── Parents without user_id ──────────────────────────────────────────────

  describe('process — parents without user_id', () => {
    it('should filter out parents with user_id: null, no notification created', async () => {
      mockPrisma.studentParent.findMany.mockResolvedValue([
        buildActiveStudentParentLink({
          parent: {
            id: PARENT_ID,
            user_id: null,
            status: 'active',
            preferred_contact_channels: [],
          },
        }),
      ]);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // Parent filtered out, no active links -> no user query, no notification
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Inactive students ───────────────────────────────────────────────────

  describe('process — inactive students', () => {
    it('should filter out students with status !== active from digest children', async () => {
      mockPrisma.studentParent.findMany.mockResolvedValue([
        buildActiveStudentParentLink({
          student: {
            id: STUDENT_ID,
            first_name: 'Ahmed',
            last_name: 'Hassan',
            full_name: 'Ahmed Hassan',
            full_name_ar: null,
            status: 'withdrawn',
            household_id: HOUSEHOLD_ID,
          },
        }),
      ]);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // Student filtered out as inactive -> no active links -> skip
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Cross-tenant cron mode ───────────────────────────────────────────────

  describe('process — cross-tenant cron mode', () => {
    it('should iterate all active tenants when no tenant_id in payload', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_ID }, { id: TENANT_ID_2 }]);

      // Both tenants have digest enabled
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(buildDefaultSettings());

      // No active links for either tenant -> no notifications, but both processed
      mockPrisma.studentParent.findMany.mockResolvedValue([]);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {});
      await processor.process(job);

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        select: { id: true },
      });

      // $transaction called once per tenant
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });
});
