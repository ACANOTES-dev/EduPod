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
  fields: z.record(z.string()),  // field_type → real value
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
