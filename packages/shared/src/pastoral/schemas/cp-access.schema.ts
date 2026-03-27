import { z } from 'zod';

// ─── Grant Access ──────────────────────────────────────────────────────────

export const grantCpAccessSchema = z.object({
  user_id: z.string().uuid(),
});

export type GrantCpAccessDto = z.infer<typeof grantCpAccessSchema>;

// ─── Revoke Access ─────────────────────────────────────────────────────────

export const revokeCpAccessSchema = z.object({
  revocation_reason: z.string().min(1).max(1000),
});

export type RevokeCpAccessDto = z.infer<typeof revokeCpAccessSchema>;

// ─── Access Check ──────────────────────────────────────────────────────────

export const cpAccessCheckSchema = z.object({
  user_id: z.string().uuid(),
});

export type CpAccessCheckDto = z.infer<typeof cpAccessCheckSchema>;

// ─── Filters ───────────────────────────────────────────────────────────────

export const cpAccessFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  active_only: z.coerce.boolean().optional().default(true),
});

export type CpAccessFilters = z.infer<typeof cpAccessFiltersSchema>;
