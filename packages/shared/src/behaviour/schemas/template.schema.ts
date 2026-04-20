import { z } from 'zod';

export const createTemplateSchema = z.object({
  category_id: z.string().uuid(),
  locale: z.enum(['en', 'ar']).default('en'),
  text: z.string().min(1).max(500),
  display_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

export type CreateTemplateDto = z.infer<typeof createTemplateSchema>;

export const updateTemplateSchema = createTemplateSchema.partial().omit({ category_id: true });

export type UpdateTemplateDto = z.infer<typeof updateTemplateSchema>;

export const listTemplatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  category_id: z.string().uuid().optional(),
  locale: z.enum(['en', 'ar']).optional(),
  is_active: z.coerce.boolean().optional(),
});

export type ListTemplatesQuery = z.infer<typeof listTemplatesQuerySchema>;
