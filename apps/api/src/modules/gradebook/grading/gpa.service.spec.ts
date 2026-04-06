/* eslint-disable import/order -- jest.mock must precede mocked imports */
import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(mockRlsTx)),
  }),
}));

import {
  MOCK_FACADE_PROVIDERS,
  StudentReadFacade,
  AcademicReadFacade,
  ConfigurationReadFacade,
} from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { GpaService } from './gpa.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'student-1';
const PERIOD_ID = 'period-1';

/** Creates a mock Decimal-like value that works with Number() */
function decimal(n: number) {
  return { valueOf: () => n, toNumber: () => n, toString: () => String(n) };
}

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  gpaSnapshot: {
    upsert: jest.fn().mockResolvedValue({
      id: 'gpa-snap-1',
      gpa_value: 3.5,
      credit_hours_total: 6,
    }),
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    student: {
      findFirst: jest.fn(),
    },
    academicPeriod: {
      findFirst: jest.fn(),
    },
    periodGradeSnapshot: {
      findMany: jest.fn(),
    },
    classSubjectGradeConfig: {
      findFirst: jest.fn(),
    },
    tenantSetting: {
      findFirst: jest.fn(),
    },
    gpaSnapshot: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
}

// ─── computeGpa Tests ────────────────────────────────────────────────────────

const mockStudentFacade = { existsOrThrow: jest.fn(), findOneGeneric: jest.fn() };
const mockAcademicFacade = { findPeriodById: jest.fn() };
const mockConfigFacade = { findSettings: jest.fn() };

describe('GpaService — computeGpa', () => {
  let service: GpaService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockRlsTx.gpaSnapshot.upsert.mockReset().mockResolvedValue({
      id: 'gpa-snap-1',
      gpa_value: 3.5,
      credit_hours_total: 6,
    });
    mockStudentFacade.existsOrThrow.mockResolvedValue(true);
    mockAcademicFacade.findPeriodById.mockResolvedValue({ id: PERIOD_ID });
    mockConfigFacade.findSettings.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
        GpaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GpaService>(GpaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when student not found', async () => {
    mockStudentFacade.existsOrThrow.mockRejectedValue(new NotFoundException('student not found'));

    await expect(service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should throw NotFoundException when period not found', async () => {
    mockAcademicFacade.findPeriodById.mockResolvedValue(null);

    await expect(service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return null GPA when no snapshots exist', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

    const result = await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    expect(result.gpa_value).toBeNull();
    expect(result.message).toBe('No period grades available to compute GPA');
  });

  it('should use equal weighting when no credit_hours configured', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: 'c1',
        subject_id: 's1',
        computed_value: decimal(80),
        class_entity: { id: 'c1' },
        subject: { id: 's1' },
      },
      {
        class_id: 'c1',
        subject_id: 's2',
        computed_value: decimal(60),
        class_entity: { id: 'c1' },
        subject: { id: 's2' },
      },
    ]);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(null);
    mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

    const result = await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    // Without grading scale: gpa = (percentage/100)*4.0
    // s1: (80/100)*4 = 3.2, s2: (60/100)*4 = 2.4
    // Equal avg: (3.2 + 2.4) / 2 = 2.8
    expect(result.gpa_value).toBe(2.8);
    expect(result.subjects_included).toBe(2);
  });

  it('should use weighted GPA when credit_hours are configured', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
    });
    mockPrisma.academicPeriod.findFirst.mockResolvedValue({ id: PERIOD_ID });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: 'c1',
        subject_id: 's1',
        computed_value: decimal(90),
        class_entity: { id: 'c1' },
        subject: { id: 's1' },
      },
      {
        class_id: 'c1',
        subject_id: 's2',
        computed_value: decimal(70),
        class_entity: { id: 'c1' },
        subject: { id: 's2' },
      },
    ]);
    // First call for s1: credit_hours 3, second call for s2: credit_hours 2
    mockPrisma.classSubjectGradeConfig.findFirst
      .mockResolvedValueOnce({
        credit_hours: 3,
        grading_scale: null,
      })
      .mockResolvedValueOnce({
        credit_hours: 2,
        grading_scale: null,
      });
    mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

    const result = await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    // s1: (90/100)*4 = 3.6 * 3 hours = 10.8
    // s2: (70/100)*4 = 2.8 * 2 hours = 5.6
    // total = 16.4 / 5 = 3.28
    expect(result.gpa_value).toBe(3.28);
  });

  it('should use grading scale gpa_value when scale is configured', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
    });
    mockPrisma.academicPeriod.findFirst.mockResolvedValue({ id: PERIOD_ID });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: 'c1',
        subject_id: 's1',
        computed_value: decimal(85),
        class_entity: { id: 'c1' },
        subject: { id: 's1' },
      },
    ]);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      credit_hours: null,
      grading_scale: {
        config_json: {
          type: 'numeric',
          ranges: [
            { min: 80, max: 100, label: 'A', gpa_value: 4.0 },
            { min: 60, max: 79, label: 'B', gpa_value: 3.0 },
          ],
        },
      },
    });
    mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

    const result = await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    // 85% falls in A range -> gpa_value = 4.0
    expect(result.gpa_value).toBe(4);
  });

  it('should return null GPA when all credit_hours are 0', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: 'c1',
        subject_id: 's1',
        computed_value: decimal(80),
        class_entity: { id: 'c1' },
        subject: { id: 's1' },
      },
    ]);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      credit_hours: 0,
      grading_scale: null,
    });
    mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

    const result = await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    expect(result.gpa_value).toBeNull();
    expect(result.message).toBe('No credit hours configured');
  });

  it('should use letter grade gpa_value from grading scale', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: 'c1',
        subject_id: 's1',
        computed_value: decimal(85),
        class_entity: { id: 'c1' },
        subject: { id: 's1' },
      },
    ]);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      credit_hours: null,
      grading_scale: {
        config_json: {
          type: 'letter',
          grades: [
            { label: 'A', numeric_value: 90, gpa_value: 4.0 },
            { label: 'B', numeric_value: 80, gpa_value: 3.0 },
            { label: 'C', numeric_value: 70, gpa_value: 2.0 },
          ],
        },
      },
    });
    mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

    const result = await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    // 85% >= 80 (B) → gpa_value = 3.0
    expect(result.gpa_value).toBe(3);
  });

  it('should use custom grade type and fall back to proportional when no gpa_value', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: 'c1',
        subject_id: 's1',
        computed_value: decimal(50),
        class_entity: { id: 'c1' },
        subject: { id: 's1' },
      },
    ]);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      credit_hours: null,
      grading_scale: {
        config_json: {
          type: 'custom',
          grades: [
            { label: 'Pass', numeric_value: 40 },
            { label: 'Fail', numeric_value: 0 },
          ],
        },
      },
    });
    mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

    const result = await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    // 50% >= 40 (Pass) → no gpa_value → fallback (50/100)*4.0 = 2.0
    expect(result.gpa_value).toBe(2);
  });

  it('should fall back to proportional 4.0 scale when no range or grade matches', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: 'c1',
        subject_id: 's1',
        computed_value: decimal(30),
        class_entity: { id: 'c1' },
        subject: { id: 's1' },
      },
    ]);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      credit_hours: null,
      grading_scale: {
        config_json: {
          type: 'numeric',
          ranges: [{ min: 60, max: 100, label: 'Pass', gpa_value: 3.0 }],
        },
      },
    });
    mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

    const result = await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    // 30% doesn't match any range → fallback (30/100)*4 = 1.2
    expect(result.gpa_value).toBe(1.2);
  });

  it('should respect tenant gpaPrecision setting', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
    });
    mockPrisma.academicPeriod.findFirst.mockResolvedValue({ id: PERIOD_ID });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: 'c1',
        subject_id: 's1',
        computed_value: decimal(75),
        class_entity: { id: 'c1' },
        subject: { id: 's1' },
      },
    ]);
    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue(null);
    mockPrisma.tenantSetting.findFirst.mockResolvedValue({
      settings: { gradebook: { gpaPrecision: 3 } },
    });

    const result = await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    // (75/100)*4 = 3.0 exactly. With precision 3, still 3
    expect(result.gpa_value).toBe(3);
  });
});

// ─── getCumulativeGpa Tests ──────────────────────────────────────────────────

describe('GpaService — getCumulativeGpa', () => {
  let service: GpaService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockStudentFacade.findOneGeneric.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: StudentReadFacade, useValue: mockStudentFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        { provide: ConfigurationReadFacade, useValue: mockConfigFacade },
        GpaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GpaService>(GpaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when student not found', async () => {
    mockStudentFacade.findOneGeneric.mockResolvedValue(null);

    await expect(service.getCumulativeGpa(TENANT_ID, STUDENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return null cumulative GPA when no snapshots', async () => {
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([]);

    const result = await service.getCumulativeGpa(TENANT_ID, STUDENT_ID);

    expect(result.cumulative_gpa).toBeNull();
    expect(result.periods).toHaveLength(0);
  });

  it('should compute weighted cumulative GPA across periods', async () => {
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([
      {
        gpa_value: 3.5,
        credit_hours_total: 6,
        snapshot_at: new Date(),
        academic_period: { id: 'p1', name: 'Term 1', start_date: new Date() },
      },
      {
        gpa_value: 3.0,
        credit_hours_total: 4,
        snapshot_at: new Date(),
        academic_period: { id: 'p2', name: 'Term 2', start_date: new Date() },
      },
    ]);

    const result = await service.getCumulativeGpa(TENANT_ID, STUDENT_ID);

    // (3.5*6 + 3.0*4) / (6+4) = (21 + 12) / 10 = 3.3
    expect(result.cumulative_gpa).toBe(3.3);
    expect(result.periods).toHaveLength(2);
  });
});

// ─── getGpaSnapshot Tests ────────────────────────────────────────────────────

describe('GpaService — getGpaSnapshot', () => {
  let service: GpaService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        GpaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GpaService>(GpaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return null GPA when no snapshot exists', async () => {
    mockPrisma.gpaSnapshot.findFirst.mockResolvedValue(null);

    const result = await service.getGpaSnapshot(TENANT_ID, STUDENT_ID, PERIOD_ID);

    expect(result.gpa_value).toBeNull();
  });

  it('should return snapshot data when found', async () => {
    mockPrisma.gpaSnapshot.findFirst.mockResolvedValue({
      gpa_value: 3.75,
      credit_hours_total: 5,
      snapshot_at: new Date('2026-01-15'),
      academic_period: { id: PERIOD_ID, name: 'Term 1' },
    });

    const result = await service.getGpaSnapshot(TENANT_ID, STUDENT_ID, PERIOD_ID);

    expect(result.gpa_value).toBe(3.75);
    expect(result.credit_hours_total).toBe(5);
  });
});
