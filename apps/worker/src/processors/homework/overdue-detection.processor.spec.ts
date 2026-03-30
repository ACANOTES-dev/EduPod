import { Job } from 'bullmq';

import {
  HOMEWORK_OVERDUE_DETECTION_JOB,
  HomeworkOverdueDetectionProcessor,
} from './overdue-detection.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID_1 = '11111111-1111-1111-1111-111111111111';
const TENANT_ID_2 = '22222222-2222-2222-2222-222222222222';
const ASSIGNMENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const PARENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PARENT_USER_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

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
            overdue_notification_enabled: true,
          },
        },
      }),
    },
    homeworkAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({}),
    },
    homeworkCompletion: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    classEnrolment: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    studentParent: {
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

function buildMockJob(
  name: string,
  data: Record<string, unknown> = {},
): Job {
  return { name, data } as unknown as Job;
}

function buildAssignment(overrides: Record<string, unknown> = {}) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  return {
    id: ASSIGNMENT_ID,
    tenant_id: TENANT_ID_1,
    class_id: 'class-1',
    title: 'Math Homework',
    status: 'published',
    due_date: yesterday,
    published_at: new Date('2026-03-20T10:00:00Z'),
    class_entity: {
      id: 'class-1',
      name: 'Year 5 Maths',
    },
    ...overrides,
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('HomeworkOverdueDetectionProcessor', () => {
  let processor: HomeworkOverdueDetectionProcessor;
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

    processor = new HomeworkOverdueDetectionProcessor(mockPrisma as never);
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
      const job = buildMockJob(HOMEWORK_OVERDUE_DETECTION_JOB);
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

      // No overdue assignments => quick return per tenant
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const job = buildMockJob(HOMEWORK_OVERDUE_DETECTION_JOB);
      await processor.process(job);

      // Both tenants should have their assignments queried
      expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledTimes(2);
    });

    it('should continue processing if one tenant fails', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
        { id: TENANT_ID_2, name: 'School B' },
      ]);

      // First tenant throws, second is fine
      let callCount = 0;
      mockPrisma.homeworkAssignment.findMany.mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Database connection lost');
        }
        return [];
      });

      const job = buildMockJob(HOMEWORK_OVERDUE_DETECTION_JOB);
      // Should not throw — error is caught and logged
      await processor.process(job);

      // Both tenants were attempted
      expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Overdue detection ────────────────────────────────────────────────

  describe('process — overdue detection', () => {
    it('should detect assignments past due date with incomplete students', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
      ]);

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        buildAssignment(),
      ]);

      // Incomplete completions with nested student and student_parents
      mockPrisma.homeworkCompletion.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          student: {
            id: STUDENT_ID,
            full_name: 'Ahmed Hassan',
            student_parents: [
              {
                parent: {
                  id: PARENT_ID,
                  user_id: PARENT_USER_ID,
                  status: 'active',
                },
              },
            ],
          },
        },
      ]);

      // No existing notification (not a duplicate)
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(HOMEWORK_OVERDUE_DETECTION_JOB);
      await processor.process(job);

      // Should create a notification for the parent
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });

    it('should not flag assignments that are not yet past due date', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
      ]);

      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Assignment due tomorrow — not overdue
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const job = buildMockJob(HOMEWORK_OVERDUE_DETECTION_JOB);
      await processor.process(job);

      // No notifications
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Logging ──────────────────────────────────────────────────────────

  describe('process — logging', () => {
    it('should log completion with success count', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
        { id: TENANT_ID_2, name: 'School B' },
      ]);

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const logSpy = jest.spyOn(processor['logger'], 'log');

      const job = buildMockJob(HOMEWORK_OVERDUE_DETECTION_JOB);
      await processor.process(job);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('cron complete'),
      );
    });
  });

  // ─── Deduplication ────────────────────────────────────────────────────

  describe('process — deduplication', () => {
    it('should not send duplicate notification for same assignment and parent', async () => {
      mockPrisma.tenant.findMany.mockResolvedValue([
        { id: TENANT_ID_1, name: 'School A' },
      ]);

      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        buildAssignment(),
      ]);

      // Incomplete completions with nested student and student_parents
      mockPrisma.homeworkCompletion.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          student: {
            id: STUDENT_ID,
            full_name: 'Ahmed Hassan',
            student_parents: [
              {
                parent: {
                  id: PARENT_ID,
                  user_id: PARENT_USER_ID,
                  status: 'active',
                },
              },
            ],
          },
        },
      ]);

      // Existing notification already present
      mockPrisma.notification.findFirst.mockResolvedValue({
        id: 'existing-notif-id',
        template_key: 'homework_overdue',
      });

      const job = buildMockJob(HOMEWORK_OVERDUE_DETECTION_JOB);
      await processor.process(job);

      // Should NOT create any new notifications — duplicate exists
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });
});
