import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, StudentReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';

import { HomeworkNotificationService } from './homework-notification.service';
import { HomeworkStudentService } from './homework-student.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const HOMEWORK_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const SUBMISSION_ID = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const TEACHER_USER_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ────────────────────────────────────────────────────────────────

const mockRlsTx = {
  homeworkSubmission: {
    upsert: jest.fn(),
  },
  homeworkCompletion: {
    upsert: jest.fn().mockResolvedValue(undefined),
  },
  homeworkSubmissionAttachment: {
    create: jest.fn(),
    delete: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    homeworkAssignment: { findFirst: jest.fn(), findMany: jest.fn(), count: jest.fn() },
    homeworkSubmission: { findFirst: jest.fn(), findMany: jest.fn() },
    homeworkSubmissionAttachment: { findFirst: jest.fn(), count: jest.fn().mockResolvedValue(0) },
  };
}

function buildMockS3() {
  return { upload: jest.fn(), delete: jest.fn() };
}

function buildMockNotification() {
  return {
    notifyOnSubmit: jest.fn().mockResolvedValue(undefined),
    notifyOnReturn: jest.fn().mockResolvedValue(undefined),
    notifyOnGrade: jest.fn().mockResolvedValue(undefined),
  };
}

function resetRls() {
  Object.values(mockRlsTx).forEach((model) =>
    Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset()),
  );
}

// ─── Suites ──────────────────────────────────────────────────────────────────

describe('HomeworkStudentService — resolveStudent guard', () => {
  let module: TestingModule;
  let service: HomeworkStudentService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    resetRls();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkStudentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: buildMockS3() },
        { provide: HomeworkNotificationService, useValue: buildMockNotification() },
      ],
    }).compile();

    service = module.get(HomeworkStudentService);
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('rejects a user whose account has no linked Student record', async () => {
    const facade = module.get(StudentReadFacade) as unknown as { findByUserId: jest.Mock };
    facade.findByUserId.mockResolvedValue(null);

    await expect(service.listToday(TENANT_ID, USER_ID)).rejects.toThrow(ForbiddenException);
  });
});

describe('HomeworkStudentService — submit', () => {
  let module: TestingModule;
  let service: HomeworkStudentService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let notification: ReturnType<typeof buildMockNotification>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    resetRls();
    notification = buildMockNotification();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkStudentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: buildMockS3() },
        { provide: HomeworkNotificationService, useValue: notification },
      ],
    }).compile();

    service = module.get(HomeworkStudentService);

    const facade = module.get(StudentReadFacade) as unknown as { findByUserId: jest.Mock };
    facade.findByUserId.mockResolvedValue({ id: STUDENT_ID });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('creates a submission on time and notifies the teacher', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      id: HOMEWORK_ID,
      assigned_by_user_id: TEACHER_USER_ID,
      due_date: tomorrow,
      due_time: null,
      accept_late_submissions: true,
    });
    mockRlsTx.homeworkSubmission.upsert.mockResolvedValue({
      id: SUBMISSION_ID,
      status: 'submitted',
      is_late: false,
    });

    const result = await service.submit(TENANT_ID, USER_ID, HOMEWORK_ID, {
      submission_text: 'my answer',
    });

    expect(mockRlsTx.homeworkSubmission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ is_late: false, submission_text: 'my answer' }),
        update: expect.objectContaining({ is_late: false }),
      }),
    );
    expect(notification.notifyOnSubmit).toHaveBeenCalledWith(
      TENANT_ID,
      HOMEWORK_ID,
      SUBMISSION_ID,
      STUDENT_ID,
      TEACHER_USER_ID,
    );
    expect(result.status).toBe('submitted');
  });

  it('flags a late submission when accept_late_submissions is true', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      id: HOMEWORK_ID,
      assigned_by_user_id: TEACHER_USER_ID,
      due_date: yesterday,
      due_time: null,
      accept_late_submissions: true,
    });
    mockRlsTx.homeworkSubmission.upsert.mockResolvedValue({
      id: SUBMISSION_ID,
      status: 'submitted',
      is_late: true,
    });

    await service.submit(TENANT_ID, USER_ID, HOMEWORK_ID, {});

    expect(mockRlsTx.homeworkSubmission.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ is_late: true }),
      }),
    );
  });

  it('hard-rejects a late submission when accept_late_submissions is false', async () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue({
      id: HOMEWORK_ID,
      assigned_by_user_id: TEACHER_USER_ID,
      due_date: yesterday,
      due_time: null,
      accept_late_submissions: false,
    });

    await expect(
      service.submit(TENANT_ID, USER_ID, HOMEWORK_ID, { submission_text: 'late' }),
    ).rejects.toThrow(BadRequestException);
    expect(mockRlsTx.homeworkSubmission.upsert).not.toHaveBeenCalled();
  });

  it('throws NotFoundException when the homework is not assigned to the student', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(service.submit(TENANT_ID, USER_ID, HOMEWORK_ID, {})).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('HomeworkStudentService — listOverdue', () => {
  let module: TestingModule;
  let service: HomeworkStudentService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    resetRls();

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkStudentService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: buildMockS3() },
        { provide: HomeworkNotificationService, useValue: buildMockNotification() },
      ],
    }).compile();

    service = module.get(HomeworkStudentService);

    const facade = module.get(StudentReadFacade) as unknown as { findByUserId: jest.Mock };
    facade.findByUserId.mockResolvedValue({ id: STUDENT_ID });
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('filters out already-submitted assignments', async () => {
    mockPrisma.homeworkAssignment.findMany.mockResolvedValue([
      { id: 'hw-1', title: 'A', class_entity: { id: 'c1', name: 'C1' }, subject: null },
      { id: 'hw-2', title: 'B', class_entity: { id: 'c1', name: 'C1' }, subject: null },
    ]);
    mockPrisma.homeworkSubmission.findMany.mockResolvedValue([
      { homework_assignment_id: 'hw-1', status: 'submitted' },
      { homework_assignment_id: 'hw-2', status: 'returned_for_revision' },
    ]);

    const result = await service.listOverdue(TENANT_ID, USER_ID);

    // hw-1 (submitted) filtered out. hw-2 (returned_for_revision) kept.
    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.id).toBe('hw-2');
  });
});
