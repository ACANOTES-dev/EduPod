import { z } from 'zod';

export const PolicyConditionSchema = z.object({
  // Incident category
  category_ids: z.array(z.string().uuid()).optional(),

  // Incident polarity
  polarity: z.enum(['positive', 'negative', 'neutral']).optional(),

  // Severity range (1–10, inclusive)
  severity_min: z.number().int().min(1).max(10).optional(),
  severity_max: z.number().int().min(1).max(10).optional(),

  // Student filters (evaluated against participant.student_snapshot)
  year_group_ids: z.array(z.string().uuid()).optional(),
  student_has_send: z.boolean().optional(),
  student_has_active_intervention: z.boolean().optional(),

  // Incident context
  context_types: z
    .array(
      z.enum([
        'class',
        'break',
        'before_school',
        'after_school',
        'lunch',
        'transport',
        'extra_curricular',
        'off_site',
        'online',
        'other',
      ]),
    )
    .optional(),

  // Participant role filter
  participant_role: z
    .enum([
      'subject',
      'witness',
      'bystander',
      'reporter',
      'victim',
      'instigator',
      'mediator',
    ])
    .optional(),

  // Repeat behaviour detection
  repeat_count_min: z.number().int().min(1).optional(),
  repeat_window_days: z.number().int().min(1).max(365).optional(),
  repeat_category_ids: z.array(z.string().uuid()).optional(),

  // Time-of-week filters
  weekdays: z.array(z.number().int().min(0).max(6)).optional(),
  period_orders: z.array(z.number().int()).optional(),
});

export type PolicyCondition = z.infer<typeof PolicyConditionSchema>;

export const EvaluatedInputSchema = z.object({
  // From incident
  category_id: z.string().uuid(),
  category_name: z.string(),
  polarity: z.enum(['positive', 'negative', 'neutral']),
  severity: z.number().int(),
  context_type: z.string(),
  occurred_at: z.string(),
  weekday: z.number().int().nullable(),
  period_order: z.number().int().nullable(),

  // From participant.student_snapshot
  student_id: z.string().uuid(),
  participant_role: z.string(),
  year_group_id: z.string().uuid().nullable(),
  year_group_name: z.string().nullable(),
  has_send: z.boolean(),
  had_active_intervention: z.boolean(),

  // Computed at evaluation time
  repeat_count: z.number().int(),
  repeat_window_days_used: z.number().int().nullable(),
  repeat_category_ids_used: z.array(z.string().uuid()),
});

export type EvaluatedInput = z.infer<typeof EvaluatedInputSchema>;
