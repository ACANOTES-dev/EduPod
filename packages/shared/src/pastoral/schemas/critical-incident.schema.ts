import { z } from 'zod';

import {
  criticalIncidentScopeSchema,
  criticalIncidentStatusSchema,
  criticalIncidentTypeSchema,
} from '../enums';

// ─── Response Plan Item sub-schema (JSONB) ────────────────────────────────

export const responsePlanItemSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  description: z.string().nullable(),
  assigned_to_id: z.string().uuid().nullable(),
  assigned_to_name: z.string().nullable(),
  is_done: z.boolean().default(false),
  completed_at: z.string().nullable(),
  completed_by_id: z.string().uuid().nullable(),
  completed_by_name: z.string().nullable(),
  notes: z.string().nullable(),
});

export type ResponsePlanItem = z.infer<typeof responsePlanItemSchema>;

// ─── Response Plan schema (JSONB) ─────────────────────────────────────────

export const responsePlanSchema = z.object({
  immediate: z.array(responsePlanItemSchema).default([]),
  short_term: z.array(responsePlanItemSchema).default([]),
  medium_term: z.array(responsePlanItemSchema).default([]),
  long_term: z.array(responsePlanItemSchema).default([]),
});

export type ResponsePlan = z.infer<typeof responsePlanSchema>;

// ─── External Support Entry sub-schema (JSONB) ───────────────────────────

export const externalSupportEntrySchema = z.object({
  id: z.string().uuid(),
  provider_type: z.enum(['neps_ci_team', 'external_counsellor', 'other']),
  provider_name: z.string(),
  contact_person: z.string().nullable(),
  contact_details: z.string().nullable(),
  visit_date: z.string().nullable(),
  visit_time_start: z.string().nullable(),
  visit_time_end: z.string().nullable(),
  availability_notes: z.string().nullable(),
  students_seen: z.array(z.string().uuid()).default([]),
  outcome_notes: z.string().nullable(),
  recorded_by_id: z.string().uuid(),
  recorded_at: z.string(),
});

export type ExternalSupportEntry = z.infer<typeof externalSupportEntrySchema>;

// ─── Declare (Create) ─────────────────────────────────────────────────────

export const createCriticalIncidentSchema = z.object({
  incident_type: criticalIncidentTypeSchema,
  incident_type_other: z.string().max(200).optional(),
  description: z.string().min(10).max(5000),
  incident_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scope: criticalIncidentScopeSchema,
  scope_year_group_ids: z.array(z.string().uuid()).optional(),
  scope_class_ids: z.array(z.string().uuid()).optional(),
}).refine(
  (data) => data.incident_type !== 'other' || (data.incident_type_other && data.incident_type_other.length > 0),
  { message: 'incident_type_other is required when incident_type is other', path: ['incident_type_other'] },
).refine(
  (data) => data.scope !== 'year_group' || (data.scope_year_group_ids && data.scope_year_group_ids.length > 0),
  { message: 'scope_year_group_ids required when scope is year_group', path: ['scope_year_group_ids'] },
).refine(
  (data) => data.scope !== 'class_group' || (data.scope_class_ids && data.scope_class_ids.length > 0),
  { message: 'scope_class_ids required when scope is class_group', path: ['scope_class_ids'] },
);

export type CreateCriticalIncidentDto = z.infer<typeof createCriticalIncidentSchema>;

// ─── Update ───────────────────────────────────────────────────────────────

export const updateCriticalIncidentSchema = z.object({
  description: z.string().min(10).max(5000).optional(),
  communication_notes: z.string().max(5000).optional(),
});

export type UpdateCriticalIncidentDto = z.infer<typeof updateCriticalIncidentSchema>;

// ─── Status Transition ────────────────────────────────────────────────────

export const transitionCriticalIncidentStatusSchema = z.object({
  new_status: criticalIncidentStatusSchema,
  reason: z.string().min(5).max(1000),
  closure_notes: z.string().min(10).max(5000).optional(),
}).refine(
  (data) => data.new_status !== 'closed' || (data.closure_notes && data.closure_notes.length >= 10),
  { message: 'closure_notes required when closing an incident', path: ['closure_notes'] },
);

export type TransitionCriticalIncidentStatusDto = z.infer<typeof transitionCriticalIncidentStatusSchema>;

// ─── Add Affected Person ─────────────────────────────────────────────────

export const addAffectedPersonSchema = z.object({
  person_type: z.enum(['student', 'staff']),
  student_id: z.string().uuid().optional(),
  staff_id: z.string().uuid().optional(),
  impact_level: z.enum(['directly_affected', 'indirectly_affected']),
  wellbeing_flag_expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  notes: z.string().max(2000).optional(),
}).refine(
  (data) => data.person_type !== 'student' || data.student_id,
  { message: 'student_id required when person_type is student', path: ['student_id'] },
).refine(
  (data) => data.person_type !== 'staff' || data.staff_id,
  { message: 'staff_id required when person_type is staff', path: ['staff_id'] },
);

export type AddAffectedPersonDto = z.infer<typeof addAffectedPersonSchema>;

// ─── Bulk Add Affected ───────────────────────────────────────────────────

export const bulkAddAffectedSchema = z.object({
  persons: z.array(addAffectedPersonSchema).min(1).max(500),
});

export type BulkAddAffectedDto = z.infer<typeof bulkAddAffectedSchema>;

// ─── Update Affected Person ──────────────────────────────────────────────

export const updateAffectedPersonSchema = z.object({
  impact_level: z.enum(['directly_affected', 'indirectly_affected']).optional(),
  wellbeing_flag_active: z.boolean().optional(),
  wellbeing_flag_expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  support_offered: z.boolean().optional(),
  support_notes: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

export type UpdateAffectedPersonDto = z.infer<typeof updateAffectedPersonSchema>;

// ─── Remove Affected Person ──────────────────────────────────────────────

export const removeAffectedPersonSchema = z.object({
  reason: z.string().min(1),
});

export type RemoveAffectedPersonDto = z.infer<typeof removeAffectedPersonSchema>;

// ─── Record Support Offered ──────────────────────────────────────────────

export const recordSupportOfferedSchema = z.object({
  notes: z.string().min(5).max(2000),
});

export type RecordSupportOfferedDto = z.infer<typeof recordSupportOfferedSchema>;

// ─── Update Response Plan Item ───────────────────────────────────────────

export const updateResponsePlanItemSchema = z.object({
  phase: z.enum(['immediate', 'short_term', 'medium_term', 'long_term']),
  item_id: z.string().uuid(),
  assigned_to_id: z.string().uuid().optional(),
  is_done: z.boolean().optional(),
  notes: z.string().max(2000).optional(),
});

export type UpdateResponsePlanItemDto = z.infer<typeof updateResponsePlanItemSchema>;

// ─── Add Response Plan Item ──────────────────────────────────────────────

export const addResponsePlanItemSchema = z.object({
  phase: z.enum(['immediate', 'short_term', 'medium_term', 'long_term']),
  label: z.string().min(3).max(300),
  description: z.string().max(1000).optional(),
  assigned_to_id: z.string().uuid().optional(),
});

export type AddResponsePlanItemDto = z.infer<typeof addResponsePlanItemSchema>;

// ─── Add External Support ────────────────────────────────────────────────

export const addExternalSupportSchema = z.object({
  provider_type: z.enum(['neps_ci_team', 'external_counsellor', 'other']),
  provider_name: z.string().min(2).max(200),
  contact_person: z.string().max(200).optional(),
  contact_details: z.string().max(500).optional(),
  visit_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  visit_time_start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  visit_time_end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  availability_notes: z.string().max(1000).optional(),
  students_seen: z.array(z.string().uuid()).optional(),
  outcome_notes: z.string().max(2000).optional(),
});

export type AddExternalSupportDto = z.infer<typeof addExternalSupportSchema>;

// ─── Affected Person Filters ─────────────────────────────────────────────

export const affectedPersonFiltersSchema = z.object({
  person_type: z.enum(['student', 'staff']).optional(),
  impact_level: z.enum(['directly_affected', 'indirectly_affected']).optional(),
  support_offered: z.coerce.boolean().optional(),
});

export type AffectedPersonFilters = z.infer<typeof affectedPersonFiltersSchema>;

// ─── Filters ──────────────────────────────────────────────────────────────

export const criticalIncidentFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  incident_type: criticalIncidentTypeSchema.optional(),
  status: criticalIncidentStatusSchema.optional(),
  scope: criticalIncidentScopeSchema.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort: z.enum(['incident_date', 'created_at', 'status']).default('incident_date'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CriticalIncidentFilters = z.infer<typeof criticalIncidentFiltersSchema>;
