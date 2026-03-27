import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../prisma/prisma.service';

import { CheckinAnalyticsService } from './checkin-analytics.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const TENANT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const YEAR_GROUP_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// Generate stable student IDs for cohort testing
const makeStudentId = (n: number): string =>
  `${String(n).padStart(8, '0')}-0000-0000-0000-000000000000`;

// ─── RLS Mock ───────────────────────────────────────────────────────────────

const mockRlsTx = {
  studentCheckin: {
    findMany: jest.fn(),
    groupBy: jest.fn(),
    count: jest.fn(),
  },
};

jest.mock('../../../common/middleware/rls.middleware', () => ({
  createRlsClient: jest.fn().mockReturnValue({
    $transaction: jest
      .fn()
      .mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(mockRlsTx),
      ),
  }),
}));

// ─── Helpers ────────────────────────────────────────────────────────────────

const makeTenantSettingsRecord = (
  minCohort: number = 10,
) => ({
  id: 'settings-1',
  tenant_id: TENANT_ID,
  settings: {
    pastoral: {
      checkins: {
        min_cohort_for_aggregate: minCohort,
      },
    },
  },
  created_at: new Date(),
  updated_at: new Date(),
});

/**
 * Generate an array of mock check-in records for testing aggregation.
 */
const makeCheckins = (
  count: number,
  dateStr: string,
  moodBase: number = 3,
  uniqueStudents: number = count,
): Array<{ checkin_date: Date; mood_score: number; student_id: string }> => {
  const results: Array<{ checkin_date: Date; mood_score: number; student_id: string }> = [];
  for (let i = 0; i < count; i++) {
    results.push({
      checkin_date: new Date(dateStr),
      mood_score: Math.min(5, moodBase + (i % 3)), // vary scores slightly
      student_id: makeStudentId(i % uniqueStudents),
    });
  }
  return results;
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe('CheckinAnalyticsService', () => {
  let service: CheckinAnalyticsService;
  let mockPrisma: {
    tenantSetting: { findUnique: jest.Mock };
  };

  beforeEach(async () => {
    mockPrisma = {
      tenantSetting: {
        findUnique: jest.fn().mockResolvedValue(makeTenantSettingsRecord(10)),
      },
    };

    // Reset all RLS tx mocks
    for (const model of Object.values(mockRlsTx)) {
      for (const fn of Object.values(model)) {
        (fn as jest.Mock).mockReset();
      }
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckinAnalyticsService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CheckinAnalyticsService>(CheckinAnalyticsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── Year Group Mood Trends ─────────────────────────────────────────────

  describe('getYearGroupMoodTrends', () => {
    it('returns correct averages for sufficient cohort', async () => {
      // 12 unique students on 2026-03-23 (Monday, ISO week 13)
      const checkins = makeCheckins(12, '2026-03-23', 3, 12);
      mockRlsTx.studentCheckin.findMany.mockResolvedValue(checkins);

      const result = await service.getYearGroupMoodTrends(
        TENANT_ID,
        YEAR_GROUP_ID,
        { from: '2026-03-20', to: '2026-03-27' },
        'weekly',
      );

      expect(result.length).toBeGreaterThanOrEqual(1);
      const point = result[0]!;
      expect(point.period).toBeDefined();
      expect(point.average_mood).toBeGreaterThanOrEqual(1);
      expect(point.average_mood).toBeLessThanOrEqual(5);
      expect(point.response_count).toBe(12);
    });

    it('min cohort: 5 students (< default 10) returns empty', async () => {
      // Only 5 unique students — below min_cohort_for_aggregate (10)
      const checkins = makeCheckins(5, '2026-03-23', 3, 5);
      mockRlsTx.studentCheckin.findMany.mockResolvedValue(checkins);

      const result = await service.getYearGroupMoodTrends(
        TENANT_ID,
        YEAR_GROUP_ID,
        { from: '2026-03-20', to: '2026-03-27' },
        'weekly',
      );

      // Should be empty because 5 < 10 (min cohort)
      expect(result).toEqual([]);
    });

    it('min cohort: 10 students returns data', async () => {
      const checkins = makeCheckins(10, '2026-03-23', 3, 10);
      mockRlsTx.studentCheckin.findMany.mockResolvedValue(checkins);

      const result = await service.getYearGroupMoodTrends(
        TENANT_ID,
        YEAR_GROUP_ID,
        { from: '2026-03-20', to: '2026-03-27' },
        'weekly',
      );

      expect(result.length).toBe(1);
      expect(result[0]!.response_count).toBe(10);
    });

    it('monthly granularity groups by month', async () => {
      const marchCheckins = makeCheckins(12, '2026-03-15', 3, 12);
      const aprilCheckins = makeCheckins(12, '2026-04-10', 4, 12);
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([
        ...marchCheckins,
        ...aprilCheckins,
      ]);

      const result = await service.getYearGroupMoodTrends(
        TENANT_ID,
        YEAR_GROUP_ID,
        { from: '2026-03-01', to: '2026-04-30' },
        'monthly',
      );

      expect(result.length).toBe(2);
      expect(result[0]!.period).toBe('2026-03');
      expect(result[1]!.period).toBe('2026-04');
    });
  });

  // ─── School-Wide Mood Trends ────────────────────────────────────────────

  describe('getSchoolMoodTrends', () => {
    it('returns data for sufficient cohort', async () => {
      const checkins = makeCheckins(15, '2026-03-23', 3, 15);
      mockRlsTx.studentCheckin.findMany.mockResolvedValue(checkins);

      const result = await service.getSchoolMoodTrends(
        TENANT_ID,
        { from: '2026-03-20', to: '2026-03-27' },
        'weekly',
      );

      expect(result.length).toBe(1);
      expect(result[0]!.response_count).toBe(15);
    });
  });

  // ─── Day-of-Week Patterns ──────────────────────────────────────────────

  describe('getDayOfWeekPatterns', () => {
    it('returns correct entries per day', async () => {
      // Generate check-ins on Monday (2026-03-23) and Tuesday (2026-03-24)
      const mondayCheckins = makeCheckins(12, '2026-03-23', 3, 12);
      const tuesdayCheckins = makeCheckins(12, '2026-03-24', 4, 12);
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([
        ...mondayCheckins,
        ...tuesdayCheckins,
      ]);

      const result = await service.getDayOfWeekPatterns(
        TENANT_ID,
        YEAR_GROUP_ID,
        { from: '2026-03-20', to: '2026-03-27' },
      );

      expect(result.length).toBe(2);
      // Results should be sorted by day
      const days = result.map((r) => r.day);
      for (let i = 1; i < days.length; i++) {
        expect(days[i]!).toBeGreaterThanOrEqual(days[i - 1]!);
      }
    });

    it('excludes days with insufficient cohort', async () => {
      // Monday: 12 students (sufficient), Tuesday: 3 students (insufficient)
      const mondayCheckins = makeCheckins(12, '2026-03-23', 3, 12);
      const tuesdayCheckins = makeCheckins(3, '2026-03-24', 4, 3);
      mockRlsTx.studentCheckin.findMany.mockResolvedValue([
        ...mondayCheckins,
        ...tuesdayCheckins,
      ]);

      const result = await service.getDayOfWeekPatterns(
        TENANT_ID,
        null,
        { from: '2026-03-20', to: '2026-03-27' },
      );

      // Only Monday should appear
      expect(result.length).toBe(1);
    });
  });

  // ─── Exam Period Comparison ────────────────────────────────────────────

  describe('getExamPeriodComparison', () => {
    it('calculates correct before/during/after periods', async () => {
      // Exam: Mar 16-20 (5 days)
      // Before: Mar 11-15 (same duration preceding)
      // After: Mar 21-25 (same duration following)
      const beforeCheckins = makeCheckins(12, '2026-03-12', 3, 12);
      const duringCheckins = makeCheckins(12, '2026-03-18', 2, 12);
      const afterCheckins = makeCheckins(12, '2026-03-22', 4, 12);

      // The service does 3 findMany calls within a single transaction
      mockRlsTx.studentCheckin.findMany
        .mockResolvedValueOnce(beforeCheckins)  // before
        .mockResolvedValueOnce(duringCheckins)  // during
        .mockResolvedValueOnce(afterCheckins);  // after

      const result = await service.getExamPeriodComparison(
        TENANT_ID,
        YEAR_GROUP_ID,
        { start: '2026-03-16', end: '2026-03-20' },
      );

      expect(result).not.toBeNull();
      expect(result!.before_period.response_count).toBe(12);
      expect(result!.during_period.response_count).toBe(12);
      expect(result!.after_period.response_count).toBe(12);
      // During exam should have lower average
      expect(result!.during_period.average_mood).toBeLessThan(
        result!.after_period.average_mood,
      );
    });

    it('returns null if any sub-period has insufficient cohort', async () => {
      const sufficientCheckins = makeCheckins(12, '2026-03-12', 3, 12);
      const insufficientCheckins = makeCheckins(3, '2026-03-18', 2, 3);

      mockRlsTx.studentCheckin.findMany
        .mockResolvedValueOnce(sufficientCheckins) // before
        .mockResolvedValueOnce(insufficientCheckins) // during — too few
        .mockResolvedValueOnce(sufficientCheckins); // after

      const result = await service.getExamPeriodComparison(
        TENANT_ID,
        null,
        { start: '2026-03-16', end: '2026-03-20' },
      );

      expect(result).toBeNull();
    });
  });

  // ─── Privacy: No Student IDs ──────────────────────────────────────────

  describe('privacy', () => {
    it('no student IDs in mood trend responses', async () => {
      const checkins = makeCheckins(15, '2026-03-23', 3, 15);
      mockRlsTx.studentCheckin.findMany.mockResolvedValue(checkins);

      const result = await service.getYearGroupMoodTrends(
        TENANT_ID,
        YEAR_GROUP_ID,
        { from: '2026-03-20', to: '2026-03-27' },
        'weekly',
      );

      // Verify no student_id or student_name fields in response
      for (const point of result) {
        const keys = Object.keys(point);
        expect(keys).not.toContain('student_id');
        expect(keys).not.toContain('student_name');
        expect(keys).toEqual(['period', 'average_mood', 'response_count']);
      }
    });

    it('no student IDs in day-of-week responses', async () => {
      const checkins = makeCheckins(12, '2026-03-23', 3, 12);
      mockRlsTx.studentCheckin.findMany.mockResolvedValue(checkins);

      const result = await service.getDayOfWeekPatterns(
        TENANT_ID,
        null,
        { from: '2026-03-20', to: '2026-03-27' },
      );

      for (const point of result) {
        const keys = Object.keys(point);
        expect(keys).not.toContain('student_id');
        expect(keys).not.toContain('student_name');
        expect(keys).toEqual(['day', 'average_mood', 'response_count']);
      }
    });

    it('no student IDs in exam comparison responses', async () => {
      const checkins = makeCheckins(12, '2026-03-12', 3, 12);
      mockRlsTx.studentCheckin.findMany
        .mockResolvedValueOnce(checkins)
        .mockResolvedValueOnce(checkins)
        .mockResolvedValueOnce(checkins);

      const result = await service.getExamPeriodComparison(
        TENANT_ID,
        null,
        { start: '2026-03-16', end: '2026-03-20' },
      );

      expect(result).not.toBeNull();
      // Verify structure has only aggregated fields
      const topKeys = Object.keys(result!);
      expect(topKeys).toEqual(['before_period', 'during_period', 'after_period']);

      for (const period of [result!.before_period, result!.during_period, result!.after_period]) {
        const keys = Object.keys(period);
        expect(keys).not.toContain('student_id');
        expect(keys).not.toContain('student_name');
        expect(keys).toEqual(['average_mood', 'response_count']);
      }
    });
  });
});
