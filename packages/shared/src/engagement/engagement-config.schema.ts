import { z } from 'zod';

// ─── Engagement Module Configuration ──────────────────────────────────────────

export const engagementConfigSchema = z.object({
  enabled: z.boolean().default(true),
  default_reminder_days: z.array(z.number().int().min(1).max(30)).default([2, 5, 7]),
  require_risk_assessment_for_trips: z.boolean().default(true),
  conference_default_slot_minutes: z.number().int().min(5).max(60).default(10),
  conference_default_buffer_minutes: z.number().int().min(0).max(15).default(2),
  allow_parent_conference_cancellation: z.boolean().default(true),
  consent_chase_channels: z
    .array(z.enum(['in_app', 'email', 'sms', 'whatsapp']))
    .default(['in_app', 'email']),
  max_reminders_per_form: z.number().int().min(1).max(20).default(5),
});

export type EngagementConfig = z.infer<typeof engagementConfigSchema>;
