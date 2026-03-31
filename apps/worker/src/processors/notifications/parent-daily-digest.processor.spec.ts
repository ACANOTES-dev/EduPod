import { Test } from '@nestjs/testing';
import type { Job } from 'bullmq';

import {
  PARENT_DAILY_DIGEST_JOB,
  ParentDailyDigestProcessor,
} from './parent-daily-digest.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID_2 = 'cccccccc-cccc-cccc-cccc-dddddddddddd';
const PARENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PARENT_USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const HOUSEHOLD_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue(null),
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

/** Returns the current UTC hour so the send_hour_utc always matches. */
function currentUtcHour(): number {
  return new Date().getUTCHours();
}

/** Build enabled digest tenant settings with all sections on by default. */
function buildDigestSettings(overrides: Record<string, unknown> = {}) {
  return {
    settings: {
      parent_digest: {
        enabled: true,
        send_hour_utc: currentUtcHour(),
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

/** Build an active student-parent link with includes. */
function buildStudentParentLink(
  overrides: {
    parentId?: string;
    parentUserId?: string | null;
    parentStatus?: string;
    parentChannels?: string[];
    studentId?: string;
    studentStatus?: string;
    studentFirstName?: string;
    studentLastName?: string;
    studentFullName?: string | null;
    studentFullNameAr?: string | null;
    householdId?: string;
  } = {},
) {
  return {
    tenant_id: TENANT_ID,
    parent: {
      id: overrides.parentId ?? PARENT_ID,
      user_id: overrides.parentUserId !== undefined ? overrides.parentUserId : PARENT_USER_ID,
      status: overrides.parentStatus ?? 'active',
      preferred_contact_channels: overrides.parentChannels ?? [],
    },
    student: {
      id: overrides.studentId ?? STUDENT_ID,
      first_name: overrides.studentFirstName ?? 'Ahmed',
      last_name: overrides.studentLastName ?? 'Hassan',
      full_name: overrides.studentFullName !== undefined ? overrides.studentFullName : null,
      full_name_ar: overrides.studentFullNameAr !== undefined ? overrides.studentFullNameAr : null,
      status: overrides.studentStatus ?? 'active',
      household_id: overrides.householdId ?? HOUSEHOLD_ID,
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

  // ─── Job routing ────────────────────────────────────────────────────────

  describe('process -- job routing', () => {
    it('should skip jobs with different name', async () => {
      const job = buildMockJob('some-other-job', { tenant_id: TENANT_ID });
      await processor.process(job);

      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.tenantSetting.findFirst).not.toHaveBeenCalled();
    });

    it('should process matching job name with tenant_id', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(buildDigestSettings());
      mockPrisma.studentParent.findMany.mockResolvedValue([]);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.$transaction).toHaveBeenCalled();
    });
  });

  // ─── Tenant validation ────────────────────────────────────────────────

  describe('process -- tenant validation', () => {
    it('should fall through to cross-tenant cron mode when tenant_id is missing', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {});
      await processor.process(job);

      // With no tenant_id, processor enters cross-tenant cron mode
      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        select: { id: true },
      });
    });

    it('should reject via TenantAwareJob.execute when tenant_id is invalid format', async () => {
      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: 'not-a-uuid',
      });

      await expect(processor.process(job)).rejects.toThrow('tenant_id');
    });
  });

  // ─── Settings gate ───────────────────────────────────────────────────

  describe('process -- settings gate', () => {
    it('should skip if digest enabled is false', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(buildDigestSettings({ enabled: false }));

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // Should not query student-parent links when digest is disabled
      expect(mockPrisma.studentParent.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should skip if tenant settings are missing (defaults to disabled)', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // Default parentDigestSettingsSchema has enabled: false
      expect(mockPrisma.studentParent.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Hour mismatch ───────────────────────────────────────────────────

  describe('process -- hour mismatch', () => {
    it('should skip if current UTC hour does not match send_hour_utc', async () => {
      // Set send_hour_utc to a value that will never match the current hour
      const wrongHour = (currentUtcHour() + 12) % 24;
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(
        buildDigestSettings({ send_hour_utc: wrongHour }),
      );

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.studentParent.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── No active links ─────────────────────────────────────────────────

  describe('process -- no active links', () => {
    it('should skip if no active student-parent links', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(buildDigestSettings());
      mockPrisma.studentParent.findMany.mockResolvedValue([]);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Happy path -- single child ───────────────────────────────────────

  describe('process -- happy path single child', () => {
    it('should create in_app notification with correct payload structure', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(buildDigestSettings());

      mockPrisma.studentParent.findMany.mockResolvedValue([buildStudentParentLink()]);

      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);

      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          tenant_id: TENANT_ID,
          derived_status: 'present',
          summary_date: new Date(),
        },
      ]);

      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourRecognitionAward.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });

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
            source_entity_type: 'parent_daily_digest',
            payload_json: expect.objectContaining({
              has_content: true,
              children: expect.arrayContaining([
                expect.objectContaining({
                  student_id: STUDENT_ID,
                  student_name: 'Ahmed Hassan',
                  attendance: { status: 'present' },
                  grades: [],
                  behaviour_incidents: [],
                  behaviour_awards: [],
                  homework: [],
                }),
              ]),
            }),
          }),
        }),
      );
    });
  });

  // ─── Happy path -- multi-child ────────────────────────────────────────

  describe('process -- happy path multi-child', () => {
    it('should create single notification with both children for same parent', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(buildDigestSettings());

      mockPrisma.studentParent.findMany.mockResolvedValue([
        buildStudentParentLink({
          studentId: STUDENT_ID,
          studentFirstName: 'Ahmed',
          studentLastName: 'Hassan',
        }),
        buildStudentParentLink({
          studentId: STUDENT_ID_2,
          studentFirstName: 'Sara',
          studentLastName: 'Hassan',
        }),
      ]);

      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);

      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourRecognitionAward.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // Single notification for one parent
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);

      const createCall = mockPrisma.notification.create.mock.calls[0][0] as {
        data: { payload_json: { children: Array<{ student_id: string }> } };
      };
      const children = createCall.data.payload_json.children;

      expect(children).toHaveLength(2);
      expect(children[0]!.student_id).toBe(STUDENT_ID);
      expect(children[1]!.student_id).toBe(STUDENT_ID_2);
    });
  });

  // ─── Locale resolution ────────────────────────────────────────────────

  describe('process -- locale resolution', () => {
    it('should use User.preferred_locale for notification locale', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(buildDigestSettings());

      mockPrisma.studentParent.findMany.mockResolvedValue([
        buildStudentParentLink({
          studentFullNameAr: '\u0623\u062D\u0645\u062F \u062D\u0633\u0646',
        }),
      ]);

      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'ar' }]);

      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourRecognitionAward.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });

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

  // ─── Channel routing ──────────────────────────────────────────────────

  describe('process -- channel routing', () => {
    it('should create notifications for each channel from preferred_contact_channels', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(buildDigestSettings());

      mockPrisma.studentParent.findMany.mockResolvedValue([
        buildStudentParentLink({
          parentChannels: ['email', 'whatsapp'],
        }),
      ]);

      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);

      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          tenant_id: TENANT_ID,
          derived_status: 'present',
          summary_date: new Date(),
        },
      ]);

      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourRecognitionAward.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // in_app (always) + email + whatsapp = 3 notifications
      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(3);

      const channels = mockPrisma.notification.create.mock.calls.map(
        (call) => (call[0] as { data: { channel: string } }).data.channel,
      );
      expect(channels).toContain('in_app');
      expect(channels).toContain('email');
      expect(channels).toContain('whatsapp');

      // in_app should be 'delivered', others should be 'queued'
      for (const call of mockPrisma.notification.create.mock.calls) {
        const data = (call[0] as { data: { channel: string; status: string } }).data;
        if (data.channel === 'in_app') {
          expect(data.status).toBe('delivered');
        } else {
          expect(data.status).toBe('queued');
        }
      }
    });
  });

  // ─── Deduplication ────────────────────────────────────────────────────

  describe('process -- deduplication', () => {
    it('should NOT create notification if one with template_key parent_daily_digest already exists today', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(buildDigestSettings());

      mockPrisma.studentParent.findMany.mockResolvedValue([buildStudentParentLink()]);

      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);

      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourRecognitionAward.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

      // Existing digest notification already sent today
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

  // ─── Section toggles ──────────────────────────────────────────────────

  describe('process -- section toggles', () => {
    it('should not query attendance when include_attendance is false', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(
        buildDigestSettings({ include_attendance: false }),
      );

      mockPrisma.studentParent.findMany.mockResolvedValue([buildStudentParentLink()]);

      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);

      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourRecognitionAward.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.dailyAttendanceSummary.findMany).not.toHaveBeenCalled();
    });

    it('should not query grades when include_grades is false', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(
        buildDigestSettings({ include_grades: false }),
      );

      mockPrisma.studentParent.findMany.mockResolvedValue([buildStudentParentLink()]);

      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);

      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourRecognitionAward.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.grade.findMany).not.toHaveBeenCalled();
    });

    it('should not query behaviour when include_behaviour is false', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(
        buildDigestSettings({ include_behaviour: false }),
      );

      mockPrisma.studentParent.findMany.mockResolvedValue([buildStudentParentLink()]);

      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);

      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.behaviourIncident.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.behaviourRecognitionAward.findMany).not.toHaveBeenCalled();
    });

    it('should not query homework when include_homework is false', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(
        buildDigestSettings({ include_homework: false }),
      );

      mockPrisma.studentParent.findMany.mockResolvedValue([buildStudentParentLink()]);

      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);

      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourRecognitionAward.findMany.mockResolvedValue([]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.classEnrolment.findMany).not.toHaveBeenCalled();
    });

    it('should query fees when include_fees is true', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(
        buildDigestSettings({ include_fees: true }),
      );

      mockPrisma.studentParent.findMany.mockResolvedValue([buildStudentParentLink()]);

      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);

      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourRecognitionAward.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);
      mockPrisma.tenant.findUnique.mockResolvedValue({
        currency_code: 'EUR',
      });
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          household_id: HOUSEHOLD_ID,
          balance_amount: 500,
        },
      ]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.invoice.findMany).toHaveBeenCalled();
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payload_json: expect.objectContaining({
              fees: expect.objectContaining({
                outstanding_count: 1,
                total_amount: 500,
                currency_code: 'EUR',
              }),
            }),
          }),
        }),
      );
    });
  });

  // ─── Parents without user_id ──────────────────────────────────────────

  describe('process -- parents without user account', () => {
    it('should skip parents without user_id', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(buildDigestSettings());

      // Parent with NO user_id -- not linked to a user account
      mockPrisma.studentParent.findMany.mockResolvedValue([
        buildStudentParentLink({ parentUserId: null }),
      ]);

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // Filtered out as no active links -- no user queries or notifications
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Inactive students ───────────────────────────────────────────────

  describe('process -- inactive students', () => {
    it('should filter out inactive students from digest', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(buildDigestSettings());

      // One active student, one inactive
      mockPrisma.studentParent.findMany.mockResolvedValue([
        buildStudentParentLink({
          studentId: STUDENT_ID,
          studentStatus: 'active',
        }),
        buildStudentParentLink({
          studentId: STUDENT_ID_2,
          studentStatus: 'inactive',
        }),
      ]);

      mockPrisma.user.findMany.mockResolvedValue([{ id: PARENT_USER_ID, preferred_locale: 'en' }]);

      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([]);
      mockPrisma.grade.findMany.mockResolvedValue([]);
      mockPrisma.behaviourIncident.findMany.mockResolvedValue([]);
      mockPrisma.behaviourRecognitionAward.findMany.mockResolvedValue([]);
      mockPrisma.classEnrolment.findMany.mockResolvedValue([]);
      mockPrisma.notification.findFirst.mockResolvedValue(null);
      mockPrisma.notification.create.mockResolvedValue({ id: 'notif-1' });

      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);

      const createCall = mockPrisma.notification.create.mock.calls[0][0] as {
        data: { payload_json: { children: Array<{ student_id: string }> } };
      };
      const children = createCall.data.payload_json.children;

      // Only the active student should be in the digest
      expect(children).toHaveLength(1);
      expect(children[0]!.student_id).toBe(STUDENT_ID);
    });
  });

  // ─── Cross-tenant cron mode ───────────────────────────────────────────

  describe('process -- cross-tenant cron mode', () => {
    it('should iterate all active tenants when no tenant_id in payload', async () => {
      const TENANT_ID_2 = '22222222-2222-2222-2222-222222222222';

      // The processor calls prisma.tenant.findMany directly (not via tx)
      // but since $transaction passes txProxy, we need both
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: TENANT_ID }, { id: TENANT_ID_2 }]);

      // Settings: disabled by default -- both tenants will skip
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      // For cross-tenant mode, the processor reads tenant_id as falsy
      // and iterates tenants. We need to allow $transaction for each.
      const job = buildMockJob(PARENT_DAILY_DIGEST_JOB, {
        tenant_id: undefined,
      });
      // Force data to actually be missing tenant_id
      (job.data as Record<string, unknown>).tenant_id = undefined;

      await processor.process(job);

      // Should query active tenants
      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        select: { id: true },
      });

      // Should have called $transaction twice (once per tenant)
      expect(mockPrisma.$transaction).toHaveBeenCalledTimes(2);
    });
  });
});
