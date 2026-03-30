import { Test } from '@nestjs/testing';
import { Job } from 'bullmq';

import {
  HOMEWORK_DIGEST_JOB,
  HomeworkDigestProcessor,
} from './digest-homework.processor';

// ─── Fixtures ───────────────────────────────────────────────────────────────

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const ASSIGNMENT_ID_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASSIGNMENT_ID_2 = 'aaaaaaaa-aaaa-aaaa-aaaa-bbbbbbbbbbbb';
const CLASS_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const PARENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const PARENT_USER_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

// ─── Mock Prisma ────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    tenantSetting: {
      findFirst: jest.fn().mockResolvedValue({
        settings: {
          homework: {
            enabled: true,
            parent_digest_include_homework: true,
          },
        },
      }),
    },
    homeworkAssignment: {
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

function buildPublishedAssignment(
  id: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id,
    tenant_id: TENANT_ID,
    class_id: CLASS_ID,
    title: `Homework ${id.slice(0, 4)}`,
    description: 'Complete exercises',
    homework_type: 'written',
    status: 'published',
    due_date: new Date(),
    published_at: new Date(),
    class_entity: {
      id: CLASS_ID,
      name: 'Year 5 Maths',
    },
    ...overrides,
  };
}

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('HomeworkDigestProcessor', () => {
  let processor: HomeworkDigestProcessor;
  let mockPrisma: MockPrisma;

  beforeEach(async () => {
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

    const module = await Test.createTestingModule({
      providers: [
        HomeworkDigestProcessor,
        { provide: 'PRISMA_CLIENT', useValue: mockPrisma },
      ],
    }).compile();

    processor = module.get<HomeworkDigestProcessor>(HomeworkDigestProcessor);
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
      const job = buildMockJob(HOMEWORK_DIGEST_JOB, { tenant_id: TENANT_ID });
      await processor.process(job);

      expect(mockPrisma.tenantSetting.findFirst).toHaveBeenCalled();
    });
  });

  // ─── Tenant validation ────────────────────────────────────────────────

  describe('process — tenant validation', () => {
    it('should reject jobs without tenant_id', async () => {
      const job = buildMockJob(HOMEWORK_DIGEST_JOB, {});

      await expect(processor.process(job)).rejects.toThrow('tenant_id');
    });
  });

  // ─── Settings gate ────────────────────────────────────────────────────

  describe('process — settings gate', () => {
    it('should skip if parent_digest_include_homework is false', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: {
          homework: {
            enabled: true,
            parent_digest_include_homework: false,
          },
        },
      });

      const job = buildMockJob(HOMEWORK_DIGEST_JOB, { tenant_id: TENANT_ID });
      await processor.process(job);

      // Should not query assignments when digest is disabled
      expect(mockPrisma.homeworkAssignment.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });

    it('should skip if homework module is not enabled and digest is also disabled', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue({
        settings: {
          homework: {
            enabled: false,
            parent_digest_include_homework: false,
          },
        },
      });

      const job = buildMockJob(HOMEWORK_DIGEST_JOB, { tenant_id: TENANT_ID });
      await processor.process(job);

      expect(mockPrisma.homeworkAssignment.findMany).not.toHaveBeenCalled();
    });

    it('should proceed with defaults when tenant settings are missing', async () => {
      mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

      const job = buildMockJob(HOMEWORK_DIGEST_JOB, { tenant_id: TENANT_ID });
      await processor.process(job);

      // Default settings have parent_digest_include_homework: true, so
      // the processor proceeds to query assignments (which returns empty by default)
      expect(mockPrisma.homeworkAssignment.findMany).toHaveBeenCalled();
      // No notifications because there are no assignments
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── No published assignments ─────────────────────────────────────────

  describe('process — no published assignments', () => {
    it('should return early if no published assignments', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const job = buildMockJob(HOMEWORK_DIGEST_JOB, { tenant_id: TENANT_ID });
      await processor.process(job);

      // No notifications when there are no assignments
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Digest notification creation ─────────────────────────────────────

  describe('process — digest notification', () => {
    it('should create digest notification for parents', async () => {
      // Published assignments for today
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        buildPublishedAssignment(ASSIGNMENT_ID_1),
        buildPublishedAssignment(ASSIGNMENT_ID_2),
      ]);

      // Students enrolled in the class
      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          class_id: CLASS_ID,
          student: {
            id: STUDENT_ID,
            first_name: 'Ahmed',
            last_name: 'Hassan',
          },
        },
      ]);

      // Student-parent links
      mockPrisma.studentParent.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          parent: {
            id: PARENT_ID,
            user_id: PARENT_USER_ID,
            status: 'active',
            preferred_contact_channels: [],
          },
        },
      ]);

      // No existing digest notification
      mockPrisma.notification.findFirst.mockResolvedValue(null);

      const job = buildMockJob(HOMEWORK_DIGEST_JOB, { tenant_id: TENANT_ID });
      await processor.process(job);

      // Should create a notification for the parent
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenant_id: TENANT_ID,
            recipient_user_id: PARENT_USER_ID,
          }),
        }),
      );
    });
  });

  // ─── Parents without user_id ──────────────────────────────────────────

  describe('process — parents without user account', () => {
    it('should skip parents without user_id', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        buildPublishedAssignment(ASSIGNMENT_ID_1),
      ]);

      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          class_id: CLASS_ID,
          student: {
            id: STUDENT_ID,
            first_name: 'Ahmed',
            last_name: 'Hassan',
          },
        },
      ]);

      // Parent with NO user_id — not linked to a user account
      mockPrisma.studentParent.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          parent: {
            id: PARENT_ID,
            user_id: null,
            status: 'active',
            preferred_contact_channels: [],
          },
        },
      ]);

      const job = buildMockJob(HOMEWORK_DIGEST_JOB, { tenant_id: TENANT_ID });
      await processor.process(job);

      // Should NOT create notification — parent has no user account
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Deduplication ────────────────────────────────────────────────────

  describe('process — deduplication', () => {
    it('should not send duplicate digest notification', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
        buildPublishedAssignment(ASSIGNMENT_ID_1),
      ]);

      mockPrisma.classEnrolment.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          class_id: CLASS_ID,
          student: {
            id: STUDENT_ID,
            first_name: 'Ahmed',
            last_name: 'Hassan',
          },
        },
      ]);

      mockPrisma.studentParent.findMany.mockResolvedValue([
        {
          student_id: STUDENT_ID,
          parent: {
            id: PARENT_ID,
            user_id: PARENT_USER_ID,
            first_name: 'Khalid',
            last_name: 'Hassan',
          },
        },
      ]);

      // Existing digest notification already sent
      mockPrisma.notification.findFirst.mockResolvedValue({
        id: 'existing-digest-notif',
        template_key: 'homework_digest',
      });

      const job = buildMockJob(HOMEWORK_DIGEST_JOB, { tenant_id: TENANT_ID });
      await processor.process(job);

      // Should NOT create a new notification — digest already sent
      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    });
  });

  // ─── Logging ──────────────────────────────────────────────────────────

  describe('process — logging', () => {
    it('should log digest summary', async () => {
      mockPrisma.homeworkAssignment.findMany.mockResolvedValue([]);

      const logSpy = jest.spyOn(processor['logger'], 'log');

      const job = buildMockJob(HOMEWORK_DIGEST_JOB, { tenant_id: TENANT_ID });
      await processor.process(job);

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('digest'),
      );
    });
  });
});
