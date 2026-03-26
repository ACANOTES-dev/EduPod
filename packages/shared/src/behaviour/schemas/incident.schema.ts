import { z } from 'zod';

export const incidentContextSnapshotSchema = z.object({
  category_name: z.string(),
  category_polarity: z.enum(['positive', 'negative', 'neutral']),
  category_severity: z.number(),
  category_point_value: z.number(),
  category_benchmark_category: z.string(),
  reported_by_name: z.string(),
  reported_by_role: z.string().nullable(),
  subject_name: z.string().nullable(),
  room_name: z.string().nullable(),
  academic_year_name: z.string().nullable(),
  academic_period_name: z.string().nullable(),
});

export type IncidentContextSnapshot = z.infer<typeof incidentContextSnapshotSchema>;

export const studentSnapshotSchema = z.object({
  student_name: z.string(),
  year_group_id: z.string().uuid().nullable(),
  year_group_name: z.string().nullable(),
  class_name: z.string().nullable(),
  has_send: z.boolean(),
  house_id: z.string().uuid().nullable(),
  house_name: z.string().nullable(),
  had_active_intervention: z.boolean(),
  active_intervention_ids: z.array(z.string().uuid()),
});

export type StudentSnapshot = z.infer<typeof studentSnapshotSchema>;

export const createIncidentSchema = z.object({
  category_id: z.string().uuid(),
  description: z.string().min(3).max(5000),
  parent_description: z.string().max(2000).nullable().optional(),
  parent_description_ar: z.string().max(2000).nullable().optional(),
  context_notes: z.string().max(5000).nullable().optional(),
  location: z.string().max(100).nullable().optional(),
  context_type: z.enum([
    'class', 'break', 'before_school', 'after_school', 'lunch',
    'transport', 'extra_curricular', 'off_site', 'online', 'other',
  ]).default('class'),
  occurred_at: z.string().min(1),
  academic_year_id: z.string().uuid(),
  academic_period_id: z.string().uuid().nullable().optional(),
  schedule_entry_id: z.string().uuid().nullable().optional(),
  subject_id: z.string().uuid().nullable().optional(),
  room_id: z.string().uuid().nullable().optional(),
  period_order: z.number().int().nullable().optional(),
  weekday: z.number().int().min(0).max(6).nullable().optional(),
  follow_up_required: z.boolean().optional(),
  student_ids: z.array(z.string().uuid()).min(1),
  auto_submit: z.boolean().default(true),
  idempotency_key: z.string().uuid().optional(),
  template_id: z.string().uuid().nullable().optional(),
});

export type CreateIncidentDto = z.infer<typeof createIncidentSchema>;

export const updateIncidentSchema = z.object({
  description: z.string().min(3).max(5000).optional(),
  parent_description: z.string().max(2000).nullable().optional(),
  parent_description_ar: z.string().max(2000).nullable().optional(),
  context_notes: z.string().max(5000).nullable().optional(),
  location: z.string().max(100).nullable().optional(),
  context_type: z.enum([
    'class', 'break', 'before_school', 'after_school', 'lunch',
    'transport', 'extra_curricular', 'off_site', 'online', 'other',
  ]).optional(),
  follow_up_required: z.boolean().optional(),
});

export type UpdateIncidentDto = z.infer<typeof updateIncidentSchema>;

export const statusTransitionSchema = z.object({
  status: z.enum([
    'draft', 'active', 'investigating', 'under_review',
    'awaiting_approval', 'awaiting_parent_meeting', 'escalated',
    'resolved', 'withdrawn', 'closed_after_appeal', 'superseded',
    'converted_to_safeguarding',
  ]),
  reason: z.string().min(1).max(2000).optional(),
});

export type StatusTransitionDto = z.infer<typeof statusTransitionSchema>;

export const withdrawIncidentSchema = z.object({
  reason: z.string().min(1).max(2000),
});

export type WithdrawIncidentDto = z.infer<typeof withdrawIncidentSchema>;

export const listIncidentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  polarity: z.enum(['positive', 'negative', 'neutral']).optional(),
  status: z.enum([
    'draft', 'active', 'investigating', 'under_review',
    'awaiting_approval', 'awaiting_parent_meeting', 'escalated',
    'resolved', 'withdrawn', 'closed_after_appeal', 'superseded',
    'converted_to_safeguarding',
  ]).optional(),
  category_id: z.string().uuid().optional(),
  reported_by_id: z.string().uuid().optional(),
  student_id: z.string().uuid().optional(),
  follow_up_required: z.coerce.boolean().optional(),
  academic_year_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort: z.enum(['occurred_at', 'created_at', 'severity']).default('occurred_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
  tab: z.enum(['all', 'positive', 'negative', 'pending', 'escalated', 'my']).optional(),
});

export type ListIncidentsQuery = z.infer<typeof listIncidentsQuerySchema>;
