import { z } from 'zod';

// ─── Update Escalation Settings ───────────────────────────────────────────

export const updateEscalationSettingsSchema = z.object({
  escalation_enabled: z.boolean().optional(),
  escalation_urgent_timeout_minutes: z.number().int().min(15).max(1440).optional(),
  escalation_critical_timeout_minutes: z.number().int().min(5).max(480).optional(),
  escalation_urgent_recipients: z.array(z.string().uuid()).optional(),
  escalation_critical_recipients: z.array(z.string().uuid()).optional(),
});

export type UpdateEscalationSettingsDto = z.infer<typeof updateEscalationSettingsSchema>;
