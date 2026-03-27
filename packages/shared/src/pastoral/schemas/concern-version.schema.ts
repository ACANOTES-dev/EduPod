import { z } from 'zod';

// ─── Amend Narrative ───────────────────────────────────────────────────────

export const amendNarrativeSchema = z.object({
  new_narrative: z.string().min(10).max(10000),
  amendment_reason: z.string().min(1).max(2000),
});

export type AmendNarrativeDto = z.infer<typeof amendNarrativeSchema>;
