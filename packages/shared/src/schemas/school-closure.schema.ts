import { z } from 'zod';

export const createClosureSchema = z.object({
  closure_date: z.string().min(1),
  reason: z.string().min(1).max(255),
  affects_scope: z.enum(['all', 'year_group', 'class']),
  scope_entity_id: z.string().uuid().optional(),
});

export type CreateClosureDto = z.infer<typeof createClosureSchema>;

export const bulkCreateClosureSchema = z.object({
  start_date: z.string().min(1),
  end_date: z.string().min(1),
  reason: z.string().min(1).max(255),
  affects_scope: z.enum(['all', 'year_group', 'class']),
  scope_entity_id: z.string().uuid().optional(),
  skip_weekends: z.boolean().optional().default(true),
});

export type BulkCreateClosureDto = z.infer<typeof bulkCreateClosureSchema>;
