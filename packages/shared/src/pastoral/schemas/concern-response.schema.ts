import { z } from 'zod';

import { concernSeveritySchema, parentShareLevelSchema } from '../enums';

import { witnessSchema } from './concern.schema';

// ─── Concern Version (nested in detail response) ───────────────────────────

export const concernVersionResponseSchema = z.object({
  id: z.string().uuid(),
  concern_id: z.string().uuid(),
  version_number: z.number().int().min(1),
  narrative: z.string(),
  amendment_reason: z.string().nullable(),
  authored_by_user_id: z.string().uuid(),
  created_at: z.string().datetime(),
});

export type ConcernVersionResponse = z.infer<typeof concernVersionResponseSchema>;

// ─── Concern List Item ─────────────────────────────────────────────────────

export const concernListItemSchema = z.object({
  id: z.string().uuid(),
  student_id: z.string().uuid(),
  category: z.string(),
  severity: concernSeveritySchema,
  tier: z.number().int().min(1).max(3),
  occurred_at: z.string().datetime(),
  created_at: z.string().datetime(),
  follow_up_needed: z.boolean(),
  case_id: z.string().uuid().nullable(),
  author_name: z.string().nullable(),
  author_masked_for_viewer: z.boolean(),
});

export type ConcernListItem = z.infer<typeof concernListItemSchema>;

// ─── Concern Detail ────────────────────────────────────────────────────────

export const concernDetailSchema = concernListItemSchema.extend({
  witnesses: z.array(witnessSchema).nullable(),
  actions_taken: z.string().nullable(),
  follow_up_suggestion: z.string().nullable(),
  location: z.string().nullable(),
  behaviour_incident_id: z.string().uuid().nullable(),
  parent_shareable: z.boolean(),
  parent_share_level: parentShareLevelSchema.nullable(),
  versions: z.array(concernVersionResponseSchema),
});

export type ConcernDetail = z.infer<typeof concernDetailSchema>;
