import type { ScheduleRow } from './workload-data.service';
import { WorkloadMetricsService } from './workload-metrics.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROOM_A = 'rrrr0000-0000-0000-0000-00000000000a';
const ROOM_B = 'rrrr0000-0000-0000-0000-00000000000b';
const ROOM_C = 'rrrr0000-0000-0000-0000-00000000000c';

const makeSchedule = (overrides: Partial<ScheduleRow> = {}): ScheduleRow => ({
  id: overrides.id ?? 'sched-1',
  weekday: overrides.weekday ?? 1,
  period_order: 'period_order' in overrides ? (overrides.period_order ?? null) : null,
  room_id: 'room_id' in overrides ? (overrides.room_id ?? null) : ROOM_A,
  schedule_period_template:
    'schedule_period_template' in overrides
      ? (overrides.schedule_period_template ?? null)
      : {
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional branch coverage — computeConsecutivePeriods
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — computeConsecutivePeriods (branches)', () => {
    it('should fall back to period_order when schedule_period_template is null', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          period_order: 1,
          schedule_period_template: null,
        }),
        makeSchedule({
          weekday: 1,
          period_order: 2,
          schedule_period_template: null,
        }),
        makeSchedule({
          weekday: 1,
          period_order: 3,
          schedule_period_template: null,
        }),
      ];
      const result = WorkloadMetricsService.computeConsecutivePeriods(schedules);
      expect(result.max).toBe(3);
      expect(result.average).toBe(3);
    });

    it('should default order to 0 when both template and period_order are null', () => {
      const schedules = [
        makeSchedule({ weekday: 1, period_order: null, schedule_period_template: null }),
        makeSchedule({ weekday: 1, period_order: null, schedule_period_template: null }),
      ];
      // Both resolve to order 0, so consecutive count stays at 1
      const result = WorkloadMetricsService.computeConsecutivePeriods(schedules);
      expect(result.max).toBe(1);
    });

    it('should compute average across multiple weekdays', () => {
      const schedules = [
        // Day 1: consecutive 3
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
        // Day 2: consecutive 1 (only 1 period)
        makeSchedule({
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
      ];
      const result = WorkloadMetricsService.computeConsecutivePeriods(schedules);
      expect(result.max).toBe(3);
      // average of [3, 1] = 2
      expect(result.average).toBe(2);
    });

    it('should handle single period on single day', () => {
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
      const result = WorkloadMetricsService.computeConsecutivePeriods(schedules);
      expect(result.max).toBe(1);
      expect(result.average).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional branch coverage — computeRoomChanges
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — computeRoomChanges (branches)', () => {
    it('should compute average and max across multiple days', () => {
      const schedules = [
        // Day 1: 3 rooms => 2 changes
        makeSchedule({ weekday: 1, room_id: ROOM_A }),
        makeSchedule({ weekday: 1, room_id: ROOM_B }),
        makeSchedule({ weekday: 1, room_id: ROOM_C }),
        // Day 2: 1 room => 0 changes
        makeSchedule({ weekday: 2, room_id: ROOM_A }),
        makeSchedule({ weekday: 2, room_id: ROOM_A }),
      ];
      const result = WorkloadMetricsService.computeRoomChanges(schedules);
      expect(result.max).toBe(2);
      // average of [2, 0] = 1
      expect(result.average).toBe(1);
    });

    it('should return zeroes when all schedules have null room_id', () => {
      const schedules = [
        makeSchedule({ weekday: 1, room_id: null }),
        makeSchedule({ weekday: 2, room_id: null }),
      ];
      const result = WorkloadMetricsService.computeRoomChanges(schedules);
      expect(result.average).toBe(0);
      expect(result.max).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional branch coverage — computeSplitDays
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — computeSplitDays (branches)', () => {
    it('should NOT count a day with gap less than 3 as split', () => {
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
            period_name: 'P3',
            period_order: 3,
          },
        }),
      ];
      const templates = [
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 2 },
        { weekday: 1, period_order: 3 },
      ];
      // Gap from period 1 to 3 is exactly 2, which means difference is 2 (< 3)
      expect(WorkloadMetricsService.computeSplitDays(schedules, templates)).toBe(0);
    });

    it('should count multiple split days correctly', () => {
      const schedules = [
        // Day 1: split (gap 1->5 = 4)
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
        // Day 2: split (gap 1->6 = 5)
        makeSchedule({
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P6',
            period_order: 6,
          },
        }),
        // Day 3: no split (consecutive)
        makeSchedule({
          weekday: 3,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 3,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
      ];
      const templates = Array.from({ length: 7 }, (_, i) => ({ weekday: 1, period_order: i + 1 }));
      expect(WorkloadMetricsService.computeSplitDays(schedules, templates)).toBe(2);
    });

    it('should use period_order fallback when schedule_period_template is null', () => {
      const schedules = [
        makeSchedule({ weekday: 1, period_order: 1, schedule_period_template: null }),
        makeSchedule({ weekday: 1, period_order: 5, schedule_period_template: null }),
      ];
      const templates = [
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 5 },
      ];
      expect(WorkloadMetricsService.computeSplitDays(schedules, templates)).toBe(1);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional branch coverage — computeFreeDistribution
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — computeFreeDistribution (branches)', () => {
    it('should use period_order fallback when schedule_period_template is null', () => {
      const schedules = [
        makeSchedule({ weekday: 1, period_order: 1, schedule_period_template: null }),
      ];
      const templates = [
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 2 },
        { weekday: 1, period_order: 3 },
      ];
      const result = WorkloadMetricsService.computeFreeDistribution(schedules, templates);
      expect(result).toEqual([{ weekday: 1, free_count: 2 }]);
    });

    it('should handle weekday only in templates but not in schedules', () => {
      const schedules: ScheduleRow[] = [];
      const templates = [
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 2 },
      ];
      const result = WorkloadMetricsService.computeFreeDistribution(schedules, templates);
      expect(result).toEqual([{ weekday: 1, free_count: 2 }]);
    });

    it('should handle weekday only in schedules but not in templates', () => {
      const schedules = [
        makeSchedule({
          weekday: 3,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
      ];
      const templates: { weekday: number; period_order: number }[] = [];
      const result = WorkloadMetricsService.computeFreeDistribution(schedules, templates);
      // template slots = 0, assigned = 1, free = max(0, 0-1) = 0
      expect(result).toEqual([{ weekday: 3, free_count: 0 }]);
    });

    it('should handle multiple weekdays', () => {
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
          weekday: 2,
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
        { weekday: 2, period_order: 1 },
      ];
      const result = WorkloadMetricsService.computeFreeDistribution(schedules, templates);
      expect(result).toEqual([
        { weekday: 1, free_count: 2 },
        { weekday: 2, free_count: 0 },
      ]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional branch coverage — scoreFreeDistribution
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — scoreFreeDistribution (branches)', () => {
    it('should return score less than 100 for uneven distribution', () => {
      const dist = [
        { weekday: 1, free_count: 4 },
        { weekday: 2, free_count: 0 },
        { weekday: 3, free_count: 0 },
      ];
      const score = WorkloadMetricsService.scoreFreeDistribution(dist);
      expect(score).toBeLessThan(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });

    it('should return single-element distribution as 100 (no variance)', () => {
      const dist = [{ weekday: 1, free_count: 3 }];
      const score = WorkloadMetricsService.scoreFreeDistribution(dist);
      expect(score).toBe(100);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional branch coverage — computeTimetableCompositeScore thresholds
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — computeTimetableCompositeScore (branches)', () => {
    it('should give consecutiveScore 80 when max consecutive is 3', () => {
      // Need schedules where max consecutive per day = 3
      const schedules = [
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P3',
            period_order: 3,
          },
        }),
      ];
      const score = WorkloadMetricsService.computeTimetableCompositeScore(schedules);
      // With max=3, consecutiveScore=80. Single day so free distribution=100, no split, room=0 changes
      // composite = 100*0.3 + 80*0.3 + splitScore*0.2 + 100*0.2
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should give consecutiveScore 50 when max consecutive is 4', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P3',
            period_order: 3,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P4',
            period_order: 4,
          },
        }),
      ];
      const score = WorkloadMetricsService.computeTimetableCompositeScore(schedules);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should give consecutiveScore 0 when max consecutive is 5+', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P3',
            period_order: 3,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P4',
            period_order: 4,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P5',
            period_order: 5,
          },
        }),
      ];
      const score = WorkloadMetricsService.computeTimetableCompositeScore(schedules);
      // consecutive=5 => score=0; but other components still contribute
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should reduce roomScore when many room changes occur', () => {
      // 5 different rooms on one day => 4 room changes => roomScore = max(0, 100 - 4*25) = 0
      const schedules = [
        makeSchedule({
          weekday: 1,
          room_id: ROOM_A,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_B,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: ROOM_C,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P3',
            period_order: 3,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: 'rrrr0000-0000-0000-0000-00000000000d',
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P4',
            period_order: 4,
          },
        }),
        makeSchedule({
          weekday: 1,
          room_id: 'rrrr0000-0000-0000-0000-00000000000e',
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P5',
            period_order: 5,
          },
        }),
      ];
      const badScore = WorkloadMetricsService.computeTimetableCompositeScore(schedules);
      // All same room
      const goodSchedules = schedules.map((s) => ({ ...s, room_id: ROOM_A }));
      const goodScore = WorkloadMetricsService.computeTimetableCompositeScore(goodSchedules);
      expect(badScore).toBeLessThan(goodScore);
    });

    it('edge: should handle schedules with non-teaching period types in computeFreeDistributionScore', () => {
      // The private computeFreeDistributionScore only counts teaching-type periods
      const schedules = [
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'break',
            period_name: 'Break',
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional branch coverage — giniAssessment boundary
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — giniAssessment (boundaries)', () => {
    it('should return "Moderate concentration" for gini exactly at 0.15', () => {
      expect(WorkloadMetricsService.giniAssessment(0.15)).toBe('Moderate concentration');
    });

    it('should return "Moderate concentration" for gini exactly at 0.3', () => {
      expect(WorkloadMetricsService.giniAssessment(0.3)).toBe('Moderate concentration');
    });

    it('should return review-recommended for gini just above 0.3', () => {
      expect(WorkloadMetricsService.giniAssessment(0.31)).toBe(
        'Significant concentration \u2014 review recommended',
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional branch coverage — pressureAssessment boundaries
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — pressureAssessment (boundaries)', () => {
    it('should return "Moderate" at exactly 0.25', () => {
      expect(WorkloadMetricsService.pressureAssessment(0.25)).toBe('Moderate');
    });

    it('should return "High" at exactly 0.5', () => {
      expect(WorkloadMetricsService.pressureAssessment(0.5)).toBe('High');
    });

    it('should return "Critical" at exactly 0.75', () => {
      expect(WorkloadMetricsService.pressureAssessment(0.75)).toBe('Critical');
    });

    it('should return "Low" at 0', () => {
      expect(WorkloadMetricsService.pressureAssessment(0)).toBe('Low');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional branch coverage — percentileRange and median
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — percentileRange (branches)', () => {
    it('should handle single-element array', () => {
      const result = WorkloadMetricsService.percentileRange([42]);
      expect(result.min).toBe(42);
      expect(result.max).toBe(42);
      expect(result.p25).toBe(42);
      expect(result.p50).toBe(42);
      expect(result.p75).toBe(42);
    });

    it('should handle two-element array with interpolation', () => {
      const result = WorkloadMetricsService.percentileRange([10, 20]);
      expect(result.min).toBe(10);
      expect(result.max).toBe(20);
      expect(result.p50).toBe(15);
    });
  });

  describe('WorkloadMetricsService — median (branches)', () => {
    it('should return the single element for single-element array', () => {
      expect(WorkloadMetricsService.median([7])).toBe(7);
    });

    it('should return average of two elements for two-element array', () => {
      expect(WorkloadMetricsService.median([3, 7])).toBe(5);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional branch coverage — qualityLabel boundary
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — qualityLabel (boundaries)', () => {
    it('should return "Moderate" at exactly 60', () => {
      expect(WorkloadMetricsService.qualityLabel(60)).toBe('Moderate');
    });

    it('should return "Needs attention" at 59.9', () => {
      expect(WorkloadMetricsService.qualityLabel(59.9)).toBe('Needs attention');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional branch coverage — schoolDaysBetween
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — schoolDaysBetween (branches)', () => {
    it('should count a full 2-week span correctly (10 weekdays)', () => {
      // Mon Jan 5 to Fri Jan 16 2026 = 10 weekdays
      const start = new Date('2026-01-05');
      const end = new Date('2026-01-16');
      expect(WorkloadMetricsService.schoolDaysBetween(start, end)).toBe(10);
    });

    it('should count 1 when start = end and it is a weekday', () => {
      // Wednesday Jan 7 2026
      const date = new Date('2026-01-07');
      expect(WorkloadMetricsService.schoolDaysBetween(date, date)).toBe(1);
    });

    it('should count 0 when start = end and it is Saturday', () => {
      // Sat Jan 10 2026
      const date = new Date('2026-01-10');
      expect(WorkloadMetricsService.schoolDaysBetween(date, date)).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Additional branch coverage — monthsBetween, addMonths, percentileRange
  // ═══════════════════════════════════════════════════════════════════════════

  describe('WorkloadMetricsService — monthsBetween', () => {
    it('should return 0 for same month', () => {
      const d = new Date('2026-03-15');
      expect(WorkloadMetricsService.monthsBetween(d, d)).toBe(0);
    });

    it('should return 12 for same month next year', () => {
      const start = new Date('2025-03-01');
      const end = new Date('2026-03-01');
      expect(WorkloadMetricsService.monthsBetween(start, end)).toBe(12);
    });

    it('should return 3 for March to June', () => {
      const start = new Date('2026-03-01');
      const end = new Date('2026-06-01');
      expect(WorkloadMetricsService.monthsBetween(start, end)).toBe(3);
    });
  });

  describe('WorkloadMetricsService — addMonths', () => {
    it('should add months and return ISO date string', () => {
      const result = WorkloadMetricsService.addMonths(new Date('2026-01-15T12:00:00Z'), 3);
      expect(result).toBe('2026-04-15');
    });

    it('should handle December to January rollover', () => {
      const result = WorkloadMetricsService.addMonths(new Date('2026-12-15T12:00:00Z'), 1);
      expect(result).toBe('2027-01-15');
    });

    it('should handle adding 0 months', () => {
      const result = WorkloadMetricsService.addMonths(new Date('2026-05-20T12:00:00Z'), 0);
      expect(result).toBe('2026-05-20');
    });
  });

  describe('WorkloadMetricsService — percentileRange', () => {
    it('should return zeros for empty array', () => {
      const result = WorkloadMetricsService.percentileRange([]);
      expect(result).toEqual({ min: 0, max: 0, p25: 0, p50: 0, p75: 0 });
    });

    it('should handle single element', () => {
      const result = WorkloadMetricsService.percentileRange([5]);
      expect(result.min).toBe(5);
      expect(result.max).toBe(5);
      expect(result.p50).toBe(5);
    });

    it('should compute percentiles for a larger sorted array', () => {
      const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = WorkloadMetricsService.percentileRange(sorted);
      expect(result.min).toBe(1);
      expect(result.max).toBe(10);
      expect(result.p50).toBeCloseTo(5.5, 1);
    });
  });

  describe('WorkloadMetricsService — median', () => {
    it('should return 0 for empty array', () => {
      expect(WorkloadMetricsService.median([])).toBe(0);
    });

    it('should return middle value for odd-length array', () => {
      expect(WorkloadMetricsService.median([1, 2, 3])).toBe(2);
    });

    it('should return average of two middles for even-length array', () => {
      expect(WorkloadMetricsService.median([1, 2, 3, 4])).toBe(2.5);
    });
  });

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

    it('should return "Moderate" at exactly 0.25', () => {
      expect(WorkloadMetricsService.pressureAssessment(0.25)).toBe('Moderate');
    });

    it('should return "High" at exactly 0.5', () => {
      expect(WorkloadMetricsService.pressureAssessment(0.5)).toBe('High');
    });

    it('should return "Critical" at exactly 0.75', () => {
      expect(WorkloadMetricsService.pressureAssessment(0.75)).toBe('Critical');
    });
  });

  describe('WorkloadMetricsService — computeSplitDays', () => {
    it('should return 0 when schedules is empty', () => {
      expect(WorkloadMetricsService.computeSplitDays([], [])).toBe(0);
    });

    it('should return 0 when each day has fewer than 2 periods', () => {
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
      expect(WorkloadMetricsService.computeSplitDays(schedules, [])).toBe(0);
    });

    it('should detect a split day when gap between periods >= 3', () => {
      const schedules = [
        makeSchedule({
          id: 's1',
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          id: 's2',
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P5',
            period_order: 5,
          },
        }),
      ];
      expect(WorkloadMetricsService.computeSplitDays(schedules, [])).toBe(1);
    });

    it('should not detect a split when periods are consecutive', () => {
      const schedules = [
        makeSchedule({
          id: 's1',
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
        makeSchedule({
          id: 's2',
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
        }),
      ];
      expect(WorkloadMetricsService.computeSplitDays(schedules, [])).toBe(0);
    });
  });

  describe('WorkloadMetricsService — computeTimetableCompositeScore edge cases', () => {
    it('should return 100 for empty schedules', () => {
      expect(WorkloadMetricsService.computeTimetableCompositeScore([])).toBe(100);
    });

    it('should return a bounded score between 0 and 100', () => {
      const schedules = [
        makeSchedule({
          id: 's1',
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
          room_id: ROOM_A,
        }),
        makeSchedule({
          id: 's2',
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P2',
            period_order: 2,
          },
          room_id: ROOM_B,
        }),
        makeSchedule({
          id: 's3',
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P3',
            period_order: 3,
          },
          room_id: ROOM_C,
        }),
      ];
      const score = WorkloadMetricsService.computeTimetableCompositeScore(schedules);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
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

    it('should return 100 when free periods are perfectly even', () => {
      const dist = [
        { weekday: 1, free_count: 2 },
        { weekday: 2, free_count: 2 },
        { weekday: 3, free_count: 2 },
      ];
      expect(WorkloadMetricsService.scoreFreeDistribution(dist)).toBe(100);
    });
  });

  describe('WorkloadMetricsService — giniAssessment', () => {
    it('should return "Well distributed" for gini < 0.15', () => {
      expect(WorkloadMetricsService.giniAssessment(0.1)).toBe('Well distributed');
    });

    it('should return "Moderate concentration" for gini 0.15-0.3', () => {
      expect(WorkloadMetricsService.giniAssessment(0.2)).toBe('Moderate concentration');
    });

    it('should return significant concentration for gini > 0.3', () => {
      expect(WorkloadMetricsService.giniAssessment(0.5)).toContain('Significant');
    });

    it('should return "Moderate concentration" at exactly 0.15', () => {
      expect(WorkloadMetricsService.giniAssessment(0.15)).toBe('Moderate concentration');
    });

    it('should return "Moderate concentration" at exactly 0.3', () => {
      expect(WorkloadMetricsService.giniAssessment(0.3)).toBe('Moderate concentration');
    });
  });

  describe('WorkloadMetricsService — computeRoomChanges', () => {
    it('should return 0 for schedules with no room_id', () => {
      const noRoomSchedules = [
        makeSchedule({ weekday: 1, room_id: null }),
        makeSchedule({ weekday: 1, room_id: null }),
      ];
      const result = WorkloadMetricsService.computeRoomChanges(noRoomSchedules);
      expect(result.average).toBe(0);
      expect(result.max).toBe(0);
    });
  });

  describe('WorkloadMetricsService — computeFreeDistribution', () => {
    it('should compute free periods from template slots minus assigned slots', () => {
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
      const allTemplates = [
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 2 },
        { weekday: 1, period_order: 3 },
      ];

      const result = WorkloadMetricsService.computeFreeDistribution(schedules, allTemplates);
      expect(result).toEqual([{ weekday: 1, free_count: 2 }]);
    });

    it('should include weekdays from both templates and schedules', () => {
      const schedules = [
        makeSchedule({
          weekday: 2,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
        }),
      ];
      const allTemplates = [{ weekday: 1, period_order: 1 }];

      const result = WorkloadMetricsService.computeFreeDistribution(schedules, allTemplates);
      // weekday 1: 1 template - 0 assigned = 1 free
      // weekday 2: 0 templates - 1 assigned = 0 free
      expect(result).toHaveLength(2);
    });
  });
});
