import { z } from 'zod';

// ---------------------------------------------------------------------------
// Query schemas (controller input validation)
// ---------------------------------------------------------------------------

export const coverHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type CoverHistoryQueryDto = z.infer<typeof coverHistoryQuerySchema>;

// ---------------------------------------------------------------------------
// Response schemas
// ---------------------------------------------------------------------------

// Personal Workload Summary
export const personalWorkloadSummarySchema = z.object({
  teaching_periods_per_week: z.number(),
  cover_duties_this_term: z.number().int(),
  school_average_covers: z.number(),
  timetable_quality_score: z.number().min(0).max(100),
  timetable_quality_label: z.enum(['Good', 'Moderate', 'Needs attention']),
  trend: z.object({
    previous_term_periods: z.number().nullable(),
    previous_term_covers: z.number().int().nullable(),
  }).nullable(),
  status: z.enum(['normal', 'elevated', 'high']),
});
export type PersonalWorkloadSummary = z.infer<typeof personalWorkloadSummarySchema>;

// Cover History Item
export const coverHistoryItemSchema = z.object({
  date: z.string(), // ISO date
  period: z.string(),
  subject: z.string().nullable(),
  original_teacher: z.literal('Colleague'),
});
export type CoverHistoryItem = z.infer<typeof coverHistoryItemSchema>;

// Personal Timetable Quality
export const personalTimetableQualitySchema = z.object({
  free_period_distribution: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    free_count: z.number().int(),
  })),
  consecutive_periods: z.object({
    max: z.number().int(),
    average: z.number(),
  }),
  split_days_count: z.number().int(),
  room_changes: z.object({
    average: z.number(),
    max: z.number().int(),
  }),
  school_averages: z.object({
    consecutive_max: z.number(),
    free_distribution_score: z.number(),
    split_days_pct: z.number(),
    room_changes_avg: z.number(),
  }),
  composite_score: z.number().min(0).max(100),
  composite_label: z.enum(['Good', 'Moderate', 'Needs attention']),
});
export type PersonalTimetableQuality = z.infer<typeof personalTimetableQualitySchema>;

// Aggregate Workload Summary
export const aggregateWorkloadSummarySchema = z.object({
  average_teaching_periods: z.number(),
  range: z.object({
    min: z.number(),
    max: z.number(),
    p25: z.number(),
    p50: z.number(),
    p75: z.number(),
  }),
  over_allocated_periods_count: z.number().int(),
  average_cover_duties: z.number(),
  over_allocated_covers_count: z.number().int(),
  trend: z.object({
    previous_average_periods: z.number().nullable(),
    previous_average_covers: z.number().nullable(),
  }).nullable(),
});
export type AggregateWorkloadSummary = z.infer<typeof aggregateWorkloadSummarySchema>;

// Cover Fairness
export const coverFairnessResultSchema = z.object({
  distribution: z.array(z.object({
    cover_count: z.number().int(),
    staff_count: z.number().int(),
  })),
  gini_coefficient: z.number().min(0).max(1),
  range: z.object({
    min: z.number().int(),
    max: z.number().int(),
    median: z.number(),
  }),
  assessment: z.enum([
    'Well distributed',
    'Moderate concentration',
    'Significant concentration — review recommended',
  ]),
});
export type CoverFairnessResult = z.infer<typeof coverFairnessResultSchema>;

// Aggregate Timetable Quality
export const aggregateTimetableQualitySchema = z.object({
  consecutive_periods: z.object({
    mean: z.number(),
    median: z.number(),
    range: z.object({ min: z.number(), max: z.number() }),
  }),
  free_period_clumping: z.object({
    mean: z.number(),
    median: z.number(),
    range: z.object({ min: z.number(), max: z.number() }),
  }),
  split_timetable_pct: z.number(),
  room_changes: z.object({
    mean: z.number(),
    median: z.number(),
    range: z.object({ min: z.number(), max: z.number() }),
  }),
  trend: z.object({
    previous_consecutive_mean: z.number().nullable(),
    previous_split_pct: z.number().nullable(),
    previous_room_changes_mean: z.number().nullable(),
  }).nullable(),
});
export type AggregateTimetableQuality = z.infer<typeof aggregateTimetableQualitySchema>;

// Absence Trends
export const absenceTrendsSchema = z.object({
  monthly_rates: z.array(z.object({
    month: z.string(), // YYYY-MM
    rate: z.number(),
  })),
  day_of_week_pattern: z.array(z.object({
    weekday: z.number().int().min(0).max(6),
    rate: z.number(),
  })),
  term_comparison: z.object({
    current: z.number(),
    previous: z.number().nullable(),
  }).nullable(),
  seasonal_pattern: z.array(z.object({
    month: z.number().int().min(1).max(12),
    average_rate: z.number(),
  })).nullable(),
});
export type AbsenceTrends = z.infer<typeof absenceTrendsSchema>;

// Substitution Pressure
export const substitutionPressureSchema = z.object({
  absence_rate: z.number(),
  cover_difficulty: z.number(),
  unfilled_rate: z.number(),
  composite_score: z.number(),
  trend: z.array(z.object({
    month: z.string(),
    score: z.number(),
  })),
  assessment: z.enum(['Low', 'Moderate', 'High', 'Critical']),
});
export type SubstitutionPressure = z.infer<typeof substitutionPressureSchema>;

// Correlation
export const correlationAccumulatingSchema = z.object({
  status: z.literal('accumulating'),
  dataPoints: z.number().int(),
  requiredDataPoints: z.literal(12),
  projectedAvailableDate: z.string(),
  message: z.string(),
});

export const correlationAvailableSchema = z.object({
  status: z.literal('available'),
  dataPoints: z.number().int(),
  series: z.array(z.object({
    month: z.string(),
    coverPressure: z.number(),
    absenceRate: z.number(),
  })),
  trendDescription: z.string(),
  disclaimer: z.string(),
});

export const correlationResultSchema = z.discriminatedUnion('status', [
  correlationAccumulatingSchema,
  correlationAvailableSchema,
]);
export type CorrelationResult = z.infer<typeof correlationResultSchema>;

// Board Report (termly summary)
export const boardReportSummarySchema = z.object({
  workload_distribution: z.object({
    average_periods: z.number(),
    range: z.object({ min: z.number(), max: z.number() }),
    over_allocated_count: z.number().int(),
  }),
  cover_fairness: z.object({
    gini_coefficient: z.number(),
    distribution_shape: z.string(),
    assessment: z.string(),
  }),
  timetable_quality: z.object({
    average_score: z.number(),
    label: z.enum(['Good', 'Moderate', 'Needs attention']),
  }),
  substitution_pressure: z.object({
    composite_score: z.number(),
    assessment: z.string(),
    trend_direction: z.enum(['improving', 'stable', 'worsening']).nullable(),
  }),
  absence_pattern: z.object({
    current_term_rate: z.number(),
    previous_term_rate: z.number().nullable(),
    highest_day: z.string().nullable(),
  }),
  correlation_insight: z.object({
    status: z.enum(['accumulating', 'available']),
    summary: z.string(),
  }).nullable(),
  generated_at: z.string().datetime(),
  term_name: z.string(),
  academic_year_name: z.string(),
});
export type BoardReportSummary = z.infer<typeof boardReportSummarySchema>;
