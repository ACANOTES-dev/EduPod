import { z } from 'zod';

// ─── Create / Update House ──────────────────────────────────────────────────

export const createHouseSchema = z.object({
  name: z.string().min(1).max(100),
  name_ar: z.string().max(100).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  icon: z.string().max(50).nullable().optional(),
  display_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

export type CreateHouseDto = z.infer<typeof createHouseSchema>;

export const updateHouseSchema = createHouseSchema.partial();
export type UpdateHouseDto = z.infer<typeof updateHouseSchema>;
