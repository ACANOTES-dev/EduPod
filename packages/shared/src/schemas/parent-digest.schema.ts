import { z } from 'zod';

// ─── Parent Daily Digest tenant settings ────────────────────────────────────

export const parentDigestSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  /** UTC hour (0-23) at which the digest is sent. Default 16 = 4pm UTC. */
  send_hour_utc: z.number().int().min(0).max(23).default(16),
  include_attendance: z.boolean().default(true),
  include_grades: z.boolean().default(true),
  include_behaviour: z.boolean().default(true),
  include_homework: z.boolean().default(true),
  /** Financial info is opt-in — schools must explicitly enable it. */
  include_fees: z.boolean().default(false),
});

export type ParentDigestSettingsDto = z.infer<typeof parentDigestSettingsSchema>;
