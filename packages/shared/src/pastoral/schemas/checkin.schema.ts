import { z } from 'zod';

import { checkinFlagReasonSchema } from '../enums';

// ─── Submit Check-in ───────────────────────────────────────────────────────

export const submitCheckinSchema = z.object({
  mood_score: z.number().int().min(1).max(5),
  freeform_text: z.string().max(500).optional(),
});

export type SubmitCheckinDto = z.infer<typeof submitCheckinSchema>;

// ─── Check-in Status Response ─────────────────────────────────────────────

export const checkinStatusResponseSchema = z.object({
  enabled: z.boolean(),
  can_submit_today: z.boolean(),
  frequency: z.enum(['daily', 'weekly']),
  last_checkin_date: z.string().nullable(),
});

export type CheckinStatusResponse = z.infer<typeof checkinStatusResponseSchema>;

// ─── Student Check-in Response ────────────────────────────────────────────

export const checkinResponseSchema = z.object({
  id: z.string().uuid(),
  checkin_date: z.string(),
  mood_score: z.number().int().min(1).max(5),
  freeform_text: z.string().nullable(),
  was_flagged: z.boolean(),
});

export type CheckinResponse = z.infer<typeof checkinResponseSchema>;

// ─── Monitoring Check-in Response (admin) ─────────────────────────────────

export const monitoringCheckinResponseSchema = checkinResponseSchema.extend({
  flag_reason: checkinFlagReasonSchema.nullable(),
  auto_concern_id: z.string().uuid().nullable(),
  student_id: z.string().uuid(),
});

export type MonitoringCheckinResponse = z.infer<typeof monitoringCheckinResponseSchema>;

// ─── Filters (for monitoring owner view) ───────────────────────────────────

export const checkinFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  flagged: z.coerce.boolean().optional(),
  flag_reason: checkinFlagReasonSchema.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort: z.enum(['checkin_date', 'mood_score']).default('checkin_date'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CheckinFilters = z.infer<typeof checkinFiltersSchema>;

// ─── Aggregate Query ───────────────────────────────────────────────────────

export const checkinAggregateQuerySchema = z.object({
  year_group_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  group_by: z.enum(['day', 'week', 'month']).default('week'),
});

export type CheckinAggregateQuery = z.infer<typeof checkinAggregateQuerySchema>;

// ─── Analytics Query ──────────────────────────────────────────────────────

export const checkinAnalyticsQuerySchema = z.object({
  year_group_id: z.string().uuid().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  granularity: z.enum(['weekly', 'monthly']).default('weekly'),
});

export type CheckinAnalyticsQuery = z.infer<typeof checkinAnalyticsQuerySchema>;

// ─── Exam Comparison Query ────────────────────────────────────────────────

export const examComparisonQuerySchema = z.object({
  year_group_id: z.string().uuid().optional(),
  exam_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  exam_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type ExamComparisonQuery = z.infer<typeof examComparisonQuerySchema>;

// ─── Config Update ────────────────────────────────────────────────────────

export const checkinConfigUpdateSchema = z.object({
  enabled: z.boolean().optional(),
  frequency: z.enum(['daily', 'weekly']).optional(),
  monitoring_owner_user_ids: z.array(z.string().uuid()).optional(),
  monitoring_hours_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  monitoring_hours_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  monitoring_days: z.array(z.number().min(0).max(6)).optional(),
  flagged_keywords: z.array(z.string()).optional(),
  consecutive_low_threshold: z.number().int().min(2).max(10).optional(),
  min_cohort_for_aggregate: z.number().int().min(5).max(50).optional(),
  prerequisites_acknowledged: z.boolean().optional(),
});

export type CheckinConfigUpdateDto = z.infer<typeof checkinConfigUpdateSchema>;
