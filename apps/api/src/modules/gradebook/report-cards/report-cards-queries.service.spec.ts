import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import {
  AcademicReadFacade,
  ClassesReadFacade,
  MOCK_FACADE_PROVIDERS,
  SchedulingReadFacade,
  StaffProfileReadFacade,
  StudentReadFacade,
} from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';

import { ReportCardsQueriesService } from './report-cards-queries.service';

const mockS3Service = {
  getPresignedUrl: jest.fn().mockResolvedValue('https://signed.example/url'),
};

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REPORT_CARD_ID = 'rc-1';
const STUDENT_ID = 'student-1';
const PERIOD_ID = 'period-1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    reportCard: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
    },
    periodGradeSnapshot: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
    academicPeriod: { findFirst: jest.fn() },
    classEnrolment: { findMany: jest.fn() },
    dailyAttendanceSummary: { groupBy: jest.fn() },
    student: { findFirst: jest.fn(), findMany: jest.fn() },
    gpaSnapshot: { findMany: jest.fn() },
    class: { findFirst: jest.fn(), findMany: jest.fn() },
    classSubjectGradeConfig: { findMany: jest.fn() },
    subjectPeriodWeight: { findMany: jest.fn() },
    periodYearWeight: { findMany: jest.fn() },
    assessment: { groupBy: jest.fn() },
    teacherCompetency: { findMany: jest.fn() },
  };
}

function buildMockStudentReadFacade() {
  return {
    findOneGeneric: jest.fn().mockResolvedValue(null),
  };
}

// ─── findAll Tests ───────────────────────────────────────────────────────────

describe('ReportCardsQueriesService — findAll', () => {
  let service: ReportCardsQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportCardsQueriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3Service },
      ],
    }).compile();

    service = module.get<ReportCardsQueriesService>(ReportCardsQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated report cards', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([
      {
        id: REPORT_CARD_ID,
        student: {
          id: STUDENT_ID,
          first_name: 'Ali',
          last_name: 'Hassan',
          student_number: 'STU001',
        },
        academic_period: { id: PERIOD_ID, name: 'Term 1' },
        published_by: null,
      },
    ]);
    mockPrisma.reportCard.count.mockResolvedValue(1);

    const result = await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(result.data).toHaveLength(1);
    expect(result.meta.total).toBe(1);
    expect(result.meta.page).toBe(1);
    expect(result.meta.pageSize).toBe(20);
  });

  it('should exclude revised report cards by default', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20 });

    expect(mockPrisma.reportCard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { not: 'revised' },
        }),
      }),
    );
  });

  it('should include revisions when include_revisions=true', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 1, pageSize: 20, include_revisions: true });

    const whereArg = mockPrisma.reportCard.findMany.mock.calls[0]?.[0]?.where;
    // When include_revisions is true, status should not have { not: 'revised' } filter
    expect(whereArg?.status).toBeUndefined();
  });

  it('should filter by student_id', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, {
      page: 1,
      pageSize: 20,
      student_id: STUDENT_ID,
    });

    expect(mockPrisma.reportCard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          student_id: STUDENT_ID,
        }),
      }),
    );
  });

  it('should filter by academic_period_id', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, {
      page: 1,
      pageSize: 20,
      academic_period_id: PERIOD_ID,
    });

    expect(mockPrisma.reportCard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          academic_period_id: PERIOD_ID,
        }),
      }),
    );
  });

  it('should filter by status', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, {
      page: 1,
      pageSize: 20,
      status: 'published',
    });

    expect(mockPrisma.reportCard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'published',
        }),
      }),
    );
  });

  it('should apply correct pagination skip', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.count.mockResolvedValue(0);

    await service.findAll(TENANT_ID, { page: 3, pageSize: 10 });

    expect(mockPrisma.reportCard.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 20,
        take: 10,
      }),
    );
  });
});

// ─── findOne Tests ───────────────────────────────────────────────────────────

describe('ReportCardsQueriesService — findOne', () => {
  let service: ReportCardsQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportCardsQueriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3Service },
      ],
    }).compile();

    service = module.get<ReportCardsQueriesService>(ReportCardsQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when report card not found', async () => {
    mockPrisma.reportCard.findFirst.mockResolvedValue(null);

    await expect(service.findOne(TENANT_ID, REPORT_CARD_ID)).rejects.toThrow(NotFoundException);
  });

  it('should return report card with revision chain', async () => {
    const reportCard = {
      id: REPORT_CARD_ID,
      student: { id: STUDENT_ID, first_name: 'Ali', last_name: 'Hassan', student_number: 'STU001' },
      academic_period: { id: PERIOD_ID, name: 'Term 1' },
      published_by: null,
      revision_of: null,
      revisions: [
        { id: 'rc-2', status: 'published', published_at: new Date(), created_at: new Date() },
      ],
    };
    mockPrisma.reportCard.findFirst.mockResolvedValue(reportCard);

    const result = await service.findOne(TENANT_ID, REPORT_CARD_ID);

    expect(result.id).toBe(REPORT_CARD_ID);
    expect(result.revisions).toHaveLength(1);
  });
});

// ─── generateTranscript Tests ────────────────────────────────────────────────

describe('ReportCardsQueriesService — generateTranscript', () => {
  let service: ReportCardsQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockStudentFacade: ReturnType<typeof buildMockStudentReadFacade>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockStudentFacade = buildMockStudentReadFacade();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportCardsQueriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3Service },
        { provide: StudentReadFacade, useValue: mockStudentFacade },
      ],
    }).compile();

    service = module.get<ReportCardsQueriesService>(ReportCardsQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when student not found', async () => {
    mockStudentFacade.findOneGeneric.mockResolvedValue(null);

    await expect(service.generateTranscript(TENANT_ID, STUDENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return structured transcript with years and periods', async () => {
    mockStudentFacade.findOneGeneric.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
      student_number: 'STU001',
      year_group: { id: 'yg-1', name: 'Year 5' },
    });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        student_id: STUDENT_ID,
        subject_id: 's1',
        computed_value: 88,
        display_value: 'A',
        overridden_value: null,
        subject: { id: 's1', name: 'Math', code: 'MATH' },
        academic_period: {
          id: 'p1',
          name: 'Term 1',
          start_date: new Date('2025-09-01'),
          end_date: new Date('2025-12-15'),
          academic_year: { id: 'ay-1', name: '2025-2026' },
        },
      },
    ]);
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([
      { academic_period_id: 'p1', gpa_value: 3.7 },
    ]);
    mockPrisma.reportCard.findMany.mockResolvedValue([
      {
        academic_period_id: 'p1',
        teacher_comment: 'Excellent progress',
        principal_comment: null,
        published_at: new Date(),
      },
    ]);

    const result = await service.generateTranscript(TENANT_ID, STUDENT_ID);

    expect(result.student.id).toBe(STUDENT_ID);
    expect(result.academic_years).toHaveLength(1);
    expect(result.academic_years[0]?.periods[0]?.gpa).toBe(3.7);
    expect(result.academic_years[0]?.periods[0]?.teacher_comment).toBe('Excellent progress');
    expect(result.academic_years[0]?.periods[0]?.subjects).toHaveLength(1);
  });

  it('should return empty academic_years when no snapshots', async () => {
    mockStudentFacade.findOneGeneric.mockResolvedValue({
      id: STUDENT_ID,
      first_name: 'Ali',
      last_name: 'Hassan',
      student_number: null,
      year_group: null,
    });
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.gpaSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.reportCard.findMany.mockResolvedValue([]);

    const result = await service.generateTranscript(TENANT_ID, STUDENT_ID);

    expect(result.academic_years).toHaveLength(0);
    expect(result.student.student_number).toBeNull();
    expect(result.student.year_group).toBeNull();
  });
});

// ─── getClassMatrix (impl 06) ──────────────────────────────────────────────

describe('ReportCardsQueriesService — getClassMatrix', () => {
  let service: ReportCardsQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockAcademicFacade: { findPeriodById: jest.Mock; findPeriodsForYear: jest.Mock };
  let mockClassesFacade: {
    findEnrolmentsGeneric: jest.Mock;
    findClassesGeneric: jest.Mock;
    findYearGroupId: jest.Mock;
  };

  const CLASS_ID_MATRIX = 'cccccccc-1111-4111-8111-111111111111';
  const SUBJECT_A_ID = 'cccccccc-2222-4222-8222-222222222222';
  const SUBJECT_B_ID = 'cccccccc-3333-4333-8333-333333333333';
  const STUDENT_A_ID = 'cccccccc-4444-4444-8444-444444444444';
  const STUDENT_B_ID = 'cccccccc-5555-4555-8555-555555555555';
  const STUDENT_C_ID = 'cccccccc-6666-4666-8666-666666666666';
  const STUDENT_D_ID = 'cccccccc-7777-4777-8777-777777777777';

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockAcademicFacade = {
      findPeriodById: jest.fn().mockResolvedValue({ id: PERIOD_ID, name: 'Term 1' }),
      findPeriodsForYear: jest.fn().mockResolvedValue([{ id: PERIOD_ID, name: 'Term 1' }]),
    };
    mockClassesFacade = {
      findEnrolmentsGeneric: jest.fn(),
      findClassesGeneric: jest.fn(),
      findYearGroupId: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportCardsQueriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3Service },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
      ],
    }).compile();

    service = module.get(ReportCardsQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  function seedClass() {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([
      {
        id: CLASS_ID_MATRIX,
        name: '5A',
        academic_year_id: 'year-1',
        year_group: { id: 'yg-1', name: 'Year 5' },
      },
    ]);
  }

  function seedEnrolments(students: Array<{ id: string; first: string; last: string }>) {
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue(
      students.map((s) => ({
        student: {
          id: s.id,
          first_name: s.first,
          last_name: s.last,
          student_number: `STU-${s.id.slice(0, 4)}`,
          preferred_second_language: null,
        },
      })),
    );
  }

  function seedSubjects(subjects: Array<{ id: string; name: string; code: string }>) {
    mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue(
      subjects.map((s) => ({
        subject: { id: s.id, name: s.name, code: s.code },
        grading_scale: null,
      })),
    );
  }

  function snapshot(
    studentId: string,
    subjectId: string,
    periodId: string,
    value: number,
    override?: string,
  ) {
    return {
      student_id: studentId,
      subject_id: subjectId,
      academic_period_id: periodId,
      computed_value: value as unknown as import('@prisma/client').Prisma.Decimal,
      display_value: `${value}%`,
      overridden_value: override ?? null,
    };
  }

  it('throws when the class does not belong to the tenant', async () => {
    mockClassesFacade.findClassesGeneric.mockResolvedValue([]);

    await expect(
      service.getClassMatrix(TENANT_ID, {
        classId: CLASS_ID_MATRIX,
        academicPeriodId: PERIOD_ID,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws when a concrete period id is not resolvable', async () => {
    seedClass();
    mockAcademicFacade.findPeriodById.mockResolvedValue(null);

    await expect(
      service.getClassMatrix(TENANT_ID, {
        classId: CLASS_ID_MATRIX,
        academicPeriodId: PERIOD_ID,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('returns an empty shell when the class has no students', async () => {
    seedClass();
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([]);
    seedSubjects([{ id: SUBJECT_A_ID, name: 'Math', code: 'MATH' }]);

    const result = await service.getClassMatrix(TENANT_ID, {
      classId: CLASS_ID_MATRIX,
      academicPeriodId: PERIOD_ID,
    });

    expect(result.students).toHaveLength(0);
    expect(result.subjects).toHaveLength(1);
    expect(result.cells).toEqual({});
    expect(result.overall_by_student).toEqual({});
  });

  it('builds a single-period matrix with weighted overall and dense top-3 ranks', async () => {
    seedClass();
    seedEnrolments([
      { id: STUDENT_A_ID, first: 'Ali', last: 'Hassan' },
      { id: STUDENT_B_ID, first: 'Ben', last: 'Ibrahim' },
      { id: STUDENT_C_ID, first: 'Cara', last: 'Jones' },
      { id: STUDENT_D_ID, first: 'Dan', last: 'Khan' },
    ]);
    seedSubjects([
      { id: SUBJECT_A_ID, name: 'Math', code: 'MATH' },
      { id: SUBJECT_B_ID, name: 'Science', code: 'SCI' },
    ]);

    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      snapshot(STUDENT_A_ID, SUBJECT_A_ID, PERIOD_ID, 95),
      snapshot(STUDENT_A_ID, SUBJECT_B_ID, PERIOD_ID, 85),
      snapshot(STUDENT_B_ID, SUBJECT_A_ID, PERIOD_ID, 95),
      snapshot(STUDENT_B_ID, SUBJECT_B_ID, PERIOD_ID, 85),
      snapshot(STUDENT_C_ID, SUBJECT_A_ID, PERIOD_ID, 70),
      snapshot(STUDENT_C_ID, SUBJECT_B_ID, PERIOD_ID, 60),
      snapshot(STUDENT_D_ID, SUBJECT_A_ID, PERIOD_ID, 50),
      snapshot(STUDENT_D_ID, SUBJECT_B_ID, PERIOD_ID, 50),
    ]);
    // Equal-weight subjects (no SubjectPeriodWeight rows configured)
    mockPrisma.subjectPeriodWeight.findMany.mockResolvedValue([]);
    mockPrisma.assessment.groupBy.mockResolvedValue([
      { subject_id: SUBJECT_A_ID, academic_period_id: PERIOD_ID, _count: { _all: 3 } },
      { subject_id: SUBJECT_B_ID, academic_period_id: PERIOD_ID, _count: { _all: 2 } },
    ]);

    const result = await service.getClassMatrix(TENANT_ID, {
      classId: CLASS_ID_MATRIX,
      academicPeriodId: PERIOD_ID,
    });

    // Shape sanity
    expect(result.class.id).toBe(CLASS_ID_MATRIX);
    expect(result.period).toEqual({ id: PERIOD_ID, name: 'Term 1' });
    expect(result.students.map((s) => s.id)).toEqual([
      STUDENT_A_ID,
      STUDENT_B_ID,
      STUDENT_C_ID,
      STUDENT_D_ID,
    ]);
    expect(result.subjects.map((s) => s.id)).toEqual([SUBJECT_A_ID, SUBJECT_B_ID]);

    // Cells carry the assessment count attributed from the groupBy result.
    expect(result.cells[STUDENT_A_ID]![SUBJECT_A_ID]!.assessment_count).toBe(3);
    expect(result.cells[STUDENT_A_ID]![SUBJECT_B_ID]!.assessment_count).toBe(2);

    // Overall weighted average = equal weight of 95 + 85 = 90, and 70+60 = 65, …
    expect(result.overall_by_student[STUDENT_A_ID]!.weighted_average).toBeCloseTo(90, 5);
    expect(result.overall_by_student[STUDENT_B_ID]!.weighted_average).toBeCloseTo(90, 5);
    expect(result.overall_by_student[STUDENT_C_ID]!.weighted_average).toBeCloseTo(65, 5);
    expect(result.overall_by_student[STUDENT_D_ID]!.weighted_average).toBeCloseTo(50, 5);

    // Dense rank: A + B tie at 1, C jumps to 3, D has no rank.
    expect(result.overall_by_student[STUDENT_A_ID]!.rank_position).toBe(1);
    expect(result.overall_by_student[STUDENT_B_ID]!.rank_position).toBe(1);
    expect(result.overall_by_student[STUDENT_C_ID]!.rank_position).toBe(3);
    expect(result.overall_by_student[STUDENT_D_ID]!.rank_position).toBeNull();
  });

  it('flags has_override on cells when the snapshot carries an overridden value', async () => {
    seedClass();
    seedEnrolments([{ id: STUDENT_A_ID, first: 'Ali', last: 'Hassan' }]);
    seedSubjects([{ id: SUBJECT_A_ID, name: 'Math', code: 'MATH' }]);

    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      snapshot(STUDENT_A_ID, SUBJECT_A_ID, PERIOD_ID, 50, 'A+'),
    ]);
    mockPrisma.subjectPeriodWeight.findMany.mockResolvedValue([]);
    mockPrisma.assessment.groupBy.mockResolvedValue([]);

    const result = await service.getClassMatrix(TENANT_ID, {
      classId: CLASS_ID_MATRIX,
      academicPeriodId: PERIOD_ID,
    });

    const cell = result.cells[STUDENT_A_ID]![SUBJECT_A_ID]!;
    expect(cell.has_override).toBe(true);
    // Without a grading scale on the subject, the grade is derived from the
    // score via applyGradingScale's no-scale fallback (rounded percentage).
    // The override flag is preserved, but the raw overridden_value string is
    // NOT echoed into the grade field — score-derivation is authoritative.
    expect(cell.grade).toBe('50%');
    expect(cell.score).toBeCloseTo(50, 5);
  });

  it('derives cell.grade from the aggregated score via the subject scale, ignoring stale display_value tokens', async () => {
    // Regression guard for Bug #1 (matrix grade derivation). Before the fix,
    // the service echoed the last period's raw display_value into cell.grade,
    // which produced nonsense like "70.5%" showing up as a letter grade when
    // aggregating across periods. Now we derive the letter from the weighted
    // score using the subject's grading scale.
    seedClass();
    seedEnrolments([{ id: STUDENT_A_ID, first: 'Ali', last: 'Hassan' }]);

    // Seed a subject with a grading scale that maps 90+ → A, 80+ → B, etc.
    // Shape matches GradingScaleConfig (type: 'numeric', ranges: [{min, label}]).
    mockPrisma.classSubjectGradeConfig.findMany.mockResolvedValue([
      {
        subject: { id: SUBJECT_A_ID, name: 'Math', code: 'MATH' },
        grading_scale: {
          config_json: {
            type: 'numeric',
            ranges: [
              { min: 90, label: 'A' },
              { min: 80, label: 'B' },
              { min: 70, label: 'C' },
              { min: 60, label: 'D' },
              { min: 0, label: 'F' },
            ],
          },
        },
      },
    ]);

    const P1 = 'cccccccc-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const P2 = 'cccccccc-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    mockAcademicFacade.findPeriodsForYear.mockResolvedValue([
      { id: P1, name: 'T1' },
      { id: P2, name: 'T2' },
    ]);

    // Snapshots carry wrong display_value tokens (e.g., "70.5%" as a string
    // in a subject whose grading scale uses letters). The fix must ignore
    // these and re-derive from the aggregated numeric score.
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        student_id: STUDENT_A_ID,
        subject_id: SUBJECT_A_ID,
        academic_period_id: P1,
        computed_value: 80 as unknown as import('@prisma/client').Prisma.Decimal,
        display_value: '70.5%', // deliberately misleading
        overridden_value: null,
      },
      {
        student_id: STUDENT_A_ID,
        subject_id: SUBJECT_A_ID,
        academic_period_id: P2,
        computed_value: 90 as unknown as import('@prisma/client').Prisma.Decimal,
        display_value: '59.2%', // deliberately misleading
        overridden_value: null,
      },
    ]);
    mockPrisma.subjectPeriodWeight.findMany.mockResolvedValue([]);
    mockPrisma.periodYearWeight.findMany.mockResolvedValue([]);
    mockPrisma.assessment.groupBy.mockResolvedValue([]);

    const result = await service.getClassMatrix(TENANT_ID, {
      classId: CLASS_ID_MATRIX,
      academicPeriodId: 'all',
    });

    const cell = result.cells[STUDENT_A_ID]![SUBJECT_A_ID]!;
    // Aggregated score: equal weights → (80 + 90) / 2 = 85
    expect(cell.score).toBeCloseTo(85, 5);
    // 85 sits in the 80-89 band → 'B'. NOT the '70.5%' or '59.2%' display
    // tokens from the snapshots.
    expect(cell.grade).toBe('B');
  });

  it('aggregates across all periods when academicPeriodId === "all"', async () => {
    seedClass();
    seedEnrolments([{ id: STUDENT_A_ID, first: 'Ali', last: 'Hassan' }]);
    seedSubjects([{ id: SUBJECT_A_ID, name: 'Math', code: 'MATH' }]);

    const P1 = 'cccccccc-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const P2 = 'cccccccc-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    mockAcademicFacade.findPeriodsForYear.mockResolvedValue([
      { id: P1, name: 'T1' },
      { id: P2, name: 'T2' },
    ]);

    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      snapshot(STUDENT_A_ID, SUBJECT_A_ID, P1, 80),
      snapshot(STUDENT_A_ID, SUBJECT_A_ID, P2, 90),
    ]);
    mockPrisma.subjectPeriodWeight.findMany.mockResolvedValue([]);
    mockPrisma.periodYearWeight.findMany.mockResolvedValue([]);
    mockPrisma.assessment.groupBy.mockResolvedValue([]);

    const result = await service.getClassMatrix(TENANT_ID, {
      classId: CLASS_ID_MATRIX,
      academicPeriodId: 'all',
    });

    expect(result.period).toEqual({ id: 'all', name: 'Full year' });
    // With equal period weights: (80 + 90) / 2 = 85
    expect(result.cells[STUDENT_A_ID]![SUBJECT_A_ID]!.score).toBeCloseTo(85, 5);
    expect(result.overall_by_student[STUDENT_A_ID]!.weighted_average).toBeCloseTo(85, 5);
  });
});

// ─── listReportCardLibrary (impl 06) ───────────────────────────────────────

describe('ReportCardsQueriesService — listReportCardLibrary', () => {
  let service: ReportCardsQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;
  let mockStaffFacade: { resolveProfileId: jest.Mock };
  let mockClassesFacade: {
    findClassIdsByStaff: jest.Mock;
    findEnrolmentsGeneric: jest.Mock;
    findClassesGeneric: jest.Mock;
  };
  let mockAcademicFacade: { findCurrentYear: jest.Mock };
  let mockSchedulingFacade: { findTeacherCompetencies: jest.Mock };

  const TEACHER_ID = 'dddddddd-1111-4111-8111-111111111111';
  const STAFF_PROFILE_ID = 'dddddddd-2222-4222-8222-222222222222';
  const REPORT_ID_1 = 'dddddddd-3333-4333-8333-333333333333';
  const REPORT_ID_2 = 'dddddddd-4444-4444-8444-444444444444';
  const STUDENT_1 = 'dddddddd-5555-4555-8555-555555555555';
  const PERIOD_1 = 'dddddddd-6666-4666-8666-666666666666';
  const TEMPLATE_1 = 'dddddddd-7777-4777-8777-777777777777';

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();
    mockStaffFacade = { resolveProfileId: jest.fn() };
    mockClassesFacade = {
      findClassIdsByStaff: jest.fn().mockResolvedValue([]),
      findEnrolmentsGeneric: jest.fn().mockResolvedValue([]),
      findClassesGeneric: jest.fn().mockResolvedValue([]),
    };
    mockAcademicFacade = {
      findCurrentYear: jest.fn().mockResolvedValue(null),
    };
    mockSchedulingFacade = {
      findTeacherCompetencies: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportCardsQueriesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3Service },
        { provide: StaffProfileReadFacade, useValue: mockStaffFacade },
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        { provide: AcademicReadFacade, useValue: mockAcademicFacade },
        { provide: SchedulingReadFacade, useValue: mockSchedulingFacade },
      ],
    }).compile();

    service = module.get(ReportCardsQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  function buildReportCardRow(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: REPORT_ID_1,
      student_id: STUDENT_1,
      academic_period_id: PERIOD_1,
      template_id: TEMPLATE_1,
      template_locale: 'en',
      pdf_storage_key: 'tenant/abc/report.pdf',
      created_at: new Date('2026-03-01T10:00:00Z'),
      student: {
        id: STUDENT_1,
        first_name: 'Ali',
        last_name: 'Hassan',
        student_number: 'STU001',
        homeroom_class: { id: 'class-1', name: '5A' },
      },
      academic_period: { id: PERIOD_1, name: 'Term 1' },
      template: { id: TEMPLATE_1, content_scope: 'grades_only', locale: 'en' },
      ...overrides,
    };
  }

  it('admin callers see all non-superseded report cards', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValueOnce([buildReportCardRow()]);
    mockPrisma.reportCard.count.mockResolvedValue(1);
    mockPrisma.reportCard.findMany.mockResolvedValueOnce([
      {
        student_id: STUDENT_1,
        academic_period_id: PERIOD_1,
        template_id: TEMPLATE_1,
        template_locale: 'en',
      },
      {
        student_id: STUDENT_1,
        academic_period_id: PERIOD_1,
        template_id: TEMPLATE_1,
        template_locale: 'ar',
      },
    ]);

    const result = await service.listReportCardLibrary(
      TENANT_ID,
      { user_id: TEACHER_ID, is_admin: true },
      { page: 1, pageSize: 20 },
    );

    expect(result.meta.total).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.languages_available).toEqual(['ar', 'en']);
    expect(result.data[0]!.pdf_download_url).toBe('https://signed.example/url');
    // First findMany must NOT scope by student_id for admins
    const firstCall = mockPrisma.reportCard.findMany.mock.calls[0]![0];
    expect(firstCall.where.student_id).toBeUndefined();
    expect(firstCall.where.status).toEqual({ not: 'superseded' });
  });

  it('teacher callers with no classes get an empty list without hitting report cards', async () => {
    mockStaffFacade.resolveProfileId.mockResolvedValue(STAFF_PROFILE_ID);
    mockClassesFacade.findClassIdsByStaff.mockResolvedValue([]);
    mockAcademicFacade.findCurrentYear.mockResolvedValue(null);

    const result = await service.listReportCardLibrary(
      TENANT_ID,
      { user_id: TEACHER_ID, is_admin: false },
      { page: 1, pageSize: 20 },
    );

    expect(result.meta.total).toBe(0);
    expect(result.data).toHaveLength(0);
    expect(mockPrisma.reportCard.findMany).not.toHaveBeenCalled();
  });

  it('teacher callers are scoped to students in their homeroom / teaching classes', async () => {
    mockStaffFacade.resolveProfileId.mockResolvedValue(STAFF_PROFILE_ID);
    mockClassesFacade.findClassIdsByStaff.mockResolvedValue(['homeroom-1']);
    mockAcademicFacade.findCurrentYear.mockResolvedValue(null);
    mockClassesFacade.findEnrolmentsGeneric.mockResolvedValue([
      { student_id: STUDENT_1 },
      { student_id: 'other-student' },
    ]);
    mockPrisma.reportCard.findMany
      .mockResolvedValueOnce([buildReportCardRow()])
      .mockResolvedValueOnce([]);
    mockPrisma.reportCard.count.mockResolvedValue(1);

    const result = await service.listReportCardLibrary(
      TENANT_ID,
      { user_id: TEACHER_ID, is_admin: false },
      { page: 1, pageSize: 20 },
    );

    expect(result.meta.total).toBe(1);
    const firstCall = mockPrisma.reportCard.findMany.mock.calls[0]![0];
    expect(firstCall.where.student_id).toEqual({
      in: expect.arrayContaining([STUDENT_1, 'other-student']),
    });
  });

  it('groups languages_available by (student, period, template) from sibling query', async () => {
    mockPrisma.reportCard.findMany
      .mockResolvedValueOnce([
        buildReportCardRow(),
        buildReportCardRow({ id: REPORT_ID_2, template_locale: 'ar' }),
      ])
      .mockResolvedValueOnce([
        {
          student_id: STUDENT_1,
          academic_period_id: PERIOD_1,
          template_id: TEMPLATE_1,
          template_locale: 'en',
        },
        {
          student_id: STUDENT_1,
          academic_period_id: PERIOD_1,
          template_id: TEMPLATE_1,
          template_locale: 'ar',
        },
      ]);
    mockPrisma.reportCard.count.mockResolvedValue(2);

    const result = await service.listReportCardLibrary(
      TENANT_ID,
      { user_id: TEACHER_ID, is_admin: true },
      { page: 1, pageSize: 20 },
    );

    expect(result.data).toHaveLength(2);
    for (const row of result.data) {
      expect(row.languages_available).toEqual(['ar', 'en']);
    }
  });

  it('falls back to null download URL when presign throws', async () => {
    mockPrisma.reportCard.findMany
      .mockResolvedValueOnce([buildReportCardRow()])
      .mockResolvedValueOnce([
        {
          student_id: STUDENT_1,
          academic_period_id: PERIOD_1,
          template_id: TEMPLATE_1,
          template_locale: 'en',
        },
      ]);
    mockPrisma.reportCard.count.mockResolvedValue(1);
    mockS3Service.getPresignedUrl.mockRejectedValueOnce(new Error('S3 down'));

    const result = await service.listReportCardLibrary(
      TENANT_ID,
      { user_id: TEACHER_ID, is_admin: true },
      { page: 1, pageSize: 20 },
    );

    expect(result.data[0]!.pdf_download_url).toBeNull();
  });
});
