import { z } from 'zod';

/**
 * Report share request + response schemas. Drives the "Share report into
 * inbox" flow documented in reports-rebuild/PLAN.md §7.
 *
 * The recipient audience mirrors the existing inbox audience-picker
 * contract (individual user ids + role-group keys). The inbox layer
 * owns final validation of whether the sender is permitted to broadcast
 * to each role group under the tenant's messaging policy — these schemas
 * only validate shape.
 */
export const reportShareFormatSchema = z.enum(['pdf', 'excel', 'word', 'all']);
export type ReportShareFormat = z.infer<typeof reportShareFormatSchema>;

/**
 * The artifact-level format for stored snapshots: 'all' fans out into
 * three concrete artifacts, but each on-disk file has exactly one
 * format. Used for the `artifacts[].format` keys on the snapshot view.
 */
export const reportShareArtifactFormatSchema = z.enum(['pdf', 'excel', 'word']);
export type ReportShareArtifactFormat = z.infer<typeof reportShareArtifactFormatSchema>;

export const reportShareAudienceSchema = z.object({
  user_ids: z.array(z.string().uuid()).default([]),
  role_keys: z.array(z.string().min(1)).default([]),
});
export type ReportShareAudience = z.infer<typeof reportShareAudienceSchema>;

export const createReportShareSchema = z
  .object({
    saved_report_id: z.string().uuid(),
    format: reportShareFormatSchema,
    audience: reportShareAudienceSchema,
    message_body: z.string().trim().max(4000).optional(),
  })
  .refine((v) => v.audience.user_ids.length + v.audience.role_keys.length > 0, {
    message: 'Audience must include at least one user or role group',
    path: ['audience'],
  });
export type CreateReportShareDto = z.infer<typeof createReportShareSchema>;

export const reportShareLogSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  saved_report_id: z.string().uuid(),
  shared_by: z.string().uuid(),
  shared_at: z.string().datetime(),
  format: reportShareFormatSchema,
  conversation_id: z.string().uuid().nullable(),
  recipients_json: reportShareAudienceSchema,
  message_body: z.string().nullable(),
});
export type ReportShareLogDto = z.infer<typeof reportShareLogSchema>;

/**
 * Result of `POST /v1/reports/builder/:id/share`.
 *
 * `share_id` is the `report_share_log.id` — the URL of the read-only
 * snapshot view (`/reports/shared/:share_id`) is built from this. The
 * snapshot view re-resolves signed URLs on every load (15-min TTL).
 */
export const shareReportResponseSchema = z.object({
  share_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  artifact_keys: z.record(reportShareArtifactFormatSchema, z.string()),
  recipients_count: z.number().int().nonnegative(),
});
export type ShareReportResponse = z.infer<typeof shareReportResponseSchema>;

/**
 * Snapshot view (`GET /v1/reports/shared/:share_id`). The frontend
 * re-fetches this each time it needs fresh signed URLs since they
 * expire 15 min after generation.
 */
export const sharedSnapshotArtifactSchema = z.object({
  format: reportShareArtifactFormatSchema,
  download_url: z.string().url(),
  filename: z.string(),
});
export type SharedSnapshotArtifact = z.infer<typeof sharedSnapshotArtifactSchema>;

export const sharedSnapshotViewSchema = z.object({
  share_id: z.string().uuid(),
  saved_report_id: z.string().uuid(),
  saved_report_name: z.string(),
  saved_report_description: z.string().nullable(),
  shared_by_name: z.string(),
  shared_at: z.string().datetime(),
  format: reportShareFormatSchema,
  filters_summary: z.string(),
  message_body: z.string().nullable(),
  artifacts: z.array(sharedSnapshotArtifactSchema),
  /** True iff the recipient may "Open in builder" — gated on
   * `reports.builder` permission AND the saved report being shared
   * (`is_shared = true`). */
  can_open_in_builder: z.boolean(),
});
export type SharedSnapshotView = z.infer<typeof sharedSnapshotViewSchema>;

/**
 * One row of `GET /v1/reports/builder/:id/shares` — share history for
 * the saved report's owner. Recipients only see their own inbox view.
 */
export const reportShareHistoryEntrySchema = z.object({
  id: z.string().uuid(),
  shared_at: z.string().datetime(),
  shared_by: z.string().uuid(),
  shared_by_name: z.string(),
  format: reportShareFormatSchema,
  recipients_count: z.number().int().nonnegative(),
  conversation_id: z.string().uuid().nullable(),
  message_body: z.string().nullable(),
});
export type ReportShareHistoryEntry = z.infer<typeof reportShareHistoryEntrySchema>;

export const reportShareHistoryResponseSchema = z.object({
  data: z.array(reportShareHistoryEntrySchema),
  meta: z.object({
    page: z.number().int().positive(),
    pageSize: z.number().int().positive(),
    total: z.number().int().nonnegative(),
  }),
});
export type ReportShareHistoryResponse = z.infer<typeof reportShareHistoryResponseSchema>;

/**
 * Error codes thrown by the report-sharing service. Stable strings —
 * the frontend keys i18n messages off them.
 */
export const REPORT_SHARE_ERROR_CODES = {
  /** Caller lacks `reports.share` permission. */
  SHARE_PERMISSION_DENIED: 'REPORT_SHARE_PERMISSION_DENIED',
  /** Caller is not the saved report's owner and the report is private. */
  SHARE_NOT_OWNER: 'REPORT_SHARE_NOT_OWNER',
  /** Saved report id does not exist in the tenant. */
  SAVED_REPORT_NOT_FOUND: 'SAVED_REPORT_NOT_FOUND',
  /** Resolved query exceeded the synchronous row cap; large-batch
   *  delivery is a deferred follow-up (impl 13 spec §8). */
  SHARE_TOO_LARGE: 'REPORT_SHARE_TOO_LARGE',
  /** `share_id` does not exist for this tenant. */
  SHARE_NOT_FOUND: 'REPORT_SHARE_NOT_FOUND',
  /** Caller is not a participant in the share's conversation. */
  SHARE_VIEW_FORBIDDEN: 'REPORT_SHARE_VIEW_FORBIDDEN',
} as const;
