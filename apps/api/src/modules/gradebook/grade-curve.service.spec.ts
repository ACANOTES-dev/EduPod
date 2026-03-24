import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { GradeCurveService } from './assessments/grade-curve.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASSESSMENT_ID = 'assessment-1';
const USER_ID = 'user-1';
const AUDIT_ID = 'audit-1';
const GRADE_ID_A = 'grade-a';
const GRADE_ID_B = 'grade-b';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  grade: {
    update: jest.fn(),
    findFirst: jest.fn(),
  },
  assessment: {
    update: jest.fn(),
  },
  gradeCurveAudit: {
    create: jest.fn(),
    update: jest.fn(),
  },
};

jest.mock('../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    assessment: {
      findFirst: jest.fn(),
    },
    grade: {
      findMany: jest.fn(),
    },
    gradeCurveAudit: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
  };
}

const baseAssessment = {
  id: ASSESSMENT_ID,
  status: 'open',
  max_score: 100,
  curve_applied: 'none',
};

const twoGrades = [
  { id: GRADE_ID_A, student_id: 'student-a', raw_score: 60 },
  { id: GRADE_ID_B, student_id: 'student-b', raw_score: 80 },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GradeCurveService — applyCurve', () => {
  let service: GradeCurveService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.grade.update.mockReset().mockResolvedValue({});
    mockRlsTx.assessment.update.mockReset().mockResolvedValue({});
    mockRlsTx.gradeCurveAudit.create.mockReset().mockResolvedValue({ id: AUDIT_ID });

    mockPrisma.assessment.findFirst.mockResolvedValue(baseAssessment);
    mockPrisma.grade.findMany.mockResolvedValue(twoGrades);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeCurveService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GradeCurveService>(GradeCurveService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── linear_shift ──────────────────────────────────────────────────────────

  it('should apply linear_shift curve — add shift to each score', async () => {
    await service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
      method: 'linear_shift',
      params: { shift: 10 },
    });

    // Student A: 60 + 10 = 70, Student B: 80 + 10 = 90
    expect(mockRlsTx.grade.update).toHaveBeenCalledTimes(2);
    const updateCalls = mockRlsTx.grade.update.mock.calls as Array<[{ where: { id: string }; data: { raw_score: number } }]>;
    const callA = updateCalls.find(([arg]) => arg.where.id === GRADE_ID_A);
    const callB = updateCalls.find(([arg]) => arg.where.id === GRADE_ID_B);
    expect(callA?.[0].data.raw_score).toBeCloseTo(70, 1);
    expect(callB?.[0].data.raw_score).toBeCloseTo(90, 1);
  });

  it('edge: linear_shift should cap at max_score (100)', async () => {
    // Student B already at 80, shift of 30 would give 110 → capped at 100
    mockPrisma.grade.findMany.mockResolvedValue([
      { id: GRADE_ID_B, student_id: 'student-b', raw_score: 80 },
    ]);

    await service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
      method: 'linear_shift',
      params: { shift: 30 },
    });

    const updateCalls = mockRlsTx.grade.update.mock.calls as Array<[{ where: { id: string }; data: { raw_score: number } }]>;
    const callB = updateCalls.find(([arg]) => arg.where.id === GRADE_ID_B);
    expect(callB?.[0].data.raw_score).toBe(100);
  });

  it('edge: linear_shift should floor at 0 when shift is negative', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([
      { id: GRADE_ID_A, student_id: 'student-a', raw_score: 5 },
    ]);

    await service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
      method: 'linear_shift',
      params: { shift: -20 },
    });

    const updateCalls = mockRlsTx.grade.update.mock.calls as Array<[{ where: { id: string }; data: { raw_score: number } }]>;
    const callA = updateCalls.find(([arg]) => arg.where.id === GRADE_ID_A);
    expect(callA?.[0].data.raw_score).toBe(0);
  });

  // ─── linear_scale ──────────────────────────────────────────────────────────

  it('should apply linear_scale curve — scale to highest score becomes 100', async () => {
    // Highest is 80, scale: student A (60): (60/80)*100 = 75, B (80): (80/80)*100 = 100
    await service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
      method: 'linear_scale',
      params: {},
    });

    const updateCalls = mockRlsTx.grade.update.mock.calls as Array<[{ where: { id: string }; data: { raw_score: number } }]>;
    const callA = updateCalls.find(([arg]) => arg.where.id === GRADE_ID_A);
    const callB = updateCalls.find(([arg]) => arg.where.id === GRADE_ID_B);
    expect(callA?.[0].data.raw_score).toBeCloseTo(75, 1);
    expect(callB?.[0].data.raw_score).toBeCloseTo(100, 1);
  });

  // ─── sqrt ──────────────────────────────────────────────────────────────────

  it('should apply sqrt curve — sqrt(score/max)*max', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([
      { id: GRADE_ID_A, student_id: 'student-a', raw_score: 64 }, // sqrt(64/100)*100 = 80
    ]);

    await service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
      method: 'sqrt',
      params: {},
    });

    const updateCalls = mockRlsTx.grade.update.mock.calls as Array<[{ where: { id: string }; data: { raw_score: number } }]>;
    const callA = updateCalls.find(([arg]) => arg.where.id === GRADE_ID_A);
    expect(callA?.[0].data.raw_score).toBeCloseTo(80, 1);
  });

  // ─── bell ──────────────────────────────────────────────────────────────────

  it('should apply bell curve — normalize distribution to target mean and stddev', async () => {
    // Scores: 60 and 80, mean = 70, stddev = 10
    // Target mean = 75, target stddev = 10 (default)
    // Student A (60): z = (60-70)/10 = -1, new% = 75 + (-1)*10 = 65, newScore = 65
    // Student B (80): z = (80-70)/10 = +1, new% = 75 + 1*10 = 85, newScore = 85
    await service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
      method: 'bell',
      params: { target_mean: 75, target_stddev: 10 },
    });

    const updateCalls = mockRlsTx.grade.update.mock.calls as Array<[{ where: { id: string }; data: { raw_score: number } }]>;
    const callA = updateCalls.find(([arg]) => arg.where.id === GRADE_ID_A);
    const callB = updateCalls.find(([arg]) => arg.where.id === GRADE_ID_B);
    expect(callA?.[0].data.raw_score).toBeCloseTo(65, 1);
    expect(callB?.[0].data.raw_score).toBeCloseTo(85, 1);
  });

  // ─── custom ────────────────────────────────────────────────────────────────

  it('should apply custom curve — exact mapping lookup', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([
      { id: GRADE_ID_A, student_id: 'student-a', raw_score: 60 },
    ]);

    await service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
      method: 'custom',
      params: {
        mappings: [
          { from: 60, to: 75 },
          { from: 80, to: 90 },
        ],
      },
    });

    const updateCalls = mockRlsTx.grade.update.mock.calls as Array<[{ where: { id: string }; data: { raw_score: number } }]>;
    const callA = updateCalls.find(([arg]) => arg.where.id === GRADE_ID_A);
    expect(callA?.[0].data.raw_score).toBe(75);
  });

  it('should apply custom curve — interpolate between mapping points', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([
      { id: GRADE_ID_A, student_id: 'student-a', raw_score: 70 }, // between 60→75 and 80→90
    ]);

    await service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
      method: 'custom',
      params: {
        mappings: [
          { from: 60, to: 75 },
          { from: 80, to: 90 },
        ],
      },
    });

    // Interpolate: ratio = (70-60)/(80-60) = 0.5, interpolated = 75 + 0.5*(90-75) = 82.5
    const updateCalls = mockRlsTx.grade.update.mock.calls as Array<[{ where: { id: string }; data: { raw_score: number } }]>;
    const callA = updateCalls.find(([arg]) => arg.where.id === GRADE_ID_A);
    expect(callA?.[0].data.raw_score).toBeCloseTo(82.5, 1);
  });

  // ─── Error cases ──────────────────────────────────────────────────────────

  it('should throw NotFoundException when assessment does not exist', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    await expect(
      service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
        method: 'linear_shift',
        params: { shift: 5 },
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when assessment is locked', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      ...baseAssessment,
      status: 'locked',
    });

    await expect(
      service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
        method: 'linear_shift',
        params: { shift: 5 },
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw ConflictException when a curve has already been applied', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      ...baseAssessment,
      curve_applied: 'linear_shift',
    });

    await expect(
      service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
        method: 'sqrt',
        params: {},
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw BadRequestException when no grades exist', async () => {
    mockPrisma.grade.findMany.mockResolvedValue([]);

    await expect(
      service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
        method: 'linear_shift',
        params: { shift: 5 },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should create audit record with can_undo = true', async () => {
    await service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
      method: 'linear_shift',
      params: { shift: 5 },
    });

    expect(mockRlsTx.gradeCurveAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          can_undo: true,
          applied_by_user_id: USER_ID,
          method: 'linear_shift',
        }),
      }),
    );
  });
});

describe('GradeCurveService — undoCurve', () => {
  let service: GradeCurveService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.grade.findFirst.mockReset().mockResolvedValue({ id: GRADE_ID_A });
    mockRlsTx.grade.update.mockReset().mockResolvedValue({});
    mockRlsTx.assessment.update.mockReset().mockResolvedValue({});
    mockRlsTx.gradeCurveAudit.update.mockReset().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeCurveService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GradeCurveService>(GradeCurveService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should revert grades to before_scores when undo is available', async () => {
    const beforeScores = [
      { student_id: 'student-a', raw_score: 60 },
      { student_id: 'student-b', raw_score: 80 },
    ];

    mockPrisma.gradeCurveAudit.findFirst.mockResolvedValue({
      id: AUDIT_ID,
      can_undo: true,
      before_scores: beforeScores,
      method: 'linear_shift',
    });

    const result = await service.undoCurve(TENANT_ID, ASSESSMENT_ID, {
      audit_id: AUDIT_ID,
    }) as { grades_reverted: number; method: string };

    expect(result.grades_reverted).toBe(2);
    expect(mockRlsTx.assessment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ curve_applied: 'none' }),
      }),
    );
  });

  it('should mark audit as can_undo = false after undo', async () => {
    mockPrisma.gradeCurveAudit.findFirst.mockResolvedValue({
      id: AUDIT_ID,
      can_undo: true,
      before_scores: [{ student_id: 'student-a', raw_score: 60 }],
      method: 'linear_shift',
    });

    await service.undoCurve(TENANT_ID, ASSESSMENT_ID, { audit_id: AUDIT_ID });

    expect(mockRlsTx.gradeCurveAudit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: AUDIT_ID },
        data: { can_undo: false },
      }),
    );
  });

  it('should throw NotFoundException when audit record does not exist', async () => {
    mockPrisma.gradeCurveAudit.findFirst.mockResolvedValue(null);

    await expect(
      service.undoCurve(TENANT_ID, ASSESSMENT_ID, { audit_id: AUDIT_ID }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when can_undo is false', async () => {
    mockPrisma.gradeCurveAudit.findFirst.mockResolvedValue({
      id: AUDIT_ID,
      can_undo: false,
      before_scores: [],
      method: 'linear_shift',
    });

    await expect(
      service.undoCurve(TENANT_ID, ASSESSMENT_ID, { audit_id: AUDIT_ID }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('GradeCurveService — invalidateCurveUndo', () => {
  let service: GradeCurveService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockPrisma.gradeCurveAudit.updateMany.mockResolvedValue({ count: 1 });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeCurveService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GradeCurveService>(GradeCurveService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should mark all undoable audit records as can_undo = false', async () => {
    await service.invalidateCurveUndo(TENANT_ID, ASSESSMENT_ID);

    expect(mockPrisma.gradeCurveAudit.updateMany).toHaveBeenCalledWith({
      where: {
        tenant_id: TENANT_ID,
        assessment_id: ASSESSMENT_ID,
        can_undo: true,
      },
      data: { can_undo: false },
    });
  });
});
