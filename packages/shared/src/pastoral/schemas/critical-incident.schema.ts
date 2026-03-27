import { z } from 'zod';

import {
  affectedTypeSchema,
  criticalIncidentImpactLevelSchema,
  criticalIncidentScopeSchema,
  criticalIncidentStatusSchema,
  criticalIncidentTypeSchema,
} from '../enums';

// ─── Response Plan sub-schema ──────────────────────────────────────────────

export const responsePlanItemSchema = z.object({
  phase: z.string(),
  action: z.string(),
  completed: z.boolean().default(false),
  completed_at: z.string().datetime().optional(),
});

export type ResponsePlanItem = z.infer<typeof responsePlanItemSchema>;

// ─── External Support sub-schema ───────────────────────────────────────────

export const externalSupportEntrySchema = z.object({
  provider: z.string(),
  contact: z.string(),
  dates: z.array(z.string()),
  notes: z.string().optional(),
});

export type ExternalSupportEntry = z.infer<typeof externalSupportEntrySchema>;

// ─── Create ────────────────────────────────────────────────────────────────

export const createCriticalIncidentSchema = z.object({
  incident_type: criticalIncidentTypeSchema,
  description: z.string().min(1),
  occurred_at: z.string().datetime(),
  scope: criticalIncidentScopeSchema,
  scope_ids: z.array(z.string().uuid()).optional(),
  response_plan: z.array(responsePlanItemSchema).optional(),
  external_support_log: z.array(externalSupportEntrySchema).optional(),
});

export type CreateCriticalIncidentDto = z.infer<typeof createCriticalIncidentSchema>;

// ─── Update ────────────────────────────────────────────────────────────────

export const updateCriticalIncidentSchema = z.object({
  description: z.string().min(1).optional(),
  status: criticalIncidentStatusSchema.optional(),
  scope: criticalIncidentScopeSchema.optional(),
  scope_ids: z.array(z.string().uuid()).optional(),
  response_plan: z.array(responsePlanItemSchema).optional(),
  external_support_log: z.array(externalSupportEntrySchema).optional(),
});

export type UpdateCriticalIncidentDto = z.infer<typeof updateCriticalIncidentSchema>;

// ─── Add Affected Person ───────────────────────────────────────────────────

export const addAffectedPersonSchema = z.object({
  affected_type: affectedTypeSchema,
  student_id: z.string().uuid().optional(),
  staff_profile_id: z.string().uuid().optional(),
  impact_level: criticalIncidentImpactLevelSchema,
  notes: z.string().optional(),
  support_offered: z.boolean().optional().default(false),
});

export type AddAffectedPersonDto = z.infer<typeof addAffectedPersonSchema>;

// ─── Update Affected Person ────────────────────────────────────────────────

export const updateAffectedPersonSchema = z.object({
  impact_level: criticalIncidentImpactLevelSchema.optional(),
  notes: z.string().optional(),
  support_offered: z.boolean().optional(),
});

export type UpdateAffectedPersonDto = z.infer<typeof updateAffectedPersonSchema>;

// ─── Filters ───────────────────────────────────────────────────────────────

export const criticalIncidentFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  incident_type: criticalIncidentTypeSchema.optional(),
  status: criticalIncidentStatusSchema.optional(),
  scope: criticalIncidentScopeSchema.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort: z.enum(['occurred_at', 'created_at', 'status']).default('occurred_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CriticalIncidentFilters = z.infer<typeof criticalIncidentFiltersSchema>;
