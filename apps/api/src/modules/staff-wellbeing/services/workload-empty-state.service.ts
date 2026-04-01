import type {
  AbsenceTrends,
  AggregateTimetableQuality,
  AggregateWorkloadSummary,
  CoverFairnessResult,
  PersonalTimetableQuality,
  PersonalWorkloadSummary,
  SubstitutionPressure,
} from './workload-compute.service';

export class WorkloadEmptyStateService {
  emptyPersonalSummary(): PersonalWorkloadSummary {
    return {
      teaching_periods_per_week: 0,
      cover_duties_this_term: 0,
      school_average_covers: 0,
      timetable_quality_score: 100,
      timetable_quality_label: 'Good',
      trend: null,
      status: 'normal',
    };
  }

  emptyTimetableQuality(): PersonalTimetableQuality {
    return {
      free_period_distribution: [],
      consecutive_periods: { max: 0, average: 0 },
      split_days_count: 0,
      room_changes: { average: 0, max: 0 },
      school_averages: {
        consecutive_max: 0,
        free_distribution_score: 0,
        split_days_pct: 0,
        room_changes_avg: 0,
      },
      composite_score: 100,
      composite_label: 'Good',
    };
  }

  emptyAggregateWorkload(): AggregateWorkloadSummary {
    return {
      average_teaching_periods: 0,
      range: { min: 0, max: 0, p25: 0, p50: 0, p75: 0 },
      over_allocated_periods_count: 0,
      average_cover_duties: 0,
      over_allocated_covers_count: 0,
      trend: null,
    };
  }

  emptyCoverFairness(): CoverFairnessResult {
    return {
      distribution: [],
      gini_coefficient: 0,
      range: { min: 0, max: 0, median: 0 },
      assessment: 'Well distributed',
    };
  }

  emptyAggregateTimetableQuality(): AggregateTimetableQuality {
    return {
      consecutive_periods: {
        mean: 0,
        median: 0,
        range: { min: 0, max: 0 },
      },
      free_period_clumping: {
        mean: 0,
        median: 0,
        range: { min: 0, max: 0 },
      },
      split_timetable_pct: 0,
      room_changes: {
        mean: 0,
        median: 0,
        range: { min: 0, max: 0 },
      },
      trend: null,
    };
  }

  emptyAbsenceTrends(): AbsenceTrends {
    return {
      monthly_rates: [],
      day_of_week_pattern: [],
      term_comparison: null,
      seasonal_pattern: null,
    };
  }

  emptySubstitutionPressure(): SubstitutionPressure {
    return {
      absence_rate: 0,
      cover_difficulty: 0,
      unfilled_rate: 0,
      composite_score: 0.3,
      trend: [],
      assessment: 'Low',
    };
  }
}
