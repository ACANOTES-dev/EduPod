import { z } from 'zod';

// ─── Amend Narrative ───────────────────────────────────────────────────────

export const amendNarrativeSchema = z.object({
  narrative: z.string().min(1),
  amendment_reason: z.string().min(1),
});

export type AmendNarrativeDto = z.infer<typeof amendNarrativeSchema>;

// ─── Filters ───────────────────────────────────────────────────────────────

export const concernVersionFiltersSchema = z.object({
  concern_id: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ConcernVersionFilters = z.infer<typeof concernVersionFiltersSchema>;
