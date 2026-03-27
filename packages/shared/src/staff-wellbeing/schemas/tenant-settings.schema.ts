import { z } from 'zod';

export const staffWellbeingSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  survey_default_frequency: z.enum(['weekly', 'fortnightly', 'monthly', 'ad_hoc']).default('fortnightly'),
  survey_min_response_threshold: z.number().int().min(3).default(5),
  survey_dept_drill_down_threshold: z.number().int().min(8).default(10),
  survey_moderation_enabled: z.boolean().default(true),
  workload_high_threshold_periods: z.number().int().default(22),
  workload_high_threshold_covers: z.number().int().default(8),
  eap_provider_name: z.string().default(''),
  eap_phone: z.string().default(''),
  eap_website: z.string().default(''),
  eap_hours: z.string().default(''),
  eap_management_body: z.string().default(''),
  eap_last_verified_date: z.string().nullable().default(null),
  external_resources: z.array(z.object({
    name: z.string(),
    phone: z.string().optional(),
    website: z.string().optional(),
  })).default([]),
}).default({});

export type StaffWellbeingSettings = z.infer<typeof staffWellbeingSettingsSchema>;
