import { z } from 'zod';

import { checkinFlagReasonSchema } from '../enums';

// ─── Submit Check-in ───────────────────────────────────────────────────────

export const submitCheckinSchema = z.object({
  mood_score: z.number().int().min(1).max(5),
  freeform_text: z.string().optional(),
});

export type SubmitCheckinDto = z.infer<typeof submitCheckinSchema>;

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
