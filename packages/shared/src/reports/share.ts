import { z } from 'zod';

/**
 * Report share request schema. Drives the "Share report into inbox"
 * flow documented in reports-rebuild/PLAN.md §7.
 *
 * The recipient audience mirrors the existing inbox audience-picker
 * contract (individual user ids + role-group keys). The inbox layer
 * owns final validation of whether the sender is permitted to broadcast
 * to each role group under the tenant's messaging policy — this schema
 * only validates shape.
 */
export const reportShareFormatSchema = z.enum(['pdf', 'excel', 'word', 'all']);
export type ReportShareFormat = z.infer<typeof reportShareFormatSchema>;

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
