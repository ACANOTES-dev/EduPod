import { Test, TestingModule } from '@nestjs/testing';

import { MOCK_FACADE_PROVIDERS, ClassesReadFacade } from '../../../common/tests/mock-facades';
import { PrismaService } from '../../prisma/prisma.service';

import { ReportCardAnalyticsService } from './report-card-analytics.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PERIOD_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const CLASS_ID_A = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const CLASS_ID_B = 'dddddddd-dddd-dddd-dddd-dddddddddddd';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildMockPrisma() {
  return {
    reportCard: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    reportCardApproval: {
      count: jest.fn(),
    },
    classEnrolment: {
      count: jest.fn(),
    },
    // Round-2 QA: dashboard now returns separate counters from the
    // overall + subject comment tables. Default to zero so legacy tests
    // don't have to know about them.
    reportCardOverallComment: {
      count: jest.fn().mockResolvedValue(0),
    },
    reportCardSubjectComment: {
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

// ─── getDashboard ─────────────────────────────────────────────────────────────

const mockClassesFacade = { countEnrolmentsGeneric: jest.fn() };

describe('ReportCardAnalyticsService — getDashboard', () => {
  let service: ReportCardAnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        { provide: ClassesReadFacade, useValue: mockClassesFacade },
        ReportCardAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardAnalyticsService>(ReportCardAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should return dashboard counts and correct completion rate', async () => {
    // count calls: total, published, draft, revised
    mockPrisma.reportCard.count
      .mockResolvedValueOnce(50) // total
      .mockResolvedValueOnce(30) // published
      .mockResolvedValueOnce(15) // draft
      .mockResolvedValueOnce(5) // revised
      .mockResolvedValueOnce(20); // publishedWithComment

    mockPrisma.reportCardApproval.count.mockResolvedValue(3);
    mockClassesFacade.countEnrolmentsGeneric.mockResolvedValue(40); // active students

    const result = await service.getDashboard(TENANT_ID, PERIOD_ID);

    expect(result.total).toBe(50);
    expect(result.published).toBe(30);
    expect(result.draft).toBe(15);
    expect(result.revised).toBe(5);
    expect(result.pending_approval).toBe(3);
    expect(result.period_id).toBe(PERIOD_ID);
    // 30 published / 40 students = 75%
    expect(result.completion_rate).toBe(75);
    // 20 with comment / 30 published = 66.67%
    expect(result.comment_fill_rate).toBeCloseTo(66.67, 1);
  });

  it('should return completion_rate 0 when there are no active students', async () => {
    mockPrisma.reportCard.count
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(5);

    mockPrisma.reportCardApproval.count.mockResolvedValue(0);
    mockClassesFacade.countEnrolmentsGeneric.mockResolvedValue(0); // no active students

    const result = await service.getDashboard(TENANT_ID, PERIOD_ID);

    expect(result.completion_rate).toBe(0);
  });

  it('should return comment_fill_rate 0 when no report cards are published', async () => {
    mockPrisma.reportCard.count
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(0) // published = 0
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0); // publishedWithComment = 0

    mockPrisma.reportCardApproval.count.mockResolvedValue(0);
    mockClassesFacade.countEnrolmentsGeneric.mockResolvedValue(15);

    const result = await service.getDashboard(TENANT_ID, PERIOD_ID);

    expect(result.comment_fill_rate).toBe(0);
  });

  it('should return period_id null when no period is specified', async () => {
    mockPrisma.reportCard.count.mockResolvedValue(0);
    mockPrisma.reportCardApproval.count.mockResolvedValue(0);
    mockClassesFacade.countEnrolmentsGeneric.mockResolvedValue(0);

    const result = await service.getDashboard(TENANT_ID);

    expect(result.period_id).toBeNull();
    // No period → classEnrolment.count is never called → completion_rate = 0
    expect(result.completion_rate).toBe(0);
  });

  it('should not call classEnrolment.count when no period is specified', async () => {
    mockPrisma.reportCard.count.mockResolvedValue(0);
    mockPrisma.reportCardApproval.count.mockResolvedValue(0);

    await service.getDashboard(TENANT_ID);

    expect(mockPrisma.classEnrolment.count).not.toHaveBeenCalled();
  });

  it('translates the "full_year" sentinel into academic_period_id IS NULL', async () => {
    mockPrisma.reportCard.count.mockResolvedValue(0);
    mockPrisma.reportCardApproval.count.mockResolvedValue(0);
    mockClassesFacade.countEnrolmentsGeneric.mockResolvedValue(0);

    await service.getDashboard(TENANT_ID, 'full_year');

    // Every report_card.count call must carry the explicit NULL scope so
    // Postgres compares IS NULL rather than attempting a UUID cast on the
    // literal sentinel string (which would 500 with "invalid UUID").
    for (const call of mockPrisma.reportCard.count.mock.calls) {
      expect(call[0].where.academic_period_id).toBeNull();
    }
    // The approvals count must also forward the NULL scope via the nested
    // report_card relation filter.
    for (const call of mockPrisma.reportCardApproval.count.mock.calls) {
      expect(call[0].where.report_card.academic_period_id).toBeNull();
    }
  });

  it('returns separate finalised + total counters for overall and subject comments', async () => {
    mockPrisma.reportCard.count.mockResolvedValue(0);
    mockPrisma.reportCardApproval.count.mockResolvedValue(0);
    mockClassesFacade.countEnrolmentsGeneric.mockResolvedValue(0);
    // Two count() calls per comment table: total then finalised. The
    // service issues them via Promise.all so the call order in the mock
    // queue follows the destructuring order in source.
    mockPrisma.reportCardOverallComment.count
      .mockResolvedValueOnce(25) // total
      .mockResolvedValueOnce(20); // finalised
    mockPrisma.reportCardSubjectComment.count
      .mockResolvedValueOnce(175) // total
      .mockResolvedValueOnce(150); // finalised

    const result = await service.getDashboard(TENANT_ID, PERIOD_ID);

    expect(result.overall_comments_total).toBe(25);
    expect(result.overall_comments_finalised).toBe(20);
    expect(result.subject_comments_total).toBe(175);
    expect(result.subject_comments_finalised).toBe(150);
    // Both comment count queries must scope by the same period filter that
    // the report_card counts use.
    for (const call of mockPrisma.reportCardOverallComment.count.mock.calls) {
      expect(call[0].where.academic_period_id).toBe(PERIOD_ID);
    }
    for (const call of mockPrisma.reportCardSubjectComment.count.mock.calls) {
      expect(call[0].where.academic_period_id).toBe(PERIOD_ID);
    }
  });
});

// ─── getClassComparison ───────────────────────────────────────────────────────

describe('ReportCardAnalyticsService — getClassComparison', () => {
  let service: ReportCardAnalyticsService;
  let mockPrisma: ReturnType<typeof buildMockPrisma>;

  beforeEach(async () => {
    mockPrisma = buildMockPrisma();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ...MOCK_FACADE_PROVIDERS,
        ReportCardAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ReportCardAnalyticsService>(ReportCardAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should group report cards by homeroom class and compute averages', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([
      {
        id: 'rc-1',
        status: 'published',
        snapshot_payload_json: {
          subjects: [{ computed_value: 80 }, { computed_value: 90 }],
        },
        student: {
          id: 'student-1',
          homeroom_class: { id: CLASS_ID_A, name: 'Class A' },
        },
      },
      {
        id: 'rc-2',
        status: 'published',
        snapshot_payload_json: {
          subjects: [{ computed_value: 70 }, { computed_value: 60 }],
        },
        student: {
          id: 'student-2',
          homeroom_class: { id: CLASS_ID_A, name: 'Class A' },
        },
      },
      {
        id: 'rc-3',
        status: 'published',
        snapshot_payload_json: {
          subjects: [{ computed_value: 95 }],
        },
        student: {
          id: 'student-3',
          homeroom_class: { id: CLASS_ID_B, name: 'Class B' },
        },
      },
    ]);

    const result = await service.getClassComparison(TENANT_ID, PERIOD_ID);

    expect(result).toHaveLength(2);

    const classA = result.find((c) => c.class_id === CLASS_ID_A);
    expect(classA).toBeDefined();
    expect(classA!.student_count).toBe(2);
    expect(classA!.published_count).toBe(2);
    // rc-1 avg: (80+90)/2 = 85, rc-2 avg: (70+60)/2 = 65 → classA avg = (85+65)/2 = 75
    expect(classA!.average_grade).toBeCloseTo(75, 1);
    expect(classA!.completion_rate).toBe(100);

    const classB = result.find((c) => c.class_id === CLASS_ID_B);
    expect(classB).toBeDefined();
    expect(classB!.average_grade).toBe(95);
  });

  it('should return results sorted by class name', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([
      {
        id: 'rc-1',
        status: 'published',
        snapshot_payload_json: null,
        student: { id: 's1', homeroom_class: { id: CLASS_ID_B, name: 'Zebra Class' } },
      },
      {
        id: 'rc-2',
        status: 'published',
        snapshot_payload_json: null,
        student: { id: 's2', homeroom_class: { id: CLASS_ID_A, name: 'Apple Class' } },
      },
    ]);

    const result = await service.getClassComparison(TENANT_ID, PERIOD_ID);

    expect(result[0]?.class_name).toBe('Apple Class');
    expect(result[1]?.class_name).toBe('Zebra Class');
  });

  it('should return empty array when no report cards exist', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([]);

    const result = await service.getClassComparison(TENANT_ID, PERIOD_ID);

    expect(result).toHaveLength(0);
  });

  it('should skip students without a homeroom class', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([
      {
        id: 'rc-1',
        status: 'published',
        snapshot_payload_json: null,
        student: { id: 's1', homeroom_class: null },
      },
    ]);

    const result = await service.getClassComparison(TENANT_ID, PERIOD_ID);

    expect(result).toHaveLength(0);
  });

  it('should set average_grade 0 when no published report cards in a class', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([
      {
        id: 'rc-1',
        status: 'draft', // not published
        snapshot_payload_json: null,
        student: { id: 's1', homeroom_class: { id: CLASS_ID_A, name: 'Class A' } },
      },
    ]);

    const result = await service.getClassComparison(TENANT_ID, PERIOD_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.published_count).toBe(0);
    expect(result[0]!.average_grade).toBe(0);
    expect(result[0]!.completion_rate).toBe(0);
  });

  it('should handle snapshot without subjects gracefully', async () => {
    mockPrisma.reportCard.findMany.mockResolvedValue([
      {
        id: 'rc-1',
        status: 'published',
        snapshot_payload_json: { subjects: [] }, // empty subjects
        student: { id: 's1', homeroom_class: { id: CLASS_ID_A, name: 'Class A' } },
      },
    ]);

    const result = await service.getClassComparison(TENANT_ID, PERIOD_ID);

    expect(result).toHaveLength(1);
    expect(result[0]!.average_grade).toBe(0); // no grades to average
  });
});
