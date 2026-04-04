import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { ReportCardsQueriesService } from './report-cards-queries.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const REPORT_CARD_ID = 'rc-1';
const STUDENT_ID = 'student-1';
const PERIOD_ID = 'period-1';
const CLASS_ID = 'class-1';

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
    student: { findFirst: jest.fn() },
    gpaSnapshot: { findMany: jest.fn() },
  };
}

// ─── findAll Tests ───────────────────────────────────────────────────────────

describe('ReportCardsQueriesService — findAll', () => {
  let service: ReportCardsQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportCardsQueriesService, { provide: PrismaService, useValue: mockPrisma }],
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
      providers: [ReportCardsQueriesService, { provide: PrismaService, useValue: mockPrisma }],
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

// ─── gradeOverview Tests ─────────────────────────────────────────────────────

describe('ReportCardsQueriesService — gradeOverview', () => {
  let service: ReportCardsQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportCardsQueriesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ReportCardsQueriesService>(ReportCardsQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return paginated grade overview', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        id: 'snap-1',
        computed_value: 85,
        display_value: 'A',
        overridden_value: null,
        student: {
          id: STUDENT_ID,
          first_name: 'Ali',
          last_name: 'Hassan',
          student_number: 'STU001',
        },
        subject: { id: 's1', name: 'Math' },
        academic_period: { id: PERIOD_ID, name: 'Term 1' },
        class_entity: { id: CLASS_ID, name: '5A' },
      },
    ]);
    mockPrisma.periodGradeSnapshot.count.mockResolvedValue(1);

    const result = await service.gradeOverview(TENANT_ID, {
      page: 1,
      pageSize: 20,
    });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]?.student_name).toBe('Ali Hassan');
    expect(result.data[0]?.final_grade).toBe('A');
    expect(result.data[0]?.has_override).toBe(false);
    expect(result.meta.total).toBe(1);
  });

  it('should use overridden_value for final_grade when present', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        id: 'snap-1',
        computed_value: 85,
        display_value: 'A',
        overridden_value: 'A+',
        student: {
          id: STUDENT_ID,
          first_name: 'Ali',
          last_name: 'Hassan',
          student_number: 'STU001',
        },
        subject: { id: 's1', name: 'Math' },
        academic_period: { id: PERIOD_ID, name: 'Term 1' },
        class_entity: { id: CLASS_ID, name: '5A' },
      },
    ]);
    mockPrisma.periodGradeSnapshot.count.mockResolvedValue(1);

    const result = await service.gradeOverview(TENANT_ID, {
      page: 1,
      pageSize: 20,
    });

    expect(result.data[0]?.final_grade).toBe('A+');
    expect(result.data[0]?.has_override).toBe(true);
  });

  it('should filter by class_id and academic_period_id', async () => {
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([]);
    mockPrisma.periodGradeSnapshot.count.mockResolvedValue(0);

    await service.gradeOverview(TENANT_ID, {
      page: 1,
      pageSize: 20,
      class_id: CLASS_ID,
      academic_period_id: PERIOD_ID,
    });

    expect(mockPrisma.periodGradeSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          class_id: CLASS_ID,
          academic_period_id: PERIOD_ID,
        }),
      }),
    );
  });
});

// ─── buildBatchSnapshots Tests ───────────────────────────────────────────────

describe('ReportCardsQueriesService — buildBatchSnapshots', () => {
  let service: ReportCardsQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportCardsQueriesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ReportCardsQueriesService>(ReportCardsQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when period not found', async () => {
    mockPrisma.academicPeriod.findFirst.mockResolvedValue(null);

    await expect(service.buildBatchSnapshots(TENANT_ID, CLASS_ID, PERIOD_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return empty array when no enrolments', async () => {
    mockPrisma.academicPeriod.findFirst.mockResolvedValue({
      id: PERIOD_ID,
      name: 'Term 1',
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-03-31'),
      academic_year: { id: 'ay-1', name: '2025-2026' },
    });
    mockPrisma.classEnrolment.findMany.mockResolvedValue([]);

    const result = await service.buildBatchSnapshots(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result).toEqual([]);
  });

  it('should build payloads for each enrolled student', async () => {
    mockPrisma.academicPeriod.findFirst.mockResolvedValue({
      id: PERIOD_ID,
      name: 'Term 1',
      start_date: new Date('2026-01-01'),
      end_date: new Date('2026-03-31'),
      academic_year: { id: 'ay-1', name: '2025-2026' },
    });
    mockPrisma.classEnrolment.findMany.mockResolvedValue([
      {
        student: {
          id: STUDENT_ID,
          first_name: 'Ali',
          last_name: 'Hassan',
          student_number: 'STU001',
          year_group: { name: 'Year 5' },
          homeroom_class: { name: '5A' },
        },
      },
    ]);
    mockPrisma.periodGradeSnapshot.findMany.mockResolvedValue([
      {
        student_id: STUDENT_ID,
        subject_id: 's1',
        computed_value: 85,
        display_value: 'A',
        overridden_value: null,
        subject: { id: 's1', name: 'Math', code: 'MATH' },
      },
    ]);
    mockPrisma.dailyAttendanceSummary.groupBy.mockResolvedValue([
      { derived_status: 'present', _count: { id: 40 } },
      { derived_status: 'absent', _count: { id: 5 } },
    ]);

    const result = await service.buildBatchSnapshots(TENANT_ID, CLASS_ID, PERIOD_ID);

    expect(result).toHaveLength(1);
    expect(result[0]?.studentId).toBe(STUDENT_ID);

    const payload = result[0]?.payload as Record<string, unknown>;
    const subjects = payload?.subjects as Array<Record<string, unknown>>;
    expect(subjects).toHaveLength(1);

    const attendance = payload?.attendance_summary as Record<string, number>;
    expect(attendance?.total_days).toBe(45);
    expect(attendance?.present_days).toBe(40);
    expect(attendance?.absent_days).toBe(5);
  });
});

// ─── generateTranscript Tests ────────────────────────────────────────────────

describe('ReportCardsQueriesService — generateTranscript', () => {
  let service: ReportCardsQueriesService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportCardsQueriesService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();

    service = module.get<ReportCardsQueriesService>(ReportCardsQueriesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should throw NotFoundException when student not found', async () => {
    mockPrisma.student.findFirst.mockResolvedValue(null);

    await expect(service.generateTranscript(TENANT_ID, STUDENT_ID)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('should return structured transcript with years and periods', async () => {
    mockPrisma.student.findFirst.mockResolvedValue({
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
    mockPrisma.student.findFirst.mockResolvedValue({
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
