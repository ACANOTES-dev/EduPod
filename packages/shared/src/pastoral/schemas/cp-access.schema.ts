import { z } from 'zod';

// ─── Grant Access ──────────────────────────────────────────────────────────

export const grantCpAccessSchema = z.object({
  user_id: z.string().uuid(),
});

export type GrantCpAccessDto = z.infer<typeof grantCpAccessSchema>;

// ─── Revoke Access ─────────────────────────────────────────────────────────

export const revokeCpAccessSchema = z.object({
  user_id: z.string().uuid(),
  reason: z.string().min(1),
});

export type RevokeCpAccessDto = z.infer<typeof revokeCpAccessSchema>;

// ─── Filters ───────────────────────────────────────────────────────────────

export const cpAccessFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  active_only: z.coerce.boolean().optional().default(true),
});

export type CpAccessFilters = z.infer<typeof cpAccessFiltersSchema>;
