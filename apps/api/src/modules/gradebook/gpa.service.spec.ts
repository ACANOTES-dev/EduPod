import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';

import { GpaService } from './grading/gpa.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'student-1';
const PERIOD_ID = 'period-1';
const CLASS_ID = 'class-1';
const SUBJECT_ID = 'subject-1';

// ─── RLS mock ─────────────────────────────────────────────────────────────────

const mockRlsTx = {
  gpaSnapshot: {
    upsert: jest.fn(),
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
    student: { findFirst: jest.fn() },
    academicPeriod: { findFirst: jest.fn() },
    periodGradeSnapshot: { findMany: jest.fn() },
    tenantSetting: { findFirst: jest.fn() },
    classSubjectGradeConfig: { findFirst: jest.fn() },
    gpaSnapshot: { findMany: jest.fn(), findFirst: jest.fn() },
  };
}

const baseStudent = { id: STUDENT_ID, first_name: 'John', last_name: 'Doe' };
const basePeriod = { id: PERIOD_ID };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GpaService — computeGpa', () => {
  let service: GpaService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockRlsTx.gpaSnapshot.upsert.mockReset();
    mockRlsTx.gpaSnapshot.upsert.mockResolvedValue({
      id: 'snap-1',
      gpa_value: 3.0,
      credit_hours_total: 3,
      snapshot_at: new Date(),
    });

    mockPrisma.student.findFirst.mockResolvedValue(baseStudent);
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(basePeriod);
    mockPrisma.tenantSetting.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GpaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GpaService>(GpaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when student does not exist', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(
      service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw NotFoundException when academic period does not exist', async () => {
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(null);

    await expect(
      service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID),
    ).rejects.toThrow(NotFoundException);
  });

  it('should return null gpa_value when no snapshots exist', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);

    const result = await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    expect(result.gpa_value).toBeNull();
  });

  it('should compute GPA with credit hours when grading scale provides gpa_value', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: CLASS_ID,
        subject_id: SUBJECT_ID,
        computed_value: 85, // 85% → "B" → gpa 3.0
        class_entity: { id: CLASS_ID },
        subject: { id: SUBJECT_ID },
      },
      {
        class_id: CLASS_ID,
        subject_id: 'subject-2',
        computed_value: 95, // 95% → "A" → gpa 4.0
        class_entity: { id: CLASS_ID },
        subject: { id: 'subject-2' },
      },
    ]);

    mockPrisma.classSubjectGradeConfig.findFirst
      .mockResolvedValueOnce({
        credit_hours: 3,
        grading_scale: {
          config_json: {
            type: 'numeric',
            ranges: [
              { min: 90, max: 100, label: 'A', gpa_value: 4.0 },
              { min: 80, max: 89.99, label: 'B', gpa_value: 3.0 },
            ],
          },
        },
      })
      .mockResolvedValueOnce({
        credit_hours: 3,
        grading_scale: {
          config_json: {
            type: 'numeric',
            ranges: [
              { min: 90, max: 100, label: 'A', gpa_value: 4.0 },
              { min: 80, max: 89.99, label: 'B', gpa_value: 3.0 },
            ],
          },
        },
      });

    await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    // (3.0 * 3 + 4.0 * 3) / 6 = 3.5
    expect(mockRlsTx.gpaSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          gpa_value: 3.5,
          credit_hours_total: 6,
        }),
      }),
    );
  });

  it('should use equal weighting (no credit hours) when credit_hours is null', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: CLASS_ID,
        subject_id: SUBJECT_ID,
        computed_value: 80, // 80% → 3.2 on 4.0 scale via fallback
        class_entity: { id: CLASS_ID },
        subject: { id: SUBJECT_ID },
      },
      {
        class_id: CLASS_ID,
        subject_id: 'subject-2',
        computed_value: 60, // 60% → 2.4 on 4.0 scale via fallback
        class_entity: { id: CLASS_ID },
        subject: { id: 'subject-2' },
      },
    ]);

    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      credit_hours: null,
      grading_scale: null,
    });

    await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    // Fallback: (80/100)*4 = 3.2, (60/100)*4 = 2.4, equal weighted → (3.2+2.4)/2 = 2.8
    expect(mockRlsTx.gpaSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          gpa_value: 2.8,
          credit_hours_total: 2, // equal: 2 subjects
        }),
      }),
    );
  });

  it('should apply custom gpaPrecision setting from tenant settings', async () => {
    mockPrisma.tenantSetting.findFirst.mockResolvedValue({
      settings: { gradebook: { gpaPrecision: 3 } },
    });

    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: CLASS_ID,
        subject_id: SUBJECT_ID,
        computed_value: 75, // (75/100)*4 = 3.0
        class_entity: { id: CLASS_ID },
        subject: { id: SUBJECT_ID },
      },
    ]);

    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      credit_hours: null,
      grading_scale: null,
    });

    await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    // 75/100 * 4 = 3.0 (rounded to 3 decimals = 3.000)
    expect(mockRlsTx.gpaSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          gpa_value: 3.0,
        }),
      }),
    );
  });

  it('should upsert gpa_snapshot with correct tenant_id and student_id', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        class_id: CLASS_ID,
        subject_id: SUBJECT_ID,
        computed_value: 70,
        class_entity: { id: CLASS_ID },
        subject: { id: SUBJECT_ID },
      },
    ]);

    mockPrisma.classSubjectGradeConfig.findFirst.mockResolvedValue({
      credit_hours: null,
      grading_scale: null,
    });

    await service.computeGpa(TENANT_ID, STUDENT_ID, PERIOD_ID);

    expect(mockRlsTx.gpaSnapshot.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          idx_gpa_snapshots_unique: {
            tenant_id: TENANT_ID,
            student_id: STUDENT_ID,
            academic_period_id: PERIOD_ID,
          },
        },
        create: expect.objectContaining({
          tenant_id: TENANT_ID,
          student_id: STUDENT_ID,
          academic_period_id: PERIOD_ID,
        }),
      }),
    );
  });
});

describe('GpaService — getCumulativeGpa', () => {
  let service: GpaService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    mockPrisma.student.findFirst.mockResolvedValue(baseStudent);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GpaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GpaService>(GpaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return cumulative_gpa of null when no snapshots', async () => {
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([]);

    const result = await service.getCumulativeGpa(TENANT_ID, STUDENT_ID);

    expect(result.cumulative_gpa).toBeNull();
    expect(result.periods).toHaveLength(0);
  });

  it('should compute weighted cumulative GPA across multiple periods', async () => {
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([
      {
        gpa_value: 3.5,
        credit_hours_total: 6,
        snapshot_at: new Date(),
        academic_period: { id: 'p1', name: 'Term 1', start_date: new Date('2025-09-01') },
      },
      {
        gpa_value: 3.0,
        credit_hours_total: 3,
        snapshot_at: new Date(),
        academic_period: { id: 'p2', name: 'Term 2', start_date: new Date('2026-01-01') },
      },
    ]);

    const result = await service.getCumulativeGpa(TENANT_ID, STUDENT_ID);

    // Weighted: (3.5 * 6 + 3.0 * 3) / 9 = (21 + 9) / 9 = 30/9 = 3.333
    expect(result.cumulative_gpa).toBeCloseTo(3.333, 2);
    expect(result.periods).toHaveLength(2);
  });

  it('should throw NotFoundException when student does not exist', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(
      service.getCumulativeGpa(TENANT_ID, STUDENT_ID),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('GpaService — getGpaSnapshot', () => {
  let service: GpaService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GpaService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<GpaService>(GpaService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return null gpa_value when no snapshot exists', async () => {
    mockPrisma.gpaSnapshot.findFirst.mockResolvedValue(null);

    const result = await service.getGpaSnapshot(TENANT_ID, STUDENT_ID, PERIOD_ID);

    expect(result.gpa_value).toBeNull();
  });

  it('should return GPA data when snapshot exists', async () => {
    mockPrisma.gpaSnapshot.findFirst.mockResolvedValue({
      gpa_value: 3.75,
      credit_hours_total: 9,
      snapshot_at: new Date('2026-01-15'),
      academic_period: { id: PERIOD_ID, name: 'Term 1' },
    });

    const result = await service.getGpaSnapshot(TENANT_ID, STUDENT_ID, PERIOD_ID);

    expect(result.gpa_value).toBe(3.75);
    expect(result.credit_hours_total).toBe(9);
  });
});
