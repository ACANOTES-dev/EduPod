import { WorkloadEmptyStateService } from './workload-empty-state.service';

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('WorkloadEmptyStateService', () => {
  let service: WorkloadEmptyStateService;

  beforeEach(() => {
    service = new WorkloadEmptyStateService();
  });

  // ─── emptyPersonalSummary ───────────────────────────────────────────────────

  describe('WorkloadEmptyStateService — emptyPersonalSummary', () => {
    it('should return zeroed personal summary with normal status', () => {
      const result = service.emptyPersonalSummary();

      expect(result).toEqual({
        teaching_periods_per_week: 0,
        cover_duties_this_term: 0,
        school_average_covers: 0,
        timetable_quality_score: 100,
        timetable_quality_label: 'Good',
        trend: null,
        status: 'normal',
      });
    });
  });

  // ─── emptyTimetableQuality ──────────────────────────────────────────────────

  describe('WorkloadEmptyStateService — emptyTimetableQuality', () => {
    it('should return perfect timetable quality with all zeroes', () => {
      const result = service.emptyTimetableQuality();

      expect(result.composite_score).toBe(100);
      expect(result.composite_label).toBe('Good');
      expect(result.free_period_distribution).toEqual([]);
      expect(result.consecutive_periods).toEqual({ max: 0, average: 0 });
      expect(result.split_days_count).toBe(0);
      expect(result.room_changes).toEqual({ average: 0, max: 0 });
      expect(result.school_averages).toEqual({
        consecutive_max: 0,
        free_distribution_score: 0,
        split_days_pct: 0,
        room_changes_avg: 0,
      });
    });
  });

  // ─── emptyAggregateWorkload ─────────────────────────────────────────────────

  describe('WorkloadEmptyStateService — emptyAggregateWorkload', () => {
    it('should return zeroed aggregate workload with null trend', () => {
      const result = service.emptyAggregateWorkload();

      expect(result.average_teaching_periods).toBe(0);
      expect(result.range).toEqual({ min: 0, max: 0, p25: 0, p50: 0, p75: 0 });
      expect(result.over_allocated_periods_count).toBe(0);
      expect(result.average_cover_duties).toBe(0);
      expect(result.over_allocated_covers_count).toBe(0);
      expect(result.trend).toBeNull();
    });
  });

  // ─── emptyCoverFairness ─────────────────────────────────────────────────────

  describe('WorkloadEmptyStateService — emptyCoverFairness', () => {
    it('should return zero Gini coefficient and well-distributed assessment', () => {
      const result = service.emptyCoverFairness();

      expect(result.distribution).toEqual([]);
      expect(result.gini_coefficient).toBe(0);
      expect(result.range).toEqual({ min: 0, max: 0, median: 0 });
      expect(result.assessment).toBe('Well distributed');
    });
  });

  // ─── emptyAggregateTimetableQuality ─────────────────────────────────────────

  describe('WorkloadEmptyStateService — emptyAggregateTimetableQuality', () => {
    it('should return zeroed aggregate timetable quality with null trend', () => {
      const result = service.emptyAggregateTimetableQuality();

      expect(result.consecutive_periods.mean).toBe(0);
      expect(result.consecutive_periods.median).toBe(0);
      expect(result.free_period_clumping.mean).toBe(0);
      expect(result.split_timetable_pct).toBe(0);
      expect(result.room_changes.mean).toBe(0);
      expect(result.trend).toBeNull();
    });
  });

  // ─── emptyAbsenceTrends ─────────────────────────────────────────────────────

  describe('WorkloadEmptyStateService — emptyAbsenceTrends', () => {
    it('should return empty arrays and null comparisons', () => {
      const result = service.emptyAbsenceTrends();

      expect(result.monthly_rates).toEqual([]);
      expect(result.day_of_week_pattern).toEqual([]);
      expect(result.term_comparison).toBeNull();
      expect(result.seasonal_pattern).toBeNull();
    });
  });

  // ─── emptySubstitutionPressure ──────────────────────────────────────────────

  describe('WorkloadEmptyStateService — emptySubstitutionPressure', () => {
    it('should return low baseline substitution pressure', () => {
      const result = service.emptySubstitutionPressure();

      expect(result.absence_rate).toBe(0);
      expect(result.cover_difficulty).toBe(0);
      expect(result.unfilled_rate).toBe(0);
      expect(result.composite_score).toBe(0.3);
      expect(result.trend).toEqual([]);
      expect(result.assessment).toBe('Low');
    });
  });
});
