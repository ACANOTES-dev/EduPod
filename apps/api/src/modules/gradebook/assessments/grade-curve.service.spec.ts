/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

import { PrismaService } from '../../prisma/prisma.service';

import { GradeCurveService } from './grade-curve.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ASSESSMENT_ID = 'assessment-1';
const USER_ID = 'user-1';
const AUDIT_ID = 'audit-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  grade: {
    update: jest.fn().mockResolvedValue({}),
    findFirst: jest.fn(),
  },
  assessment: {
    update: jest.fn().mockResolvedValue({}),
  },
  gradeCurveAudit: {
    create: jest.fn().mockResolvedValue({ id: AUDIT_ID }),
    update: jest.fn().mockResolvedValue({}),
  },
};

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

// ─── applyCurve Tests ────────────────────────────────────────────────────────

describe('GradeCurveService — applyCurve', () => {
  let service: GradeCurveService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.grade.update.mockReset().mockResolvedValue({});
    mockRlsTx.assessment.update.mockReset().mockResolvedValue({});
    mockRlsTx.gradeCurveAudit.create.mockReset().mockResolvedValue({ id: AUDIT_ID });

    const module: TestingModule = await Test.createTestingModule({
      providers: [GradeCurveService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<GradeCurveService>(GradeCurveService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when assessment not found', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    await expect(
      service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
        method: 'linear_shift',
        params: { shift: 10 },
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when assessment is locked', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      status: 'locked',
      max_score: 100,
      curve_applied: 'none',
    });

    await expect(
      service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
        method: 'linear_shift',
        params: { shift: 10 },
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw ConflictException when curve already applied', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      status: 'open',
      max_score: 100,
      curve_applied: 'bell',
    });

    await expect(
      service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
        method: 'linear_shift',
        params: { shift: 10 },
      }),
    ).rejects.toThrow(ConflictException);
  });

  it('should throw BadRequestException when no grades exist', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      status: 'open',
      max_score: 100,
      curve_applied: 'none',
    });
    mockPrisma.grade.findMany.mockResolvedValue([]);

    await expect(
      service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
        method: 'linear_shift',
        params: { shift: 10 },
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('should apply linear_shift curve and return audit_id', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      status: 'open',
      max_score: 100,
      curve_applied: 'none',
    });
    mockPrisma.grade.findMany.mockResolvedValue([
      { id: 'g1', student_id: 's1', raw_score: 70 },
      { id: 'g2', student_id: 's2', raw_score: 80 },
    ]);

    const result = await service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
      method: 'linear_shift',
      params: { shift: 10 },
    });

    expect(result.audit_id).toBe(AUDIT_ID);
    expect(result.grades_updated).toBe(2);
    expect(result.method).toBe('linear_shift');
  });

  it('should cap linear_shift scores at max_score', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      status: 'open',
      max_score: 100,
      curve_applied: 'none',
    });
    mockPrisma.grade.findMany.mockResolvedValue([{ id: 'g1', student_id: 's1', raw_score: 95 }]);

    await service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
      method: 'linear_shift',
      params: { shift: 20 },
    });

    // The after score for 95 + 20 = 115 should be capped at 100
    expect(mockRlsTx.gradeCurveAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          after_scores: expect.arrayContaining([
            expect.objectContaining({ student_id: 's1', raw_score: 100 }),
          ]),
        }),
      }),
    );
  });

  it('should apply sqrt curve correctly', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      status: 'open',
      max_score: 100,
      curve_applied: 'none',
    });
    mockPrisma.grade.findMany.mockResolvedValue([{ id: 'g1', student_id: 's1', raw_score: 49 }]);

    await service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
      method: 'sqrt',
    });

    // sqrt(49/100) * 100 = 70
    expect(mockRlsTx.gradeCurveAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          after_scores: expect.arrayContaining([
            expect.objectContaining({ student_id: 's1', raw_score: 70 }),
          ]),
        }),
      }),
    );
  });

  it('should apply linear_scale curve: normalize to highest score', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({
      id: ASSESSMENT_ID,
      status: 'open',
      max_score: 100,
      curve_applied: 'none',
    });
    mockPrisma.grade.findMany.mockResolvedValue([
      { id: 'g1', student_id: 's1', raw_score: 50 },
      { id: 'g2', student_id: 's2', raw_score: 80 },
    ]);

    await service.applyCurve(TENANT_ID, ASSESSMENT_ID, USER_ID, {
      method: 'linear_scale',
    });

    // highest = 80, s1: (50/80)*100 = 62.5, s2: (80/80)*100 = 100
    expect(mockRlsTx.gradeCurveAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          after_scores: expect.arrayContaining([
            expect.objectContaining({ student_id: 's2', raw_score: 100 }),
          ]),
        }),
      }),
    );
  });
});

// ─── undoCurve Tests ─────────────────────────────────────────────────────────

describe('GradeCurveService — undoCurve', () => {
  let service: GradeCurveService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.grade.update.mockReset().mockResolvedValue({});
    mockRlsTx.grade.findFirst.mockReset();
    mockRlsTx.assessment.update.mockReset().mockResolvedValue({});
    mockRlsTx.gradeCurveAudit.update.mockReset().mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [GradeCurveService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<GradeCurveService>(GradeCurveService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when audit not found', async () => {
    mockPrisma.gradeCurveAudit.findFirst.mockResolvedValue(null);

    await expect(
      service.undoCurve(TENANT_ID, ASSESSMENT_ID, { audit_id: AUDIT_ID }),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw ConflictException when undo not available', async () => {
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

  it('should revert grades and return count', async () => {
    mockPrisma.gradeCurveAudit.findFirst.mockResolvedValue({
      id: AUDIT_ID,
      can_undo: true,
      before_scores: [
        { student_id: 's1', raw_score: 70 },
        { student_id: 's2', raw_score: 80 },
      ],
      method: 'linear_shift',
    });
    mockRlsTx.grade.findFirst.mockResolvedValue({ id: 'g1' });

    const result = await service.undoCurve(TENANT_ID, ASSESSMENT_ID, { audit_id: AUDIT_ID });

    expect(result.grades_reverted).toBe(2);
    expect(result.method).toBe('linear_shift');
  });
});

// ─── getCurveHistory Tests ───────────────────────────────────────────────────

describe('GradeCurveService — getCurveHistory', () => {
  let service: GradeCurveService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GradeCurveService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<GradeCurveService>(GradeCurveService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when assessment not found', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue(null);

    await expect(service.getCurveHistory(TENANT_ID, ASSESSMENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return audit records for assessment', async () => {
    mockPrisma.assessment.findFirst.mockResolvedValue({ id: ASSESSMENT_ID });
    mockPrisma.gradeCurveAudit.findMany.mockResolvedValue([
      {
        id: AUDIT_ID,
        method: 'bell',
        applied_by: { id: USER_ID, first_name: 'A', last_name: 'B' },
      },
    ]);

    const result = await service.getCurveHistory(TENANT_ID, ASSESSMENT_ID);

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.method).toBe('bell');
  });
});

// ─── invalidateCurveUndo Tests ───────────────────────────────────────────────

describe('GradeCurveService — invalidateCurveUndo', () => {
  let service: GradeCurveService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [GradeCurveService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<GradeCurveService>(GradeCurveService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should mark all undoable audits as can_undo = false', async () => {
    mockPrisma.gradeCurveAudit.updateMany.mockResolvedValue({ count: 2 });

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
