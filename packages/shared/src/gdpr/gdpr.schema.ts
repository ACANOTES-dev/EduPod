import { z } from 'zod';

// ─── Export Policy ────────────────────────────────────────────────────────
export const gdprExportPolicySchema = z.object({
  id: z.string().uuid(),
  export_type: z.string(),
  tokenisation: z.enum(['always', 'never', 'configurable']),
  lawful_basis: z.string(),
  description: z.string(),
});
export type GdprExportPolicy = z.infer<typeof gdprExportPolicySchema>;

// ─── Outbound Data (what AI services pass to the gateway) ─────────────────
export const gdprEntityTypeSchema = z.enum(['student', 'parent', 'staff', 'household']);
export type GdprEntityType = z.infer<typeof gdprEntityTypeSchema>;

export const gdprOutboundEntitySchema = z.object({
  type: gdprEntityTypeSchema,
  id: z.string().uuid(),
  fields: z.record(z.string()),
});
export type GdprOutboundEntity = z.infer<typeof gdprOutboundEntitySchema>;

export const gdprOutboundDataSchema = z.object({
  entities: z.array(gdprOutboundEntitySchema),
  entityCount: z.number().int().min(0),
});
export type GdprOutboundData = z.infer<typeof gdprOutboundDataSchema>;

// ─── Token Usage Log ──────────────────────────────────────────────────────
export const gdprTokenUsageLogSchema = z.object({
  id: z.string().uuid(),
  export_type: z.string(),
  tokenised: z.boolean(),
  policy_applied: z.string(),
  lawful_basis: z.string().nullable().optional(),
  entity_count: z.number().int(),
  triggered_by: z.string().uuid(),
  override_by: z.string().uuid().nullable().optional(),
  override_reason: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});
export type GdprTokenUsageLog = z.infer<typeof gdprTokenUsageLogSchema>;

// ─── Admin Query Schemas ──────────────────────────────────────────────────
export const gdprTokenUsageQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  export_type: z.string().optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});
export type GdprTokenUsageQueryDto = z.infer<typeof gdprTokenUsageQuerySchema>;

export const gdprTokenUsageStatsQuerySchema = z.object({
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});
export type GdprTokenUsageStatsQueryDto = z.infer<typeof gdprTokenUsageStatsQuerySchema>;

// ─── Processable Outbound Options ─────────────────────────────────────────
export const gdprProcessOutboundOptionsSchema = z.object({
  overrideTokenisation: z.boolean().optional(),
  overrideReason: z.string().optional(),
  overrideByUserId: z.string().uuid().optional(),
});
export type GdprProcessOutboundOptions = z.infer<typeof gdprProcessOutboundOptionsSchema>;

// ─── Legal / DPA ────────────────────────────────────────────────────────────
export const dpaVersionSchema = z.object({
  id: z.string().uuid(),
  version: z.string(),
  content_html: z.string(),
  content_hash: z.string(),
  effective_date: z.string().date(),
  superseded_at: z.string().date().nullable().optional(),
  created_at: z.string().datetime(),
});
export type DpaVersion = z.infer<typeof dpaVersionSchema>;

export const dpaAcceptanceSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  dpa_version: z.string(),
  accepted_by_user_id: z.string().uuid(),
  accepted_at: z.string().datetime(),
  dpa_content_hash: z.string(),
  ip_address: z.string().nullable().optional(),
  created_at: z.string().datetime(),
});
export type DpaAcceptance = z.infer<typeof dpaAcceptanceSchema>;

export const dpaStatusSchema = z.object({
  current_version: dpaVersionSchema,
  accepted: z.boolean(),
  accepted_version: z.string().nullable(),
  accepted_at: z.string().datetime().nullable(),
  accepted_by_user_id: z.string().uuid().nullable(),
  history: z.array(dpaAcceptanceSchema),
});
export type DpaStatus = z.infer<typeof dpaStatusSchema>;

// ─── Privacy Notices ────────────────────────────────────────────────────────
export const createPrivacyNoticeSchema = z.object({
  effective_date: z.string().date(),
  content_html: z.string().min(1).optional(),
  content_html_ar: z.string().min(1).nullable().optional(),
});
export type CreatePrivacyNoticeDto = z.infer<typeof createPrivacyNoticeSchema>;

export const updatePrivacyNoticeSchema = createPrivacyNoticeSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one privacy notice field must be provided.',
  });
export type UpdatePrivacyNoticeDto = z.infer<typeof updatePrivacyNoticeSchema>;

export const privacyNoticeVersionSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  version_number: z.number().int().min(1),
  content_html: z.string(),
  content_html_ar: z.string().nullable().optional(),
  effective_date: z.string().date(),
  published_at: z.string().datetime().nullable().optional(),
  created_by_user_id: z.string().uuid(),
  created_at: z.string().datetime(),
  acknowledgement_count: z.number().int().min(0).optional(),
  user_has_acknowledged: z.boolean().optional(),
});
export type PrivacyNoticeVersion = z.infer<typeof privacyNoticeVersionSchema>;

export const privacyNoticeAcknowledgementSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  user_id: z.string().uuid(),
  privacy_notice_version_id: z.string().uuid(),
  acknowledged_at: z.string().datetime(),
  ip_address: z.string().nullable().optional(),
});
export type PrivacyNoticeAcknowledgement = z.infer<typeof privacyNoticeAcknowledgementSchema>;

export const privacyNoticeCurrentSchema = z.object({
  current_version: privacyNoticeVersionSchema.nullable(),
  acknowledged: z.boolean(),
  acknowledged_at: z.string().datetime().nullable(),
  requires_acknowledgement: z.boolean(),
});
export type PrivacyNoticeCurrent = z.infer<typeof privacyNoticeCurrentSchema>;

// ─── Sub-Processors ─────────────────────────────────────────────────────────
export const subProcessorRegisterEntrySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  purpose: z.string(),
  data_categories: z.string(),
  location: z.string(),
  transfer_mechanism: z.string(),
  display_order: z.number().int().min(0),
  is_planned: z.boolean(),
  notes: z.string().nullable().optional(),
});
export type SubProcessorRegisterEntry = z.infer<typeof subProcessorRegisterEntrySchema>;

export const subProcessorRegisterVersionSchema = z.object({
  id: z.string().uuid(),
  version: z.string(),
  change_summary: z.string(),
  published_at: z.string().datetime(),
  objection_deadline: z.string().date().nullable().optional(),
  created_at: z.string().datetime(),
  entries: z.array(subProcessorRegisterEntrySchema),
});
export type SubProcessorRegisterVersion = z.infer<typeof subProcessorRegisterVersionSchema>;
