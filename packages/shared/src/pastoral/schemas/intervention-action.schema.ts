import { z } from 'zod';

import { actionFrequencySchema, actionStatusSchema } from '../enums';

// ─── Create ────────────────────────────────────────────────────────────────

export const createInterventionActionSchema = z.object({
  intervention_id: z.string().uuid(),
  description: z.string().min(1),
  assigned_to_user_id: z.string().uuid(),
  frequency: actionFrequencySchema.optional(),
  start_date: z.string(),
  due_date: z.string().optional(),
}).refine(
  (data) => data.frequency !== 'once' || data.due_date !== undefined,
  { message: 'due_date is required when frequency is "once"', path: ['due_date'] },
);

export type CreateInterventionActionDto = z.infer<typeof createInterventionActionSchema>;

// ─── Update ────────────────────────────────────────────────────────────────

export const updateInterventionActionSchema = z.object({
  description: z.string().min(1).optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  frequency: actionFrequencySchema.optional(),
  due_date: z.string().nullable().optional(),
  status: actionStatusSchema.optional(),
});

export type UpdateInterventionActionDto = z.infer<typeof updateInterventionActionSchema>;

// ─── Complete ──────────────────────────────────────────────────────────────

export const completeInterventionActionSchema = z.object({
  action_id: z.string().uuid(),
});

export type CompleteInterventionActionDto = z.infer<typeof completeInterventionActionSchema>;

// ─── Filters ───────────────────────────────────────────────────────────────

export const interventionActionFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  intervention_id: z.string().uuid().optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  status: actionStatusSchema.optional(),
  sort: z.enum(['created_at', 'due_date', 'status']).default('due_date'),
  order: z.enum(['asc', 'desc']).default('asc'),
});

export type InterventionActionFilters = z.infer<typeof interventionActionFiltersSchema>;
