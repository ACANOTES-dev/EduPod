/**
 * Shared types and Zod schemas for the wellbeing rebuild.
 * Consumed by the API, worker, and web layers via the `@school/shared/wellbeing`
 * subpath export.
 *
 * Surface:
 *   - TenantAiFlag: per-(tenant, module) AI feature gate
 *   - WellbeingChannelPreferences: per-event notification channel overrides
 *   - WELLBEING_AI_MODULE_KEYS: canonical module-key list used everywhere
 */
import { z } from 'zod';

// ─── Module keys ────────────────────────────────────────────────────────────

/** Modules gated by the per-module AI flag. */
export const WELLBEING_AI_MODULE_KEYS = [
  'behaviour',
  'pastoral',
  'staff_wellbeing',
  'early_warning',
] as const;

export type WellbeingAiModuleKey = (typeof WELLBEING_AI_MODULE_KEYS)[number];

export const wellbeingAiModuleKeySchema = z.enum(WELLBEING_AI_MODULE_KEYS);

// ─── TenantAiFlag ───────────────────────────────────────────────────────────

export const tenantAiFlagSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  module_key: wellbeingAiModuleKeySchema,
  enabled: z.boolean(),
  updated_at: z.string().datetime(),
  updated_by: z.string().uuid().nullable(),
});
export type TenantAiFlag = z.infer<typeof tenantAiFlagSchema>;

/** Input shape for updating a single AI flag. */
export const updateTenantAiFlagSchema = z.object({
  module_key: wellbeingAiModuleKeySchema,
  enabled: z.boolean(),
});
export type UpdateTenantAiFlagDto = z.infer<typeof updateTenantAiFlagSchema>;

// ─── WellbeingChannelPreferences ────────────────────────────────────────────

export const wellbeingChannelToggleSchema = z.object({
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
});

/**
 * Shape of the `tenant_notification_preferences.wellbeing_channels` JSONB
 * column. In-app delivery is always on and lives outside this structure.
 */
export const wellbeingChannelPreferencesSchema = z.object({
  defaults: z.object({
    email: z.boolean(),
    sms: z.boolean(),
    whatsapp: z.boolean(),
  }),
  overrides: z.record(z.string().min(1), wellbeingChannelToggleSchema),
});
export type WellbeingChannelPreferences = z.infer<typeof wellbeingChannelPreferencesSchema>;

/**
 * Input schema for updating the per-tenant wellbeing channel preferences.
 * Mirrors the persisted shape so the controller can `.parse` the body
 * directly.
 */
export const updateWellbeingChannelPreferencesSchema = wellbeingChannelPreferencesSchema;
export type UpdateWellbeingChannelPreferencesDto = z.infer<
  typeof updateWellbeingChannelPreferencesSchema
>;

/**
 * Canonical list of wellbeing event keys used under `overrides`. Consumers
 * import this to avoid typos when wiring up per-event channel overrides.
 * Extending the list is safe; removing an entry requires a data migration.
 */
export const WELLBEING_NOTIFICATION_EVENT_KEYS = [
  'incident.logged',
  'incident.escalated',
  'concern.raised',
  'concern.acknowledged',
  'sanction.scheduled',
  'sanction.served',
  'sla.breach',
  'critical.declared',
  'appeal.submitted',
  'recognition.awarded',
] as const;

export type WellbeingNotificationEventKey = (typeof WELLBEING_NOTIFICATION_EVENT_KEYS)[number];
