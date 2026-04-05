/**
 * Additional branch coverage for GradeAnalyticsService.
 * Targets: passFailRates (yearGroupId filter, subjectId filter, academicPeriodId filter,
 * maxScore=0 edge, no subject assessments), and all filter branches.
 */
import { Test, TestingModule } from '@nestjs/testing';

import { GradeAnalyticsService } from './grade-analytics.service';
import { ReportsDataAccessService } from './reports-data-access.service';

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function buildMockDataAccess() {
  return {
    findClasses: jest.fn().mockResolvedValue([]),
    findAssessments: jest.fn().mockResolvedValue([]),
    findGrades: jest.fn().mockResolvedValue([]),
    findStudents: jest.fn().mockResolvedValue([]),
    groupGradesBy: jest.fn().mockResolvedValue([]),
    findGpaSnapshots: jest.fn().mockResolvedValue([]),
    findPeriodGradeSnapshots: jest.fn().mockResolvedValue([]),
  };
}

describe('GradeAnalyticsService — branch coverage', () => {
  let service: GradeAnalyticsService;
  let dataAccess: ReturnType<typeof buildMockDataAccess>;

  beforeEach(async () => {
    dataAccess = buildMockDataAccess();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GradeAnalyticsService,
        { provide: ReportsDataAccessService, useValue: dataAccess },
      ],
    }).compile();

    service = module.get<GradeAnalyticsService>(GradeAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── passFailRates ────────────────────────────────────────────────────────

  describe('GradeAnalyticsService — passFailRates', () => {
    it('should return empty when no assessments', async () => {
      const result = await service.passFailRates(TENANT_ID);
      expect(result).toHaveLength(0);
    });

    it('should filter by yearGroupId', async () => {
      dataAccess.findClasses.mockResolvedValue([{ id: 'c-1' }]);
      dataAccess.findAssessments.mockResolvedValue([]);

      await service.passFailRates(TENANT_ID, 'yg-1');

      expect(dataAccess.findClasses).toHaveBeenCalledWith(
        TENANT_ID,
        { year_group_id: 'yg-1' },
        { id: true },
      );
    });

    it('should filter by subjectId', async () => {
      dataAccess.findAssessments.mockResolvedValue([]);

      await service.passFailRates(TENANT_ID, undefined, 'sub-1');

      expect(dataAccess.findAssessments).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          where: expect.objectContaining({ subject_id: 'sub-1' }),
        }),
      );
    });

    it('should filter by academicPeriodId', async () => {
      dataAccess.findAssessments.mockResolvedValue([]);

      await service.passFailRates(TENANT_ID, undefined, undefined, 'period-1');

      expect(dataAccess.findAssessments).toHaveBeenCalledWith(
        TENANT_ID,
        expect.objectContaining({
          where: expect.objectContaining({ academic_period_id: 'period-1' }),
        }),
      );
    });

    it('should compute pass/fail rates from grades', async () => {
      dataAccess.findAssessments.mockResolvedValue([
        {
          id: 'a-1',
          max_score: 100,
          subject: { id: 'sub-1', name: 'Math' },
          class_entity: { name: 'Class A', year_group: { name: 'Year 1' } },
        },
      ]);
      dataAccess.findGrades.mockResolvedValue([
        { raw_score: 70 }, // 70% — pass
        { raw_score: 40 }, // 40% — fail
        { raw_score: 50 }, // 50% — pass (exactly threshold)
      ]);

      const result = await service.passFailRates(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.pass_count).toBe(2);
      expect(result[0]!.fail_count).toBe(1);
      expect(result[0]!.total_count).toBe(3);
    });

    it('should handle assessment with no subject (skip it)', async () => {
      dataAccess.findAssessments.mockResolvedValue([
        {
          id: 'a-1',
          max_score: 100,
          subject: null,
          class_entity: { name: 'Class A', year_group: null },
        },
      ]);

      const result = await service.passFailRates(TENANT_ID);

      expect(result).toHaveLength(0);
    });

    it('edge: should handle maxScore=0 (all fail)', async () => {
      dataAccess.findAssessments.mockResolvedValue([
        {
          id: 'a-1',
          max_score: 0,
          subject: { id: 'sub-1', name: 'Math' },
          class_entity: { name: 'Class A', year_group: { name: 'Year 1' } },
        },
      ]);
      dataAccess.findGrades.mockResolvedValue([{ raw_score: 0 }]);

      const result = await service.passFailRates(TENANT_ID);

      expect(result).toHaveLength(1);
      expect(result[0]!.fail_count).toBe(1);
      expect(result[0]!.pass_count).toBe(0);
    });

    it('should aggregate across multiple assessments for same subject', async () => {
      dataAccess.findAssessments.mockResolvedValue([
        {
          id: 'a-1',
          max_score: 100,
          subject: { id: 'sub-1', name: 'Math' },
          class_entity: { name: 'Class A', year_group: { name: 'Year 1' } },
        },
        {
          id: 'a-2',
          max_score: 50,
          subject: { id: 'sub-1', name: 'Math' },
          class_entity: { name: 'Class B', year_group: { name: 'Year 1' } },
        },
      ]);
      dataAccess.findGrades
        .mockResolvedValueOnce([{ raw_score: 60 }]) // 60% pass
        .mockResolvedValueOnce([{ raw_score: 20 }]); // 40% fail

      const result = await service.passFailRates(TENANT_ID);

      expect(result).toHaveLength(1); // Same subject aggregated
      expect(result[0]!.total_count).toBe(2);
    });
  });
});
