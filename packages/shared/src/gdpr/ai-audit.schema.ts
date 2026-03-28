import { z } from 'zod';

// ─── AI Audit Log ────────────────────────────────────────────────────────────

export const createAiLogSchema = z.object({
  ai_service: z.string().max(50),
  subject_type: z.string().max(20).nullable().optional(),
  subject_id: z.string().uuid().nullable().optional(),
  model_used: z.string().max(100),
  prompt_hash: z.string().max(128),
  prompt_summary: z.string(),
  response_summary: z.string(),
  input_data_categories: z.array(z.string()),
  tokenised: z.boolean(),
  token_usage_log_id: z.string().uuid().nullable().optional(),
  confidence_score: z.number().min(0).max(1).nullable().optional(),
  processing_time_ms: z.number().int().min(0),
});
export type CreateAiLogDto = z.infer<typeof createAiLogSchema>;

export const aiDecisionSchema = z.object({
  output_used: z.boolean(),
  rejected_reason: z.string().nullable().optional(),
});
export type AiDecisionDto = z.infer<typeof aiDecisionSchema>;

export const aiAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type AiAuditQueryDto = z.infer<typeof aiAuditQuerySchema>;

export const aiAuditStatsQuerySchema = z.object({
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});
export type AiAuditStatsQueryDto = z.infer<typeof aiAuditStatsQuerySchema>;

export const aiProcessingLogSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  ai_service: z.string(),
  subject_type: z.string().nullable(),
  subject_id: z.string().uuid().nullable(),
  model_used: z.string().nullable(),
  prompt_hash: z.string().nullable(),
  prompt_summary: z.string().nullable(),
  response_summary: z.string().nullable(),
  input_data_categories: z.array(z.string()),
  tokenised: z.boolean(),
  token_usage_log_id: z.string().uuid().nullable(),
  output_used: z.boolean().nullable(),
  accepted_by_user_id: z.string().uuid().nullable(),
  accepted_at: z.string().datetime().nullable(),
  rejected_reason: z.string().nullable(),
  confidence_score: z.number().nullable(),
  processing_time_ms: z.number().int().nullable(),
  created_at: z.string().datetime(),
});
export type AiProcessingLog = z.infer<typeof aiProcessingLogSchema>;

export const aiUsageStatsSchema = z.object({
  totalLogs: z.number().int(),
  byService: z.record(z.string(), z.number().int()),
  acceptanceRate: z.number().nullable(),
  avgProcessingTimeMs: z.number().nullable(),
  tokenisationRate: z.number(),
});
export type AiUsageStats = z.infer<typeof aiUsageStatsSchema>;
