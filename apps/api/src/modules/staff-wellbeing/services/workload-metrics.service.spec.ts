import type { ScheduleRow } from './workload-data.service';
import { WorkloadMetricsService } from './workload-metrics.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROOM_A = 'rrrr0000-0000-0000-0000-00000000000a';
const ROOM_B = 'rrrr0000-0000-0000-0000-00000000000b';
const ROOM_C = 'rrrr0000-0000-0000-0000-00000000000c';

const makeSchedule = (overrides: Partial<ScheduleRow> = {}): ScheduleRow => ({
  id: overrides.id ?? 'sched-1',
  weekday: overrides.weekday ?? 1,
  period_order: overrides.period_order ?? null,
  room_id: overrides.room_id ?? ROOM_A,
  schedule_period_template: overrides.schedule_period_template ?? {
    schedule_period_type: 'teaching',
    period_name: 'Period 1',
    period_order: 1,
  },
  class_entity: overrides.class_entity ?? { name: 'Maths 8A' },
});

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WorkloadMetricsService', () => {
  afterEach(() => jest.clearAllMocks());

  // ═══════════════════════════════════════════════════════════════════════════
  // Gini coefficient
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — computeGiniCoefficient', () => {
    it('should return 0 for an empty array', () => {
      expect(WorkloadMetricsService.computeGiniCoefficient([])).toBe(0);
    });

    it('should return 0 when all values are zero', () => {
      expect(WorkloadMetricsService.computeGiniCoefficient([0, 0, 0])).toBe(0);
    });

    it('should return 0 for perfectly equal distribution', () => {
      expect(WorkloadMetricsService.computeGiniCoefficient([5, 5, 5, 5])).toBe(0);
    });

    it('should return a value between 0 and 1 for unequal distribution', () => {
      const gini = WorkloadMetricsService.computeGiniCoefficient([1, 2, 3, 10]);
      expect(gini).toBeGreaterThan(0);
      expect(gini).toBeLessThan(1);
    });

    it('should return higher Gini for more concentrated distributions', () => {
      const equal = WorkloadMetricsService.computeGiniCoefficient([5, 5, 5, 5]);
      const unequal = WorkloadMetricsService.computeGiniCoefficient([0, 0, 0, 20]);
      expect(unequal).toBeGreaterThan(equal);
    });
  });

  describe('WorkloadMetricsService — giniAssessment', () => {
    it('should return "Well distributed" for gini < 0.15', () => {
      expect(WorkloadMetricsService.giniAssessment(0.1)).toBe('Well distributed');
    });

    it('should return "Moderate concentration" for gini between 0.15 and 0.3', () => {
      expect(WorkloadMetricsService.giniAssessment(0.2)).toBe('Moderate concentration');
    });

    it('should return review-recommended for gini > 0.3', () => {
      expect(WorkloadMetricsService.giniAssessment(0.5)).toBe(
        'Significant concentration \u2014 review recommended',
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Timetable quality
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — computeTimetableCompositeScore', () => {
    it('should return 100 for empty schedules', () => {
      expect(WorkloadMetricsService.computeTimetableCompositeScore([])).toBe(100);
    });

    it('should return a score between 0 and 100 for valid schedules', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
          room_id: ROOM_B,
        }),
        makeSchedule({
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
      ];
      const score = WorkloadMetricsService.computeTimetableCompositeScore(schedules);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('WorkloadMetricsService — qualityLabel', () => {
    it('should return "Good" for score >= 80', () => {
      expect(WorkloadMetricsService.qualityLabel(80)).toBe('Good');
      expect(WorkloadMetricsService.qualityLabel(100)).toBe('Good');
    });

    it('should return "Moderate" for score 60-79', () => {
      expect(WorkloadMetricsService.qualityLabel(60)).toBe('Moderate');
      expect(WorkloadMetricsService.qualityLabel(79)).toBe('Moderate');
    });

    it('should return "Needs attention" for score < 60', () => {
      expect(WorkloadMetricsService.qualityLabel(59)).toBe('Needs attention');
      expect(WorkloadMetricsService.qualityLabel(0)).toBe('Needs attention');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Consecutive periods
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — computeConsecutivePeriods', () => {
    it('should return { max: 0, average: 0 } for empty schedules', () => {
      expect(WorkloadMetricsService.computeConsecutivePeriods([])).toEqual({
        max: 0,
        average: 0,
      });
    });

    it('should detect consecutive periods on a single day', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P3',
            period_order: 3,
          },
        }),
      ];
      const result = WorkloadMetricsService.computeConsecutivePeriods(schedules);
      expect(result.max).toBe(3);
    });

    it('should handle non-consecutive periods', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P4',
            period_order: 4,
          },
        }),
      ];
      const result = WorkloadMetricsService.computeConsecutivePeriods(schedules);
      expect(result.max).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Room changes
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — computeRoomChanges', () => {
    it('should return { average: 0, max: 0 } for empty schedules', () => {
      expect(WorkloadMetricsService.computeRoomChanges([])).toEqual({ average: 0, max: 0 });
    });

    it('should return 0 changes when all periods are in the same room', () => {
      const schedules = [
        makeSchedule({ weekday: 1, room_id: ROOM_A }),
        makeSchedule({ weekday: 1, room_id: ROOM_A }),
      ];
      expect(WorkloadMetricsService.computeRoomChanges(schedules)).toEqual({ average: 0, max: 0 });
    });

    it('should count room changes per day as distinct rooms minus 1', () => {
      const schedules = [
        makeSchedule({ weekday: 1, room_id: ROOM_A }),
        makeSchedule({ weekday: 1, room_id: ROOM_B }),
        makeSchedule({ weekday: 1, room_id: ROOM_C }),
      ];
      const result = WorkloadMetricsService.computeRoomChanges(schedules);
      expect(result.max).toBe(2); // 3 distinct rooms - 1
    });

    it('should skip schedules without room_id', () => {
      const schedules = [
        makeSchedule({ weekday: 1, room_id: null }),
        makeSchedule({ weekday: 1, room_id: ROOM_A }),
      ];
      const result = WorkloadMetricsService.computeRoomChanges(schedules);
      expect(result.max).toBe(0); // only 1 room counted
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Split days
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — computeSplitDays', () => {
    it('should return 0 for empty schedules', () => {
      expect(WorkloadMetricsService.computeSplitDays([], [])).toBe(0);
    });

    it('should detect a split day when there is a 2+ free period gap', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P5',
            period_order: 5,
          },
        }),
      ];
      const templates = [
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 2 },
        { weekday: 1, period_order: 3 },
        { weekday: 1, period_order: 4 },
        { weekday: 1, period_order: 5 },
      ];
      // Gap from period 1 to period 5 is 4, well above 3 threshold
      expect(WorkloadMetricsService.computeSplitDays(schedules, templates)).toBe(1);
    });

    it('should not count a day with only 1 period as split', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
      ];
      const templates = [{ weekday: 1, period_order: 1 }];
      expect(WorkloadMetricsService.computeSplitDays(schedules, templates)).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Free distribution
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — computeFreeDistribution', () => {
    it('should compute free count as template slots minus assigned slots per day', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
      ];
      const templates = [
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 2 },
        { weekday: 1, period_order: 3 },
      ];
      const result = WorkloadMetricsService.computeFreeDistribution(schedules, templates);
      expect(result).toEqual([{ weekday: 1, free_count: 2 }]);
    });

    it('should return empty array when there are no schedules and no templates', () => {
      expect(WorkloadMetricsService.computeFreeDistribution([], [])).toEqual([]);
    });
  });

  describe('WorkloadMetricsService — scoreFreeDistribution', () => {
    it('should return 100 for empty distribution', () => {
      expect(WorkloadMetricsService.scoreFreeDistribution([])).toBe(100);
    });

    it('should return 50 when all days have 0 free periods', () => {
      const dist = [
        { weekday: 1, free_count: 0 },
        { weekday: 2, free_count: 0 },
      ];
      expect(WorkloadMetricsService.scoreFreeDistribution(dist)).toBe(50);
    });

    it('should return 100 for perfectly even distribution', () => {
      const dist = [
        { weekday: 1, free_count: 2 },
        { weekday: 2, free_count: 2 },
        { weekday: 3, free_count: 2 },
      ];
      expect(WorkloadMetricsService.scoreFreeDistribution(dist)).toBe(100);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Substitution pressure
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — pressureAssessment', () => {
    it('should return "Low" for score < 0.25', () => {
      expect(WorkloadMetricsService.pressureAssessment(0.1)).toBe('Low');
    });

    it('should return "Moderate" for score 0.25-0.49', () => {
      expect(WorkloadMetricsService.pressureAssessment(0.3)).toBe('Moderate');
    });

    it('should return "High" for score 0.5-0.74', () => {
      expect(WorkloadMetricsService.pressureAssessment(0.6)).toBe('High');
    });

    it('should return "Critical" for score >= 0.75', () => {
      expect(WorkloadMetricsService.pressureAssessment(0.8)).toBe('Critical');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Statistical utilities
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — mean', () => {
    it('should return 0 for empty array', () => {
      expect(WorkloadMetricsService.mean([])).toBe(0);
    });

    it('should compute correct mean', () => {
      expect(WorkloadMetricsService.mean([2, 4, 6])).toBe(4);
    });
  });

  describe('WorkloadMetricsService — median', () => {
    it('should return 0 for empty array', () => {
      expect(WorkloadMetricsService.median([])).toBe(0);
    });

    it('should return middle value for odd-length sorted array', () => {
      expect(WorkloadMetricsService.median([1, 3, 5])).toBe(3);
    });

    it('should return average of two middle values for even-length sorted array', () => {
      expect(WorkloadMetricsService.median([1, 3, 5, 7])).toBe(4);
    });
  });

  describe('WorkloadMetricsService — percentileRange', () => {
    it('should return all zeroes for empty array', () => {
      expect(WorkloadMetricsService.percentileRange([])).toEqual({
        min: 0,
        max: 0,
        p25: 0,
        p50: 0,
        p75: 0,
      });
    });

    it('should compute percentiles for a sorted array', () => {
      const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = WorkloadMetricsService.percentileRange(sorted);
      expect(result.min).toBe(1);
      expect(result.max).toBe(10);
      expect(result.p50).toBeCloseTo(5.5, 1);
    });
  });

  describe('WorkloadMetricsService — schoolDaysBetween', () => {
    it('should count only weekdays between two dates', () => {
      // Mon Jan 5 to Fri Jan 9 2026 = 5 weekdays
      const start = new Date('2026-01-05');
      const end = new Date('2026-01-09');
      expect(WorkloadMetricsService.schoolDaysBetween(start, end)).toBe(5);
    });

    it('should return 0 when start is after end', () => {
      const start = new Date('2026-01-10');
      const end = new Date('2026-01-05');
      expect(WorkloadMetricsService.schoolDaysBetween(start, end)).toBe(0);
    });

    it('should exclude Saturday and Sunday', () => {
      // Sat Jan 10 to Sun Jan 11 2026
      const start = new Date('2026-01-10');
      const end = new Date('2026-01-11');
      expect(WorkloadMetricsService.schoolDaysBetween(start, end)).toBe(0);
    });
  });

  describe('WorkloadMetricsService — monthsBetween', () => {
    it('should return the number of full months between two dates', () => {
      expect(
        WorkloadMetricsService.monthsBetween(new Date('2025-09-01'), new Date('2026-03-01')),
      ).toBe(6);
    });

    it('should return 0 for the same month', () => {
      expect(
        WorkloadMetricsService.monthsBetween(new Date('2026-01-01'), new Date('2026-01-31')),
      ).toBe(0);
    });
  });

  describe('WorkloadMetricsService — addMonths', () => {
    it('should add months and return ISO date string', () => {
      // addMonths uses toISOString() which converts to UTC
      const base = new Date('2026-01-15T12:00:00Z');
      const result = WorkloadMetricsService.addMonths(base, 3);
      expect(result).toBe('2026-04-15');
    });

    it('should handle year overflow', () => {
      const base = new Date('2025-11-01T12:00:00Z');
      const result = WorkloadMetricsService.addMonths(base, 3);
      expect(result).toBe('2026-02-01');
    });
  });

  describe('WorkloadMetricsService — round2', () => {
    it('should round to 2 decimal places', () => {
      expect(WorkloadMetricsService.round2(3.456)).toBe(3.46);
      expect(WorkloadMetricsService.round2(3.454)).toBe(3.45);
      expect(WorkloadMetricsService.round2(7)).toBe(7);
    });
  });
});
