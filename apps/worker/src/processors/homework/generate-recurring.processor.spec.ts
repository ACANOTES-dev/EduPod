import { Job } from 'bullmq';

import {
  HOMEWORK_GENERATE_RECURRING_JOB,
  HomeworkGenerateRecurringProcessor,
} from './generate-recurring.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID_1 = '11111111-1111-1111-1111-111111111111';
const TENANT_ID_2 = '22222222-2222-2222-2222-222222222222';
const RULE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TEMPLATE_ASSIGNMENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLASS_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const ACADEMIC_YEAR_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get the current day of week as JS getDay() returns (0=Sunday, 6=Saturday) */
function todayDayOfWeek(): number {
  return new Date().getDay();
}

function buildRecurrenceRule(overrides: Record<string, unknown> = {}) {
  return {
    id: RULE_ID,
    tenant_id: TENANT_ID_1,
    frequency: 'weekly',
    interval: 1,
    days_of_week: [todayDayOfWeek()],
    start_date: new Date('2026-01-01'),
    end_date: null,
    active: true,
    assignments: [
      {
        id: TEMPLATE_ASSIGNMENT_ID,
        tenant_id: TENANT_ID_1,
        class_id: CLASS_ID,
        academic_year_id: ACADEMIC_YEAR_ID,
        assigned_by_user_id: USER_ID,
        title: 'Weekly Reading',
        description: 'Read chapter 5',
        homework_type: 'reading',
        status: 'published',
        max_points: null,
      },
    ],
    ...overrides,
  };
}

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          homework: {
            enabled: true,
          },
        },
      }),
    },
    schoolClosure: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    homeworkRecurrenceRule: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    homeworkAssignment: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockResolvedValue({ id: 'new-assignment-id' }),
    },
    $transaction: jest.fn(),
    $executeRaw: jest.fn().mockResolvedValue(undefined),
  };
}

type MockPrisma = ReturnType<typeof buildMockPrisma>;

function buildMockJob(
  name: string,
  data: Record<string, unknown> = {},
): Job {
  return { name, data } as unknown as Job;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('HomeworkGenerateRecurringProcessor', () => {
  let processor: HomeworkGenerateRecurringProcessor;
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = buildMockPrisma();

    // Default $transaction: execute the callback, passing mockPrisma as tx
    mockPrisma.$transaction.mockImplementation(
      async (fn: (tx: MockPrisma) => Promise<unknown>) => {
        const txProxy: MockPrisma = {
          ...mockPrisma,
          $executeRaw: jest.fn().mockResolvedValue(undefined),
        };
        return fn(txProxy);
      },
    );

    processor = new HomeworkGenerateRecurringProcessor(mockPrisma as never);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Job routing ────────────────────────────────────────────────────────

  describe('process — job routing', () => {
    it('should skip jobs with different name', async () => {
      const job = buildMockJob('some-other-job');
      await processor.process(job);

      expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
    });

    it('should process matching job name', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([]);
      const job = buildMockJob(HOMEWORK_GENERATE_RECURRING_JOB);
      await processor.process(job);

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ status: 'active' }),
        }),
      );
    });
  });

  // ─── Tenant iteration ─────────────────────────────────────────────────

  describe('process — tenant iteration', () => {
    it('should iterate all active tenants with homework enabled', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
        { id: TENANT_ID_2, name: 'School B' },
      ]);

      mockPrisma.homeworkRecurrenceRule.findMany.mockResolvedValue([]);

      const job = buildMockJob(HOMEWORK_GENERATE_RECURRING_JOB);
      await processor.process(job);

      // Both tenants should have their recurrence rules queried
      expect(mockPrisma.homeworkRecurrenceRule.findMany).toHaveBeenCalledTimes(2);
    });

    it('should continue processing if one tenant fails', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
        { id: TENANT_ID_2, name: 'School B' },
      ]);

      let callCount = 0;
      mockPrisma.homeworkRecurrenceRule.findMany.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Database connection lost');
        }
        return [];
      });

      const job = buildMockJob(HOMEWORK_GENERATE_RECURRING_JOB);
      // Should not throw — error is caught and logged
      await processor.process(job);

      // Both tenants were attempted
      expect(mockPrisma.homeworkRecurrenceRule.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ─── School closures ──────────────────────────────────────────────────

  describe('process — school closures', () => {
    it('should skip tenants with school closures for today', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
      ]);

      // School closure exists for today
      mockPrisma.schoolClosure.findFirst.mockResolvedValue({
        id: 'closure-1',
        tenant_id: TENANT_ID_1,
        closure_date: new Date(),
        reason: 'Snow day',
        affects_scope: 'all',
      });

      const job = buildMockJob(HOMEWORK_GENERATE_RECURRING_JOB);
      await processor.process(job);

      // Should NOT query recurrence rules — tenant is closed
      expect(mockPrisma.homeworkRecurrenceRule.findMany).not.toHaveBeenCalled();
    });

    it('should process tenants without school closures', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
      ]);

      // No closure for today
      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);
      mockPrisma.homeworkRecurrenceRule.findMany.mockResolvedValue([]);

      const job = buildMockJob(HOMEWORK_GENERATE_RECURRING_JOB);
      await processor.process(job);

      expect(mockPrisma.homeworkRecurrenceRule.findMany).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Recurrence rule processing ───────────────────────────────────────

  describe('process — recurrence rule processing', () => {
    it('should create draft assignment from recurrence rule template', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
      ]);

      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      // Active rule matching today's day of week
      mockPrisma.homeworkRecurrenceRule.findMany.mockResolvedValue([
        buildRecurrenceRule(),
      ]);

      // No existing assignment for today (not a duplicate) — first call
      // Template lookup — second call
      mockPrisma.homeworkAssignment.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: TEMPLATE_ASSIGNMENT_ID,
          class_id: CLASS_ID,
          subject_id: null,
          academic_year_id: ACADEMIC_YEAR_ID,
          academic_period_id: null,
          assigned_by_user_id: USER_ID,
          title: 'Weekly Reading',
          description: 'Read chapter 5',
          homework_type: 'reading',
          due_time: null,
          max_points: null,
        });

      const job = buildMockJob(HOMEWORK_GENERATE_RECURRING_JOB);
      await processor.process(job);

      // Should create a new assignment based on the template
      expect(mockPrisma.homeworkAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID_1,
            class_id: CLASS_ID,
            title: 'Weekly Reading',
            homework_type: 'reading',
            status: 'draft',
            recurrence_rule_id: RULE_ID,
          }),
        }),
      );
    });

    it('should skip rules where today is not in days_of_week', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
      ]);

      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      // Rule with a day_of_week that does NOT match today
      const otherDay = (todayDayOfWeek() + 3) % 7;
      mockPrisma.homeworkRecurrenceRule.findMany.mockResolvedValue([
        buildRecurrenceRule({ days_of_week: [otherDay] }),
      ]);

      const job = buildMockJob(HOMEWORK_GENERATE_RECURRING_JOB);
      await processor.process(job);

      // Should NOT create any assignment
      expect(mockPrisma.homeworkAssignment.create).not.toHaveBeenCalled();
    });
  });

  // ─── Idempotency ──────────────────────────────────────────────────────

  describe('process — idempotency', () => {
    it('should skip if assignment already exists for today (idempotent)', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
      ]);

      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      mockPrisma.homeworkRecurrenceRule.findMany.mockResolvedValue([
        buildRecurrenceRule(),
      ]);

      // Assignment already exists for today — duplicate
      mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
        id: 'existing-assignment-id',
        tenant_id: TENANT_ID_1,
        recurrence_rule_id: RULE_ID,
        due_date: new Date(),
      });

      const job = buildMockJob(HOMEWORK_GENERATE_RECURRING_JOB);
      await processor.process(job);

      // Should NOT create a new assignment — one already exists for today
      expect(mockPrisma.homeworkAssignment.create).not.toHaveBeenCalled();
    });
  });

  // ─── Inactive and expired rules ───────────────────────────────────────

  describe('process — inactive and expired rules', () => {
    it('should not process inactive rules', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
      ]);

      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      // Inactive rule
      mockPrisma.homeworkRecurrenceRule.findMany.mockResolvedValue([
        buildRecurrenceRule({ active: false }),
      ]);

      const job = buildMockJob(HOMEWORK_GENERATE_RECURRING_JOB);
      await processor.process(job);

      expect(mockPrisma.homeworkAssignment.create).not.toHaveBeenCalled();
    });

    it('should not process rules past their end_date', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
      ]);

      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Rule whose end_date has passed
      mockPrisma.homeworkRecurrenceRule.findMany.mockResolvedValue([
        buildRecurrenceRule({ end_date: yesterday }),
      ]);

      const job = buildMockJob(HOMEWORK_GENERATE_RECURRING_JOB);
      await processor.process(job);

      expect(mockPrisma.homeworkAssignment.create).not.toHaveBeenCalled();
    });
  });

  // ─── Logging ──────────────────────────────────────────────────────────

  describe('process — logging', () => {
    it('should log completion summary', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
      ]);

      mockPrisma.schoolClosure.findFirst.mockResolvedValue(null);
      mockPrisma.homeworkRecurrenceRule.findMany.mockResolvedValue([]);

      const logSpy = jest.spyOn(processor['logger'], 'log');

      const job = buildMockJob(HOMEWORK_GENERATE_RECURRING_JOB);
      await processor.process(job);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('recurring'),
      );
    });
  });
});
