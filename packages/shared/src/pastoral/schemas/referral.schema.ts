import { z } from 'zod';

import { referralRecommendationStatusSchema, referralStatusSchema, referralTypeSchema } from '../enums';

// ─── Create ────────────────────────────────────────────────────────────────

export const createReferralSchema = z.object({
  student_id: z.string().uuid(),
  case_id: z.string().uuid().optional(),
  referral_type: referralTypeSchema,
  referral_body_name: z.string().max(255).optional(),
  pre_populated_data: z.record(z.string(), z.unknown()).optional(),
  manual_additions: z.record(z.string(), z.unknown()).optional(),
});

export type CreateReferralDto = z.infer<typeof createReferralSchema>;

// ─── Update ────────────────────────────────────────────────────────────────

export const updateReferralSchema = z.object({
  referral_body_name: z.string().max(255).optional(),
  status: referralStatusSchema.optional(),
  external_reference: z.string().max(100).optional(),
  report_summary: z.string().optional(),
  pre_populated_data: z.record(z.string(), z.unknown()).optional(),
  manual_additions: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateReferralDto = z.infer<typeof updateReferralSchema>;

// ─── Submit ────────────────────────────────────────────────────────────────

export const submitReferralSchema = z.object({
  referral_id: z.string().uuid(),
});

export type SubmitReferralDto = z.infer<typeof submitReferralSchema>;

// ─── Record Report Received ────────────────────────────────────────────────

export const recordReportReceivedSchema = z.object({
  report_summary: z.string().min(1),
});

export type RecordReportReceivedDto = z.infer<typeof recordReportReceivedSchema>;

// ─── Add Recommendation ────────────────────────────────────────────────────

export const createRecommendationSchema = z.object({
  referral_id: z.string().uuid(),
  recommendation: z.string().min(1),
  assigned_to_user_id: z.string().uuid().optional(),
  review_date: z.string().optional(),
});

export type CreateRecommendationDto = z.infer<typeof createRecommendationSchema>;

// ─── Update Recommendation ─────────────────────────────────────────────────

export const updateRecommendationSchema = z.object({
  status: referralRecommendationStatusSchema.optional(),
  status_note: z.string().optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  review_date: z.string().nullable().optional(),
});

export type UpdateRecommendationDto = z.infer<typeof updateRecommendationSchema>;

// ─── Filters ───────────────────────────────────────────────────────────────

export const referralFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  referral_type: referralTypeSchema.optional(),
  status: referralStatusSchema.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort: z.enum(['created_at', 'submitted_at', 'status']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ReferralFilters = z.infer<typeof referralFiltersSchema>;
