import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, ParentReadFacade, ClassesReadFacade, TenantReadFacade } from '../../common/tests/mock-facades';
import { PrismaService } from '../prisma/prisma.service';

import { HomeworkCompletionsService } from './homework-completions.service';

// ─── Constants ───────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const HOMEWORK_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const STUDENT_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
const USER_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CLASS_ID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

// ─── RLS mock ────────────────────────────────────────────────────────────────

const mockRlsTx = {
  homeworkCompletion: {
    upsert: jest.fn(),
  },
  classEnrolment: {
    findMany: jest.fn().mockResolvedValue([]),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(
        async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx),
      ),
  }),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    homeworkAssignment: { findFirst: jest.fn() },
    homeworkCompletion: { findMany: jest.fn(), count: jest.fn() },
    classEnrolment: { count: jest.fn() },
    parent: { findFirst: jest.fn() },
    tenant: {
      findUnique: jest.fn().mockResolvedValue({
        settings: {
          homework: {
            allow_student_self_report: true,
          },
        },
      }),
    },
  };
}

const publishedAssignment = {
  id: HOMEWORK_ID,
  title: 'Math Homework',
  class_id: CLASS_ID,
  status: 'published',
  due_date: new Date('2026-04-10'),
  max_points: 10,
};

const draftAssignment = {
  ...publishedAssignment,
  status: 'draft',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('HomeworkCompletionsService — listCompletions', () => {
  let module: TestingModule;
  let service: HomeworkCompletionsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset()),
    );

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkCompletionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HomeworkCompletionsService>(
      HomeworkCompletionsService,
    );
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should return completions for a published assignment', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(publishedAssignment);
    const completions = [
      { id: 'c1', student_id: STUDENT_ID, status: 'completed' },
    ];
    mockPrisma.homeworkCompletion.findMany.mockResolvedValue(completions);

    const result = await service.listCompletions(TENANT_ID, HOMEWORK_ID);

    expect(result.data).toEqual(completions);
    expect(result.assignment).toEqual({
      id: HOMEWORK_ID,
      title: 'Math Homework',
      class_id: CLASS_ID,
      due_date: publishedAssignment.due_date,
      max_points: 10,
    });
    expect(mockPrisma.homeworkAssignment.findFirst).toHaveBeenCalledWith({
      where: { id: HOMEWORK_ID, tenant_id: TENANT_ID },
      select: {
        id: true,
        title: true,
        class_id: true,
        status: true,
        due_date: true,
        max_points: true,
      },
    });
  });

  it('should throw NotFoundException when assignment not found', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.listCompletions(TENANT_ID, HOMEWORK_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when assignment is not published', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(draftAssignment);

    await expect(
      service.listCompletions(TENANT_ID, HOMEWORK_ID),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('HomeworkCompletionsService — studentSelfReport', () => {
  let module: TestingModule;
  let service: HomeworkCompletionsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockParentFacade: { findActiveByUserId: jest.Mock; findLinkedStudentIds: jest.Mock };
  let mockClassesFacade: { findClassIdsForStudent: jest.Mock };
  let mockTenantFacade: { findSettings: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset()),
    );

    mockParentFacade = {
      findActiveByUserId: jest.fn().mockResolvedValue({ id: 'parent-1' }),
      findLinkedStudentIds: jest.fn().mockResolvedValue([STUDENT_ID]),
    };
    mockClassesFacade = {
      findClassIdsForStudent: jest.fn().mockResolvedValue([CLASS_ID]),
    };
    mockTenantFacade = {
      findSettings: jest.fn().mockResolvedValue({ homework: { allow_student_self_report: true } }),
    };

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkCompletionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ParentReadFacade, useValue: mockParentFacade },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: TenantReadFacade, useValue: mockTenantFacade },
      ],
    }).compile();

    service = module.get<HomeworkCompletionsService>(
      HomeworkCompletionsService,
    );
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should upsert completion via RLS transaction', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(publishedAssignment);
    const upserted = {
      id: 'comp-1',
      student_id: STUDENT_ID,
      status: 'completed',
    };
    mockRlsTx.homeworkCompletion.upsert.mockResolvedValue(upserted);

    const result = await service.studentSelfReport(TENANT_ID, HOMEWORK_ID, USER_ID, {
      status: 'completed',
    });

    expect(result).toEqual(upserted);
    expect(mockRlsTx.homeworkCompletion.upsert).toHaveBeenCalledTimes(1);
    const upsertCall = mockRlsTx.homeworkCompletion.upsert.mock.calls[0][0];
    expect(upsertCall.where.idx_hw_completion_unique.student_id).toBe(STUDENT_ID);
    expect(upsertCall.create.status).toBe('completed');
    expect(upsertCall.create.completed_at).toBeInstanceOf(Date);
    expect(upsertCall.update.status).toBe('completed');
  });

  it('should set completed_at to null when status is not completed', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(publishedAssignment);
    mockRlsTx.homeworkCompletion.upsert.mockResolvedValue({
      id: 'comp-1',
      status: 'in_progress',
    });

    await service.studentSelfReport(TENANT_ID, HOMEWORK_ID, USER_ID, {
      status: 'in_progress',
    });

    const upsertCall = mockRlsTx.homeworkCompletion.upsert.mock.calls[0][0];
    expect(upsertCall.create.completed_at).toBeNull();
    expect(upsertCall.update.completed_at).toBeNull();
  });

  it('should throw NotFoundException when no enrolled student found', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(publishedAssignment);
    // Student is not enrolled in the assignment's class
    mockClassesFacade.findClassIdsForStudent.mockResolvedValue([]);

    await expect(
      service.studentSelfReport(TENANT_ID, HOMEWORK_ID, USER_ID, {
        status: 'completed',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when parent not found', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(publishedAssignment);
    mockParentFacade.findActiveByUserId.mockResolvedValue(null);

    await expect(
      service.studentSelfReport(TENANT_ID, HOMEWORK_ID, USER_ID, {
        status: 'completed',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when assignment not found', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.studentSelfReport(TENANT_ID, HOMEWORK_ID, USER_ID, {
        status: 'completed',
      }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('HomeworkCompletionsService — teacherUpdate', () => {
  let module: TestingModule;
  let service: HomeworkCompletionsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset()),
    );

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkCompletionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HomeworkCompletionsService>(
      HomeworkCompletionsService,
    );
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should upsert completion with verified_by and verified_at', async () => {
    // teacherUpdate uses findAssignment (no published check)
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(publishedAssignment);
    const upserted = {
      id: 'comp-1',
      student_id: STUDENT_ID,
      status: 'completed',
      verified_by_user_id: USER_ID,
    };
    mockRlsTx.homeworkCompletion.upsert.mockResolvedValue(upserted);

    const dto = { status: 'completed' as const, notes: 'Well done' };
    const result = await service.teacherUpdate(
      TENANT_ID,
      HOMEWORK_ID,
      STUDENT_ID,
      USER_ID,
      dto,
    );

    expect(result).toEqual(upserted);
    const upsertCall = mockRlsTx.homeworkCompletion.upsert.mock.calls[0][0];
    expect(upsertCall.create.verified_by_user_id).toBe(USER_ID);
    expect(upsertCall.create.verified_at).toBeInstanceOf(Date);
    expect(upsertCall.update.verified_by_user_id).toBe(USER_ID);
    expect(upsertCall.update.verified_at).toBeInstanceOf(Date);
    expect(upsertCall.create.notes).toBe('Well done');
  });

  it('should throw NotFoundException when assignment not found', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.teacherUpdate(TENANT_ID, HOMEWORK_ID, STUDENT_ID, USER_ID, {
        status: 'completed',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should allow update on draft assignments (no published check)', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(draftAssignment);
    mockRlsTx.homeworkCompletion.upsert.mockResolvedValue({
      id: 'comp-1',
      status: 'completed',
    });

    const result = await service.teacherUpdate(
      TENANT_ID,
      HOMEWORK_ID,
      STUDENT_ID,
      USER_ID,
      { status: 'completed' },
    );

    expect(result).toBeDefined();
    expect(mockRlsTx.homeworkCompletion.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('HomeworkCompletionsService — bulkMark', () => {
  let module: TestingModule;
  let service: HomeworkCompletionsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset()),
    );

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkCompletionsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<HomeworkCompletionsService>(
      HomeworkCompletionsService,
    );
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should upsert multiple completions in a single RLS transaction', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(publishedAssignment);
    const student2Id = '22222222-2222-2222-2222-222222222222';
    mockRlsTx.classEnrolment.findMany.mockResolvedValue([
      { student_id: STUDENT_ID },
      { student_id: student2Id },
    ]);
    mockRlsTx.homeworkCompletion.upsert
      .mockResolvedValueOnce({ id: 'c1', student_id: STUDENT_ID, status: 'completed' })
      .mockResolvedValueOnce({ id: 'c2', student_id: student2Id, status: 'in_progress' });

    const dto = {
      completions: [
        { student_id: STUDENT_ID, status: 'completed' as const },
        { student_id: student2Id, status: 'in_progress' as const },
      ],
    };

    const result = await service.bulkMark(TENANT_ID, HOMEWORK_ID, USER_ID, dto);

    expect(result.count).toBe(2);
    expect(result.data).toHaveLength(2);
    expect(mockRlsTx.homeworkCompletion.upsert).toHaveBeenCalledTimes(2);
  });

  it('should throw NotFoundException when assignment not found', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.bulkMark(TENANT_ID, HOMEWORK_ID, USER_ID, {
        completions: [{ student_id: STUDENT_ID, status: 'completed' }],
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException when assignment is not published', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(draftAssignment);

    await expect(
      service.bulkMark(TENANT_ID, HOMEWORK_ID, USER_ID, {
        completions: [{ student_id: STUDENT_ID, status: 'completed' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });
});

describe('HomeworkCompletionsService — getCompletionRate', () => {
  let module: TestingModule;
  let service: HomeworkCompletionsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockClassesFacadeRate: { countEnrolledStudents: jest.Mock };

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    Object.values(mockRlsTx).forEach((model) =>
      Object.values(model).forEach((fn) => (fn as jest.Mock).mockReset()),
    );

    mockClassesFacadeRate = {
      countEnrolledStudents: jest.fn().mockResolvedValue(0),
    };

    module = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        HomeworkCompletionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ClassesReadFacade, useValue: mockClassesFacadeRate },
      ],
    }).compile();

    service = module.get<HomeworkCompletionsService>(
      HomeworkCompletionsService,
    );
  });

  afterEach(async () => {
    jest.clearAllMocks();
    await module.close();
  });

  it('should calculate correct completion rate', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(publishedAssignment);
    mockClassesFacadeRate.countEnrolledStudents.mockResolvedValue(20);
    mockPrisma.homeworkCompletion.findMany.mockResolvedValue([
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'in_progress' },
      { status: 'in_progress' },
    ]);

    const result = await service.getCompletionRate(TENANT_ID, HOMEWORK_ID);

    expect(result.homework_assignment_id).toBe(HOMEWORK_ID);
    expect(result.total_students).toBe(20);
    expect(result.completed).toBe(3);
    expect(result.in_progress).toBe(2);
    // 20 total - 5 with records = 15 implicit not_started
    expect(result.not_started).toBe(15);
    // 3/20 = 15%
    expect(result.completion_rate).toBe(15);
  });

  it('should handle 0 students without division error', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(publishedAssignment);
    mockClassesFacadeRate.countEnrolledStudents.mockResolvedValue(0);
    mockPrisma.homeworkCompletion.findMany.mockResolvedValue([]);

    const result = await service.getCompletionRate(TENANT_ID, HOMEWORK_ID);

    expect(result.total_students).toBe(0);
    expect(result.completion_rate).toBe(0);
    expect(result.not_started).toBe(0);
  });

  it('should throw NotFoundException when assignment not found', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(null);

    await expect(
      service.getCompletionRate(TENANT_ID, HOMEWORK_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should count all status types correctly', async () => {
    mockPrisma.homeworkAssignment.findFirst.mockResolvedValue(publishedAssignment);
    mockClassesFacadeRate.countEnrolledStudents.mockResolvedValue(10);
    mockPrisma.homeworkCompletion.findMany.mockResolvedValue([
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
      { status: 'in_progress' },
      { status: 'in_progress' },
      { status: 'not_started' },
    ]);

    const result = await service.getCompletionRate(TENANT_ID, HOMEWORK_ID);

    expect(result.completed).toBe(5);
    expect(result.in_progress).toBe(2);
    // 1 explicit + (10 - 8) implicit = 3
    expect(result.not_started).toBe(3);
    // 5/10 = 50%
    expect(result.completion_rate).toBe(50);
  });
});
