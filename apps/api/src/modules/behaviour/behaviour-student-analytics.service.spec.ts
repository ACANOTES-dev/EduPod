import { PrismaService } from '../prisma/prisma.service';

import { BehaviourStudentAnalyticsService } from './behaviour-student-analytics.service';

// ─── Fixtures ────────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const STUDENT_ID = 'student-1';

// ─── Mock factories ─────────────────────────────────────────────────────────

const makeMockPrisma = () => ({
  behaviourIncidentParticipant: {
    count: jest.fn().mockResolvedValue(0),
    aggregate: jest.fn().mockResolvedValue({ _sum: { points_awarded: 0 } }),
    findMany: jest.fn().mockResolvedValue([]),
  },
  behaviourIntervention: {
    count: jest.fn().mockResolvedValue(0),
  },
  behaviourSanction: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  },
  dailyAttendanceSummary: {
    count: jest.fn().mockResolvedValue(0),
    findMany: jest.fn().mockResolvedValue([]),
  },
  $queryRaw: jest.fn().mockResolvedValue([]),
});

type MockPrisma = ReturnType<typeof makeMockPrisma>;

describe('BehaviourStudentAnalyticsService', () => {
  let service: BehaviourStudentAnalyticsService;
  let mockPrisma: MockPrisma;

  beforeEach(() => {
    mockPrisma = makeMockPrisma();
    service = new BehaviourStudentAnalyticsService(mockPrisma as unknown as PrismaService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── computeAnalyticsSummary ───────────────────────────────────────────

  describe('BehaviourStudentAnalyticsService -- computeAnalyticsSummary', () => {
    it('should return zero counts when MV and direct queries return nothing', async () => {
      const result = await service.computeAnalyticsSummary(TENANT_ID, STUDENT_ID);

      expect(result.total_incidents).toBe(0);
      expect(result.positive_count).toBe(0);
      expect(result.positive_ratio).toBe(0);
      expect(result.total_points).toBe(0);
    });

    it('should use MV data when available', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([
        {
          positive_count: BigInt(10),
          negative_count: BigInt(5),
          neutral_count: BigInt(2),
          total_points: BigInt(25),
        },
      ]);

      const result = await service.computeAnalyticsSummary(TENANT_ID, STUDENT_ID);

      expect(result.total_incidents).toBe(17);
      expect(result.positive_count).toBe(10);
      expect(result.total_points).toBe(25);
      expect(result.positive_ratio).toBeCloseTo(10 / 17, 2);
    });

    it('should fall back to direct queries when MV fails', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('relation does not exist'));

      // positive, negative, neutral, points
      mockPrisma.behaviourIncidentParticipant.count
        .mockResolvedValueOnce(8)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1);
      mockPrisma.behaviourIncidentParticipant.aggregate.mockResolvedValue({
        _sum: { points_awarded: 15 },
      });

      const result = await service.computeAnalyticsSummary(TENANT_ID, STUDENT_ID);

      expect(result.total_incidents).toBe(12);
      expect(result.positive_count).toBe(8);
      expect(result.total_points).toBe(15);
    });

    it('should include active_interventions and pending_sanctions counts', async () => {
      mockPrisma.behaviourIntervention.count.mockResolvedValue(2);
      mockPrisma.behaviourSanction.count.mockResolvedValue(1);

      const result = await service.computeAnalyticsSummary(TENANT_ID, STUDENT_ID);

      expect(result.active_interventions).toBe(2);
      expect(result.pending_sanctions).toBe(1);
    });
  });

  // ─── computeWeeklyTrend ────────────────────────────────────────────────

  describe('BehaviourStudentAnalyticsService -- computeWeeklyTrend', () => {
    it('should return 13 weeks of data with zero counts by default', async () => {
      const result = await service.computeWeeklyTrend(TENANT_ID, STUDENT_ID);

      expect(result).toHaveLength(13);
      expect(result.every((w) => w.count === 0)).toBe(true);
    });

    it('should count incidents in the correct weekly bucket', async () => {
      const monday = new Date('2026-03-30'); // a Monday
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([
        { incident: { occurred_at: monday } },
        { incident: { occurred_at: monday } },
      ]);

      const result = await service.computeWeeklyTrend(TENANT_ID, STUDENT_ID);

      const weekEntry = result.find((w) => w.week_start === '2026-03-30');
      if (weekEntry) {
        expect(weekEntry.count).toBe(2);
      }
    });
  });

  // ─── computeCategoryBreakdown ──────────────────────────────────────────

  describe('BehaviourStudentAnalyticsService -- computeCategoryBreakdown', () => {
    it('should return empty array when no incidents exist', async () => {
      const result = await service.computeCategoryBreakdown(TENANT_ID, STUDENT_ID);

      expect(result).toEqual([]);
    });

    it('should group and sort by count descending', async () => {
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([
        { incident: { category_id: 'cat-1', polarity: 'negative', category: { name: 'Minor' } } },
        { incident: { category_id: 'cat-2', polarity: 'negative', category: { name: 'Major' } } },
        { incident: { category_id: 'cat-2', polarity: 'negative', category: { name: 'Major' } } },
      ]);

      const result = await service.computeCategoryBreakdown(TENANT_ID, STUDENT_ID);

      expect(result).toHaveLength(2);
      expect(result[0]!.category_name).toBe('Major');
      expect(result[0]!.count).toBe(2);
    });
  });

  // ─── computePeriodComparison ───────────────────────────────────────────

  describe('BehaviourStudentAnalyticsService -- computePeriodComparison', () => {
    it('should return empty array when no incidents have academic periods', async () => {
      const result = await service.computePeriodComparison(TENANT_ID, STUDENT_ID);

      expect(result).toEqual([]);
    });

    it('should group incidents by academic period', async () => {
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([
        {
          incident: {
            academic_period_id: 'term-1',
            academic_period: { id: 'term-1', name: 'Term 1' },
          },
        },
        {
          incident: {
            academic_period_id: 'term-1',
            academic_period: { id: 'term-1', name: 'Term 1' },
          },
        },
        {
          incident: {
            academic_period_id: 'term-2',
            academic_period: { id: 'term-2', name: 'Term 2' },
          },
        },
      ]);

      const result = await service.computePeriodComparison(TENANT_ID, STUDENT_ID);

      expect(result).toHaveLength(2);
      const term1 = result.find((p) => p.period_id === 'term-1');
      expect(term1?.incident_count).toBe(2);
    });
  });

  // ─── computeSanctionHistory ────────────────────────────────────────────

  describe('BehaviourStudentAnalyticsService -- computeSanctionHistory', () => {
    it('should return empty array when no sanctions exist', async () => {
      const result = await service.computeSanctionHistory(TENANT_ID, STUDENT_ID);

      expect(result).toEqual([]);
    });

    it('should aggregate by sanction type with served/no_show counts', async () => {
      mockPrisma.behaviourSanction.findMany.mockResolvedValue([
        { type: 'detention', status: 'served' },
        { type: 'detention', status: 'served' },
        { type: 'detention', status: 'no_show' },
        { type: 'suspension', status: 'served' },
      ]);

      const result = await service.computeSanctionHistory(TENANT_ID, STUDENT_ID);

      expect(result).toHaveLength(2);
      const detention = result.find((s) => s.type === 'detention');
      expect(detention?.total).toBe(3);
      expect(detention?.served).toBe(2);
      expect(detention?.no_show).toBe(1);
    });
  });

  // ─── computeAttendanceCorrelation ──────────────────────────────────────

  describe('BehaviourStudentAnalyticsService -- computeAttendanceCorrelation', () => {
    it('should return null when no attendance data exists', async () => {
      const result = await service.computeAttendanceCorrelation(TENANT_ID, STUDENT_ID);

      expect(result).toBeNull();
    });

    it('should correlate incidents with attendance days', async () => {
      mockPrisma.dailyAttendanceSummary.count.mockResolvedValue(5);
      mockPrisma.dailyAttendanceSummary.findMany.mockResolvedValue([
        { summary_date: new Date('2026-03-10'), derived_status: 'present' },
        { summary_date: new Date('2026-03-11'), derived_status: 'absent' },
        { summary_date: new Date('2026-03-12'), derived_status: 'present' },
        { summary_date: new Date('2026-03-13'), derived_status: 'late' },
        { summary_date: new Date('2026-03-14'), derived_status: 'absent' },
      ]);
      mockPrisma.behaviourIncidentParticipant.findMany.mockResolvedValue([
        { incident: { occurred_at: new Date('2026-03-10') } }, // present day
        { incident: { occurred_at: new Date('2026-03-11') } }, // absent day
        { incident: { occurred_at: new Date('2026-03-11') } }, // absent day
      ]);

      const result = await service.computeAttendanceCorrelation(TENANT_ID, STUDENT_ID);

      expect(result).not.toBeNull();
      expect(result?.total_days).toBe(5);
      expect(result?.absent_days).toBe(2);
      expect(result?.present_days).toBe(3); // present + late
      expect(result?.incidents_on_absent_days).toBe(2);
      expect(result?.incidents_on_present_days).toBe(1);
    });
  });
});
