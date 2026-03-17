import { z } from 'zod';

export const searchQuerySchema = z.object({
  q: z.string().min(1, 'Search query cannot be empty'),
  types: z.union([z.string(), z.array(z.string())]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type SearchQueryDto = z.infer<typeof searchQuerySchema>;
