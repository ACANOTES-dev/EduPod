import { z } from 'zod';

import { interventionStatusSchema, pastoralTierSchema } from '../enums';

// ─── Target Outcome sub-schema ─────────────────────────────────────────────

export const pastoralTargetOutcomeSchema = z.object({
  description: z.string().min(1),
  measurable_target: z.string().min(1),
});

export type PastoralTargetOutcome = z.infer<typeof pastoralTargetOutcomeSchema>;

// ─── Create ────────────────────────────────────────────────────────────────

export const createPastoralInterventionSchema = z.object({
  case_id: z.string().uuid(),
  student_id: z.string().uuid(),
  intervention_type: z.string().max(50),
  continuum_level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  target_outcomes: z.array(pastoralTargetOutcomeSchema).min(1),
  review_cycle_weeks: z.number().int().min(1).default(6),
  next_review_date: z.string(),
  parent_informed: z.boolean().optional().default(false),
  parent_consented: z.boolean().nullable().optional(),
  parent_input: z.string().optional(),
  student_voice: z.string().optional(),
});

export type CreatePastoralInterventionDto = z.infer<typeof createPastoralInterventionSchema>;

// ─── Update ────────────────────────────────────────────────────────────────

export const updatePastoralInterventionSchema = z.object({
  intervention_type: z.string().max(50).optional(),
  continuum_level: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  target_outcomes: z.array(pastoralTargetOutcomeSchema).min(1).optional(),
  review_cycle_weeks: z.number().int().min(1).optional(),
  next_review_date: z.string().optional(),
  parent_informed: z.boolean().optional(),
  parent_consented: z.boolean().nullable().optional(),
  parent_input: z.string().optional(),
  student_voice: z.string().optional(),
  outcome_notes: z.string().optional(),
});

export type UpdatePastoralInterventionDto = z.infer<typeof updatePastoralInterventionSchema>;

// ─── Status Transition ─────────────────────────────────────────────────────

export const pastoralInterventionStatusTransitionSchema = z.object({
  status: interventionStatusSchema,
  outcome_notes: z.string().optional(),
});

export type PastoralInterventionStatusTransitionDto = z.infer<typeof pastoralInterventionStatusTransitionSchema>;

// ─── Progress Note (append-only) ───────────────────────────────────────────

export const createPastoralInterventionProgressSchema = z.object({
  note: z.string().min(1),
});

export type CreatePastoralInterventionProgressDto = z.infer<typeof createPastoralInterventionProgressSchema>;

// ─── Filters ───────────────────────────────────────────────────────────────

export const pastoralInterventionFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  case_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  status: interventionStatusSchema.optional(),
  intervention_type: z.string().optional(),
  continuum_level: pastoralTierSchema.optional(),
  sort: z.enum(['created_at', 'next_review_date', 'status']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type PastoralInterventionFilters = z.infer<typeof pastoralInterventionFiltersSchema>;
