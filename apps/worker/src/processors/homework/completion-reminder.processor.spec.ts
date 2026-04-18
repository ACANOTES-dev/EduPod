import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';

import {
  HOMEWORK_COMPLETION_REMINDER_JOB,
  HomeworkCompletionReminderProcessor,
} from './completion-reminder.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ASSIGNMENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID_1 = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STUDENT_ID_2 = 'cccccccc-cccc-cccc-cccc-dddddddddddd';
const PARENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PARENT_USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Helpers ────────────────────────────────────────────────────────────────

function tomorrow(): Date {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date;
}

function buildAssignment(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSIGNMENT_ID,
    tenant_id: TENANT_ID,
    class_id: CLASS_ID,
    title: 'Science Project',
    description: 'Complete the volcano experiment',
    homework_type: 'project_work',
    status: 'published',
    due_date: tomorrow(),
    published_at: new Date('2026-03-28T10:00:00Z'),
    class_entity: {
      id: CLASS_ID,
      name: 'Year 5 Science',
    },
    ...overrides,
  };
}

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    tenant: {
      findMany: jest.fn().mockResolvedValue([{ id: TENANT_ID }]),
    },
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          homework: {
            enabled: true,
            completion_reminder_enabled: true,
          },
        },
      }),
    },
    homeworkAssignment: {
      findMany: jest.fn().mockResolvedValue([]),
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

function buildMockJob(name: string, data: Record<string, unknown> = {}): Job {
  return { name, data } as unknown as Job;
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('HomeworkCompletionReminderProcessor', () => {
  let processor: HomeworkCompletionReminderProcessor;
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
      providers: [
        HomeworkCompletionReminderProcessor,
        { provide: 'PRISMA_CLIENT', useValue: mockPrisma },
      ],
    }).compile();

    processor = module.get<HomeworkCompletionReminderProcessor>(
      HomeworkCompletionReminderProcessor,
    );
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Job routing ────────────────────────────────────────────────────────

  describe('process — job routing', () => {
    it('should skip jobs with different name', async () => {
      const job = buildMockJob('some-other-job');
      await processor.process(job);

      expect(mockPrisma.tenantSetting.findFirst).not.toHaveBeenCalled();
    });

    it('should process matching job name with tenant_id', async () => {
      const job = buildMockJob(HOMEWORK_COMPLETION_REMINDER_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.tenantSetting.findFirst).toHaveBeenCalled();
    });
  });

  // ─── Cross-tenant fan-out (DZ-Homework-1 fix) ─────────────────────────

  describe('process — cross-tenant fan-out', () => {
    it('iterates active tenants when payload is empty', async () => {
      const tenantA = '22222222-2222-2222-2222-222222222222';
      const tenantB = '33333333-3333-3333-3333-333333333333';
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: tenantA }, { id: tenantB }]);

      const job = buildMockJob(HOMEWORK_COMPLETION_REMINDER_JOB, {});
      await processor.process(job);

      expect(mockPrisma.tenant.findMany).toHaveBeenCalledWith({
        where: { status: 'active' },
        select: { id: true },
      });
      expect(mockPrisma.tenantSetting.findFirst).toHaveBeenCalledTimes(2);
    });

    it('continues when one tenant throws', async () => {
      const tenantA = '22222222-2222-2222-2222-222222222222';
      const tenantB = '33333333-3333-3333-3333-333333333333';
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: tenantA }, { id: tenantB }]);
      mockPrisma.tenantSetting.findFirst
        .mockRejectedValueOnce(new Error('db hiccup'))
        .mockResolvedValueOnce({
          settings: {
            homework: { enabled: true, completion_reminder_enabled: true },
          },
        });

      const job = buildMockJob(HOMEWORK_COMPLETION_REMINDER_JOB, {});
      await expect(processor.process(job)).resolves.toBeUndefined();
    });
  });

  // ─── Legacy direct enqueue (still supported) ──────────────────────────

  describe('process — direct tenant enqueue', () => {
    it('processes a single tenant when tenant_id is supplied', async () => {
      const job = buildMockJob(HOMEWORK_COMPLETION_REMINDER_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.tenant.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.tenantSetting.findFirst).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Settings gate ────────────────────────────────────────────────────

  describe('process — settings gate', () => {
    it('should skip if completion_reminder_enabled is false', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: {
          homework: {
            enabled: true,
            completion_reminder_enabled: false,
          },
        },
      });

      const job = buildMockJob(HOMEWORK_COMPLETION_REMINDER_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // Should not query assignments when reminders are disabled
      expect(mockPrisma.homeworkAssignment.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should skip if homework module is not enabled and reminders disabled', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: {
          homework: {
            enabled: false,
            completion_reminder_enabled: false,
          },
        },
      });

      const job = buildMockJob(HOMEWORK_COMPLETION_REMINDER_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.homeworkAssignment.findMany).not.toHaveBeenCalled();
    });

    it('should proceed with defaults when tenant settings are missing', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      const job = buildMockJob(HOMEWORK_COMPLETION_REMINDER_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // Default settings have completion_reminder_enabled: true, so
      // the processor proceeds to query assignments (which returns empty by default)
      expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalled();
      // No notifications because there are no assignments
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Reminder for incomplete homework ─────────────────────────────────

  describe('process — incomplete homework reminders', () => {
    it('should send reminder for students with incomplete homework due tomorrow', async () => {
      // Assignments due tomorrow
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([buildAssignment()]);

      // Students enrolled in the class
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID_1,
          class_id: CLASS_ID,
          student: {
            id: STUDENT_ID_1,
            first_name: 'Ahmed',
            last_name: 'Hassan',
            full_name: 'Ahmed Hassan',
          },
        },
      ]);

      // No completion record for this student — homework is not done
      mockPrisma.homeworkCompletion.findMany.mockResolvedValue([]);

      // Parents of the student
      mockPrisma.studentParent.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID_1,
          parent: {
            id: PARENT_ID,
            user_id: PARENT_USER_ID,
            status: 'active',
          },
        },
      ]);

      // No existing notification — not a duplicate
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(HOMEWORK_COMPLETION_REMINDER_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // Should create a reminder notification for the parent
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            recipient_user_id: PARENT_USER_ID,
          }),
        }),
      );
    });

    it('should not send reminder for students who have completed homework', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([buildAssignment()]);

      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID_1,
          class_id: CLASS_ID,
          student: {
            id: STUDENT_ID_1,
            first_name: 'Ahmed',
            last_name: 'Hassan',
            full_name: 'Ahmed Hassan',
          },
        },
      ]);

      // Student has completed the homework
      mockPrisma.homeworkCompletion.findMany.mockResolvedValue([
        {
          id: 'completion-1',
          homework_assignment_id: ASSIGNMENT_ID,
          student_id: STUDENT_ID_1,
          status: 'completed',
          completed_at: new Date(),
        },
      ]);

      const job = buildMockJob(HOMEWORK_COMPLETION_REMINDER_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // Should NOT send reminder — homework is completed
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should include students with no completion record', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([buildAssignment()]);

      // Two students enrolled
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID_1,
          class_id: CLASS_ID,
          student: {
            id: STUDENT_ID_1,
            first_name: 'Ahmed',
            last_name: 'Hassan',
            full_name: 'Ahmed Hassan',
          },
        },
        {
          student_id: STUDENT_ID_2,
          class_id: CLASS_ID,
          student: {
            id: STUDENT_ID_2,
            first_name: 'Fatima',
            last_name: 'Ali',
            full_name: 'Fatima Ali',
          },
        },
      ]);

      // Only student 1 has a completion record (in_progress, not completed)
      mockPrisma.homeworkCompletion.findMany.mockResolvedValue([
        {
          id: 'completion-1',
          homework_assignment_id: ASSIGNMENT_ID,
          student_id: STUDENT_ID_1,
          status: 'in_progress',
          completed_at: null,
        },
      ]);

      // Both students have the same parent
      mockPrisma.studentParent.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID_1,
          parent: {
            id: PARENT_ID,
            user_id: PARENT_USER_ID,
            status: 'active',
          },
        },
        {
          student_id: STUDENT_ID_2,
          parent: {
            id: PARENT_ID,
            user_id: PARENT_USER_ID,
            status: 'active',
          },
        },
      ]);

      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(HOMEWORK_COMPLETION_REMINDER_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // Should create notification — both students are incomplete (student 2 has
      // no record at all, student 1 is in_progress)
      expect(mockPrisma.notification.create).toHaveBeenCalled();
    });
  });

  // ─── Idempotency ──────────────────────────────────────────────────────

  describe('process — idempotency', () => {
    it('should not send duplicate notifications (idempotency)', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([buildAssignment()]);

      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID_1,
          class_id: CLASS_ID,
          student: {
            id: STUDENT_ID_1,
            first_name: 'Ahmed',
            last_name: 'Hassan',
            full_name: 'Ahmed Hassan',
          },
        },
      ]);

      mockPrisma.homeworkCompletion.findMany.mockResolvedValue([]);

      mockPrisma.studentParent.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID_1,
          parent: {
            id: PARENT_ID,
            user_id: PARENT_USER_ID,
            status: 'active',
          },
        },
      ]);

      // Existing notification already sent
      mockPrisma.notification.findFirst.mockResolvedValue({
        id: 'existing-reminder-notif',
        template_key: 'homework_completion_reminder',
      });

      const job = buildMockJob(HOMEWORK_COMPLETION_REMINDER_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      // Should NOT create new notification — duplicate exists
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── No assignments due tomorrow ──────────────────────────────────────

  describe('process — no assignments', () => {
    it('should return early if no published assignments due tomorrow', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const job = buildMockJob(HOMEWORK_COMPLETION_REMINDER_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(mockPrisma.classEnrolment.findMany).not.toHaveBeenCalled();
    });
  });

  // ─── Logging ──────────────────────────────────────────────────────────

  describe('process — logging', () => {
    it('should log completion summary', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const logSpy = jest.spyOn(processor['logger'], 'log');

      const job = buildMockJob(HOMEWORK_COMPLETION_REMINDER_JOB, {
        tenant_id: TENANT_ID,
      });
      await processor.process(job);

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('reminder'));
    });
  });
});
