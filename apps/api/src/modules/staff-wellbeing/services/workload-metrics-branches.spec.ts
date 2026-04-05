import type { ScheduleRow } from './workload-data.service';
import { WorkloadMetricsService } from './workload-metrics.service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const ROOM_A = 'rrrr0000-0000-0000-0000-00000000000a';
const ROOM_B = 'rrrr0000-0000-0000-0000-00000000000b';

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

describe('WorkloadMetricsService — branches', () => {
  afterEach(() => jest.clearAllMocks());

  // ─── Gini coefficient edge cases ───────────────────────────────────────
  describe('WorkloadMetricsService — computeGiniCoefficient — boundary', () => {
    it('should return 0 for single element array', () => {
      expect(WorkloadMetricsService.computeGiniCoefficient([10])).toBe(0);
    });

    it('should handle large unequal distribution', () => {
      const gini = WorkloadMetricsService.computeGiniCoefficient([0, 0, 0, 0, 100]);
      expect(gini).toBeGreaterThan(0.5);
    });
  });

  // ─── giniAssessment — boundary at 0.15 and 0.3 ─────────────────────────
  describe('WorkloadMetricsService — giniAssessment — exact boundaries', () => {
    it('should return "Well distributed" at gini = 0', () => {
      expect(WorkloadMetricsService.giniAssessment(0)).toBe('Well distributed');
    });

    it('should return "Moderate concentration" at gini = 0.15', () => {
      expect(WorkloadMetricsService.giniAssessment(0.15)).toBe('Moderate concentration');
    });

    it('should return "Moderate concentration" at gini = 0.3', () => {
      expect(WorkloadMetricsService.giniAssessment(0.3)).toBe('Moderate concentration');
    });

    it('should return review-recommended at gini = 0.31', () => {
      expect(WorkloadMetricsService.giniAssessment(0.31)).toBe(
        'Significant concentration \u2014 review recommended',
      );
    });
  });

  // ─── Timetable composite — various consecutive period counts ────────────
  describe('WorkloadMetricsService — computeTimetableCompositeScore — consecutive branches', () => {
    it('should score higher for 2 consecutive than 5 consecutive', () => {
      const twoConsec = [
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
      ];
      const fiveConsec = [
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
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P4',
            period_order: 4,
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

      const scoreLow = WorkloadMetricsService.computeTimetableCompositeScore(twoConsec);
      const scoreHigh = WorkloadMetricsService.computeTimetableCompositeScore(fiveConsec);
      expect(scoreLow).toBeGreaterThan(scoreHigh);
    });

    it('should handle exactly 3 consecutive periods (80 score branch)', () => {
      const threeConsec = [
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
      const score = WorkloadMetricsService.computeTimetableCompositeScore(threeConsec);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('should handle exactly 4 consecutive periods (50 score branch)', () => {
      const fourConsec = [
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
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P4',
            period_order: 4,
          },
        }),
      ];
      const score = WorkloadMetricsService.computeTimetableCompositeScore(fourConsec);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  // ─── qualityLabel boundaries ────────────────────────────────────────────
  describe('WorkloadMetricsService — qualityLabel — exact boundaries', () => {
    it('should return "Moderate" at exactly 60', () => {
      expect(WorkloadMetricsService.qualityLabel(60)).toBe('Moderate');
    });

    it('should return "Good" at exactly 80', () => {
      expect(WorkloadMetricsService.qualityLabel(80)).toBe('Good');
    });

    it('should return "Needs attention" at exactly 59.99', () => {
      expect(WorkloadMetricsService.qualityLabel(59.99)).toBe('Needs attention');
    });
  });

  // ─── computeFreeDistribution — assigned days not in templates ───────────
  describe('WorkloadMetricsService — computeFreeDistribution — edge cases', () => {
    it('should handle schedules on days not in templates', () => {
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
      const templates = [{ weekday: 1, period_order: 1 }];
      const result = WorkloadMetricsService.computeFreeDistribution(schedules, templates);
      // weekday 1: 1 template - 0 assigned = 1 free
      // weekday 3: 0 template - 1 assigned = 0 free (max(0, -1) = 0)
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ weekday: 1, free_count: 1 }),
          expect.objectContaining({ weekday: 3, free_count: 0 }),
        ]),
      );
    });

    it('should handle schedule_period_template null (fall back to period_order)', () => {
      const schedules = [
        makeSchedule({ weekday: 1, schedule_period_template: null, period_order: 2 }),
      ];
      const templates = [
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 2 },
        { weekday: 1, period_order: 3 },
      ];
      const result = WorkloadMetricsService.computeFreeDistribution(schedules, templates);
      expect(result[0]!.free_count).toBe(2);
    });
  });

  // ─── scoreFreeDistribution — uneven distribution ────────────────────────
  describe('WorkloadMetricsService — scoreFreeDistribution — uneven', () => {
    it('should return a score less than 100 for uneven distribution', () => {
      const dist = [
        { weekday: 1, free_count: 1 },
        { weekday: 2, free_count: 5 },
        { weekday: 3, free_count: 1 },
      ];
      const score = WorkloadMetricsService.scoreFreeDistribution(dist);
      expect(score).toBeLessThan(100);
    });
  });

  // ─── computeConsecutivePeriods — null template fallback ─────────────────
  describe('WorkloadMetricsService — computeConsecutivePeriods — fallback', () => {
    it('should fall back to period_order when schedule_period_template is null', () => {
      const schedules = [
        makeSchedule({ weekday: 1, schedule_period_template: null, period_order: 1 }),
        makeSchedule({ weekday: 1, schedule_period_template: null, period_order: 2 }),
      ];
      const result = WorkloadMetricsService.computeConsecutivePeriods(schedules);
      expect(result.max).toBe(2);
    });

    it('should handle single period per day', () => {
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
    });

    it('should handle multiple days with different consecutive runs', () => {
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
            period_name: 'P3',
            period_order: 3,
          },
        }),
      ];
      const result = WorkloadMetricsService.computeConsecutivePeriods(schedules);
      expect(result.max).toBe(2); // day 1 has 2 consecutive
      expect(result.average).toBeCloseTo(1.5, 1);
    });
  });

  // ─── computeSplitDays — edge cases ──────────────────────────────────────
  describe('WorkloadMetricsService — computeSplitDays — edge cases', () => {
    it('should not count adjacent periods as split', () => {
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
      ];
      const templates = [
        { weekday: 1, period_order: 1 },
        { weekday: 1, period_order: 2 },
      ];
      expect(WorkloadMetricsService.computeSplitDays(schedules, templates)).toBe(0);
    });

    it('should handle null schedule_period_template in split computation', () => {
      const schedules = [
        makeSchedule({ weekday: 1, schedule_period_template: null, period_order: 1 }),
        makeSchedule({ weekday: 1, schedule_period_template: null, period_order: 5 }),
      ];
      expect(WorkloadMetricsService.computeSplitDays(schedules, [])).toBe(1);
    });
  });

  // ─── computeRoomChanges — multiple days ─────────────────────────────────
  describe('WorkloadMetricsService — computeRoomChanges — multiple days', () => {
    it('should average across days', () => {
      const schedules = [
        makeSchedule({ weekday: 1, room_id: ROOM_A }),
        makeSchedule({ weekday: 1, room_id: ROOM_B }),
        makeSchedule({ weekday: 2, room_id: ROOM_A }),
      ];
      const result = WorkloadMetricsService.computeRoomChanges(schedules);
      expect(result.max).toBe(1); // day 1 has 2 rooms - 1
      expect(result.average).toBe(0.5); // (1 + 0) / 2
    });
  });

  // ─── pressureAssessment — exact boundaries ──────────────────────────────
  describe('WorkloadMetricsService — pressureAssessment — boundaries', () => {
    it('should return "Low" at 0', () => {
      expect(WorkloadMetricsService.pressureAssessment(0)).toBe('Low');
    });

    it('should return "Moderate" at 0.25', () => {
      expect(WorkloadMetricsService.pressureAssessment(0.25)).toBe('Moderate');
    });

    it('should return "High" at 0.5', () => {
      expect(WorkloadMetricsService.pressureAssessment(0.5)).toBe('High');
    });

    it('should return "Critical" at 0.75', () => {
      expect(WorkloadMetricsService.pressureAssessment(0.75)).toBe('Critical');
    });

    it('should return "Critical" at 1.0', () => {
      expect(WorkloadMetricsService.pressureAssessment(1.0)).toBe('Critical');
    });
  });

  // ─── Statistical utilities — more edge cases ───────────────────────────
  describe('WorkloadMetricsService — median edge cases', () => {
    it('should handle single element', () => {
      expect(WorkloadMetricsService.median([42])).toBe(42);
    });

    it('should handle two elements', () => {
      expect(WorkloadMetricsService.median([1, 3])).toBe(2);
    });
  });

  describe('WorkloadMetricsService — percentileRange edge cases', () => {
    it('should handle single element array', () => {
      const result = WorkloadMetricsService.percentileRange([5]);
      expect(result.min).toBe(5);
      expect(result.max).toBe(5);
      expect(result.p25).toBe(5);
      expect(result.p50).toBe(5);
      expect(result.p75).toBe(5);
    });

    it('should handle two element array', () => {
      const result = WorkloadMetricsService.percentileRange([2, 8]);
      expect(result.min).toBe(2);
      expect(result.max).toBe(8);
      expect(result.p50).toBe(5);
    });
  });

  describe('WorkloadMetricsService — round2', () => {
    it('should round to 2 decimal places', () => {
      expect(WorkloadMetricsService.round2(3.456)).toBe(3.46);
      expect(WorkloadMetricsService.round2(3.454)).toBe(3.45);
      expect(WorkloadMetricsService.round2(0)).toBe(0);
    });
  });

  describe('WorkloadMetricsService — schoolDaysBetween — single day', () => {
    it('should return 1 for a single weekday', () => {
      const mon = new Date('2026-01-05'); // Monday
      expect(WorkloadMetricsService.schoolDaysBetween(mon, mon)).toBe(1);
    });

    it('should return 0 for a single Saturday', () => {
      const sat = new Date('2026-01-10'); // Saturday
      expect(WorkloadMetricsService.schoolDaysBetween(sat, sat)).toBe(0);
    });

    it('should count full week as 5', () => {
      const start = new Date('2026-01-05'); // Mon
      const end = new Date('2026-01-11'); // Sun
      expect(WorkloadMetricsService.schoolDaysBetween(start, end)).toBe(5);
    });
  });

  describe('WorkloadMetricsService — monthsBetween', () => {
    it('should return 0 for same month', () => {
      expect(
        WorkloadMetricsService.monthsBetween(new Date('2026-03-01'), new Date('2026-03-31')),
      ).toBe(0);
    });

    it('should return negative for reversed dates', () => {
      expect(
        WorkloadMetricsService.monthsBetween(new Date('2026-06-01'), new Date('2026-03-01')),
      ).toBe(-3);
    });
  });

  describe('WorkloadMetricsService — addMonths', () => {
    it('should add months and return ISO date string', () => {
      const result = WorkloadMetricsService.addMonths(new Date('2026-01-15T12:00:00Z'), 3);
      expect(result).toBe('2026-04-15');
    });

    it('should handle year rollover', () => {
      const result = WorkloadMetricsService.addMonths(new Date('2026-11-15T12:00:00Z'), 3);
      expect(result).toBe('2027-02-15');
    });

    it('should handle zero months', () => {
      const result = WorkloadMetricsService.addMonths(new Date('2026-06-01T12:00:00Z'), 0);
      expect(result).toBe('2026-06-01');
    });
  });

  // ─── computeTimetableCompositeScore — single day single teaching period ─
  describe('WorkloadMetricsService — computeTimetableCompositeScore — single period', () => {
    it('should return a valid bounded score for a single teaching period', () => {
      const schedules = [
        makeSchedule({
          weekday: 1,
          schedule_period_template: {
            schedule_period_type: 'teaching',
            period_name: 'P1',
            period_order: 1,
          },
          room_id: ROOM_A,
        }),
      ];
      const score = WorkloadMetricsService.computeTimetableCompositeScore(schedules);
      // Score is bounded 0-100
      expect(typeof score).toBe('number');
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  // ─── computeTimetableCompositeScore — with room changes ─────────────────
  describe('WorkloadMetricsService — computeTimetableCompositeScore — room change impact', () => {
    it('should compute valid score with room changes', () => {
      const manyRooms = [
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
      ];
      const score = WorkloadMetricsService.computeTimetableCompositeScore(manyRooms);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });
});
