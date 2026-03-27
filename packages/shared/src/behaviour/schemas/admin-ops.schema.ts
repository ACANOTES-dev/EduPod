import { z } from 'zod';

// ─── Recompute Points ─────────────────────────────────────────────────────

export const recomputePointsSchema = z.object({
  scope: z.enum(['student', 'year_group', 'tenant']),
  student_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid().optional(),
});

export type RecomputePointsDto = z.infer<typeof recomputePointsSchema>;

// ─── Rebuild Awards ───────────────────────────────────────────────────────

export const rebuildAwardsSchema = z.object({
  scope: z.enum(['student', 'year_group', 'tenant']),
  student_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid().optional(),
});

export type RebuildAwardsDto = z.infer<typeof rebuildAwardsSchema>;

// ─── Backfill Tasks ───────────────────────────────────────────────────────

export const backfillTasksSchema = z.object({
  scope: z.enum(['tenant', 'entity_type']),
  entity_type: z.string().optional(),
});

export type BackfillTasksDto = z.infer<typeof backfillTasksSchema>;

// ─── Resend Notification ──────────────────────────────────────────────────

export const resendNotificationSchema = z.object({
  incident_id: z.string().uuid().optional(),
  sanction_id: z.string().uuid().optional(),
  parent_id: z.string().uuid(),
  channel: z.enum(['email', 'whatsapp', 'in_app']),
});

export type ResendNotificationDto = z.infer<typeof resendNotificationSchema>;

// ─── Scope Audit ──────────────────────────────────────────────────────────

export const scopeAuditQuerySchema = z.object({
  user_id: z.string().uuid(),
});

export type ScopeAuditQuery = z.infer<typeof scopeAuditQuerySchema>;

// ─── Reindex Search ───────────────────────────────────────────────────────

export const reindexSearchSchema = z.object({
  preview: z.coerce.boolean().optional().default(false),
});

// ─── Admin Job Status ─────────────────────────────────────────────────────

export interface AdminJobStatus {
  job_id: string;
  status: string;
  progress_percent: number;
  records_processed: number;
  records_failed: number;
  error_log: string[];
}

// ─── Preview Response ─────────────────────────────────────────────────────

export interface AdminPreviewResponse {
  affected_records: number;
  affected_students: number;
  sample_records: string[];
  estimated_duration: string;
  warnings: string[];
  reversible: boolean;
  rollback_method: string | null;
}

// ─── Health Response ──────────────────────────────────────────────────────

export interface AdminHealthResponse {
  queue_depths: Record<string, number>;
  dead_letter_depth: number;
  cache_hit_rate: number;
  view_freshness: { view_name: string; last_refreshed_at: string | null }[];
  scan_backlog: number;
  legal_holds_active: number;
}

// ─── Dead Letter Item ─────────────────────────────────────────────────────

export interface DeadLetterItem {
  queue: string;
  job_id: string;
  job_name: string;
  failed_at: string;
  failure_reason: string;
  retry_count: number;
}

// ─── Retention Preview ────────────────────────────────────────────────────

export interface RetentionPreviewResponse {
  to_archive: number;
  to_anonymise: number;
  held_by_legal_hold: number;
  sample_to_archive: string[];
  sample_to_anonymise: string[];
}
