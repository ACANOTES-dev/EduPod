import { z } from 'zod';

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  name_ar: z.string().max(100).nullable().optional(),
  polarity: z.enum(['positive', 'negative', 'neutral']),
  severity: z.number().int().min(1).max(10),
  point_value: z.number().int().default(0),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  requires_follow_up: z.boolean().default(false),
  requires_parent_notification: z.boolean().default(false),
  parent_visible: z.boolean().default(true),
  benchmark_category: z.enum([
    'praise', 'merit', 'minor_positive', 'major_positive',
    'verbal_warning', 'written_warning', 'detention',
    'internal_suspension', 'external_suspension', 'expulsion',
    'note', 'observation', 'other',
  ]),
  display_order: z.number().int().default(0),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = createCategorySchema.partial();

export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;
