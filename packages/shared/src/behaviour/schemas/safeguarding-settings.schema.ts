import { z } from 'zod';

// Safeguarding tenant settings stored under the `safeguarding` key in the
// generic `tenant_settings.settings` JSONB blob.
//
// User-id fields accept empty string for "not assigned yet" so the settings
// page can be saved before the DLP/Deputy/Board contact users exist in the
// tenant's user directory.

const optionalUserId = z.union([z.string().uuid(), z.literal('')]).default('');

export const safeguardingSettingsSchema = z.object({
  dlp_user_id: optionalUserId,
  deputy_dlp_user_id: optionalUserId,
  board_contact_user_id: optionalUserId,
  sla_critical_hours: z.number().int().min(1).max(720).default(24),
  sla_high_hours: z.number().int().min(1).max(720).default(48),
  sla_medium_hours: z.number().int().min(1).max(720).default(120),
  sla_low_hours: z.number().int().min(1).max(720).default(240),
  retention_years: z.number().int().min(1).max(100).default(75),
  module_enabled: z.boolean().default(true),
});

export type SafeguardingSettingsDto = z.infer<typeof safeguardingSettingsSchema>;

export const updateSafeguardingSettingsSchema = safeguardingSettingsSchema.partial();
export type UpdateSafeguardingSettingsDto = z.infer<typeof updateSafeguardingSettingsSchema>;
