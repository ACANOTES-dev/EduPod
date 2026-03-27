import { z } from 'zod';

import { contactMethodSchema } from '../enums';

// ─── Create (append-only — no update schema) ──────────────────────────────

export const createParentContactSchema = z.object({
  student_id: z.string().uuid(),
  concern_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  parent_id: z.string().uuid(),
  contact_method: contactMethodSchema,
  contact_date: z.string().datetime(),
  outcome: z.string().min(1),
  parent_response: z.string().optional(),
});

export type CreateParentContactDto = z.infer<typeof createParentContactSchema>;

// ─── Filters ───────────────────────────────────────────────────────────────

export const parentContactFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  concern_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  contact_method: contactMethodSchema.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort: z.enum(['contact_date', 'created_at']).default('contact_date'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ParentContactFilters = z.infer<typeof parentContactFiltersSchema>;
