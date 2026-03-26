import { z } from 'zod';

export const PolicyDryRunSchema = z.object({
  category_id: z.string().uuid(),
  polarity: z.enum(['positive', 'negative', 'neutral']),
  severity: z.number().int().min(1).max(10),
  context_type: z.enum([
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
  student_year_group_id: z.string().uuid().optional(),
  student_has_send: z.boolean().default(false),
  student_has_active_intervention: z.boolean().default(false),
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
    .default('subject'),
  repeat_count: z.number().int().min(0).default(0),
  weekday: z.number().int().min(0).max(6).optional(),
  period_order: z.number().int().optional(),
});

export type PolicyDryRunDto = z.infer<typeof PolicyDryRunSchema>;

export interface DryRunStageResult {
  stage: string;
  rules_evaluated: number;
  matched_rules: Array<{
    rule_id: string;
    rule_name: string;
    matched_conditions: Record<string, unknown>;
    actions_that_would_fire: Array<{
      action_type: string;
      action_config: Record<string, unknown>;
    }>;
  }>;
}

export interface DryRunResult {
  hypothetical_input: Record<string, unknown>;
  stage_results: DryRunStageResult[];
}
