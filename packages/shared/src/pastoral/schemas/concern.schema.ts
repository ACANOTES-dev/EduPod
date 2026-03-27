import { z } from 'zod';

import { concernSeveritySchema, parentShareLevelSchema, pastoralTierSchema } from '../enums';

// ─── Witness sub-schema ────────────────────────────────────────────────────

export const witnessSchema = z.object({
  type: z.enum(['staff', 'student']),
  id: z.string().uuid(),
  name: z.string(),
});

export type Witness = z.infer<typeof witnessSchema>;

// ─── Create ────────────────────────────────────────────────────────────────

export const createConcernSchema = z.object({
  student_id: z.string().uuid(),
  category: z.string().max(50),
  severity: concernSeveritySchema,
  tier: pastoralTierSchema.optional().default(1),
  occurred_at: z.string().datetime(),
  location: z.string().max(255).optional(),
  witnesses: z.array(witnessSchema).optional(),
  actions_taken: z.string().optional(),
  follow_up_needed: z.boolean().optional().default(false),
  follow_up_suggestion: z.string().optional(),
  case_id: z.string().uuid().optional(),
  behaviour_incident_id: z.string().uuid().optional(),
  author_masked: z.boolean().optional().default(false),
  parent_shareable: z.boolean().optional().default(false),
  parent_share_level: parentShareLevelSchema.optional().default('category_only'),
  narrative: z.string().min(1),
});

export type CreateConcernDto = z.infer<typeof createConcernSchema>;

// ─── Update ────────────────────────────────────────────────────────────────

export const updateConcernSchema = z.object({
  category: z.string().max(50).optional(),
  severity: concernSeveritySchema.optional(),
  tier: pastoralTierSchema.optional(),
  location: z.string().max(255).optional(),
  witnesses: z.array(witnessSchema).optional(),
  actions_taken: z.string().optional(),
  follow_up_needed: z.boolean().optional(),
  follow_up_suggestion: z.string().optional(),
  case_id: z.string().uuid().nullable().optional(),
  parent_shareable: z.boolean().optional(),
  parent_share_level: parentShareLevelSchema.optional(),
  legal_hold: z.boolean().optional(),
});

export type UpdateConcernDto = z.infer<typeof updateConcernSchema>;

// ─── Acknowledge ───────────────────────────────────────────────────────────

export const acknowledgeConcernSchema = z.object({
  concern_id: z.string().uuid(),
});

export type AcknowledgeConcernDto = z.infer<typeof acknowledgeConcernSchema>;

// ─── Share with Parent ─────────────────────────────────────────────────────

export const shareConcernWithParentSchema = z.object({
  parent_share_level: parentShareLevelSchema,
});

export type ShareConcernWithParentDto = z.infer<typeof shareConcernWithParentSchema>;

// ─── Filters ───────────────────────────────────────────────────────────────

export const concernFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  category: z.string().optional(),
  severity: concernSeveritySchema.optional(),
  tier: pastoralTierSchema.optional(),
  case_id: z.string().uuid().optional(),
  follow_up_needed: z.coerce.boolean().optional(),
  logged_by_user_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  acknowledged: z.coerce.boolean().optional(),
  imported: z.coerce.boolean().optional(),
  sort: z.enum(['occurred_at', 'created_at', 'severity']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type ConcernFilters = z.infer<typeof concernFiltersSchema>;
