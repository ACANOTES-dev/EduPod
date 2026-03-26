import { z } from 'zod';

import { PolicyConditionSchema } from './policy-condition.schema';

const POLICY_STAGES = [
  'consequence',
  'approval',
  'notification',
  'support',
  'alerting',
] as const;

const MATCH_STRATEGIES = ['first_match', 'all_matching'] as const;

const ACTION_TYPES = [
  'auto_escalate',
  'create_sanction',
  'require_approval',
  'require_parent_meeting',
  'require_parent_notification',
  'create_task',
  'create_intervention',
  'notify_roles',
  'notify_users',
  'flag_for_review',
  'block_without_approval',
] as const;

export const policyRuleActionSchema = z.object({
  action_type: z.enum(ACTION_TYPES),
  action_config: z.record(z.unknown()),
  execution_order: z.number().int().min(0).default(0),
});

export const createPolicyRuleSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  stage: z.enum(POLICY_STAGES),
  priority: z.number().int().default(100),
  match_strategy: z.enum(MATCH_STRATEGIES).default('first_match'),
  stop_processing_stage: z.boolean().default(false),
  is_active: z.boolean().default(true),
  conditions: PolicyConditionSchema,
  actions: z.array(policyRuleActionSchema).min(1),
});

export type CreatePolicyRuleDto = z.infer<typeof createPolicyRuleSchema>;

export const updatePolicyRuleSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  stage: z.enum(POLICY_STAGES).optional(),
  priority: z.number().int().optional(),
  match_strategy: z.enum(MATCH_STRATEGIES).optional(),
  stop_processing_stage: z.boolean().optional(),
  is_active: z.boolean().optional(),
  conditions: PolicyConditionSchema.optional(),
  actions: z.array(policyRuleActionSchema).min(1).optional(),
  change_reason: z.string().max(1000).optional(),
});

export type UpdatePolicyRuleDto = z.infer<typeof updatePolicyRuleSchema>;

export const updatePolicyPrioritySchema = z.object({
  priority: z.number().int(),
});

export type UpdatePolicyPriorityDto = z.infer<typeof updatePolicyPrioritySchema>;

export const listPolicyRulesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  stage: z.enum(POLICY_STAGES).optional(),
  is_active: z.coerce.boolean().optional(),
});

export type ListPolicyRulesQuery = z.infer<typeof listPolicyRulesQuerySchema>;

export const importPolicyRulesSchema = z.object({
  rules: z.array(
    z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(2000).nullable().optional(),
      stage: z.enum(POLICY_STAGES),
      priority: z.number().int().default(100),
      match_strategy: z.enum(MATCH_STRATEGIES).default('first_match'),
      stop_processing_stage: z.boolean().default(false),
      conditions: z.record(z.unknown()),
      actions: z.array(
        z.object({
          action_type: z.enum(ACTION_TYPES),
          action_config: z.record(z.unknown()),
          execution_order: z.number().int().min(0).default(0),
        }),
      ),
    }),
  ),
});

export type ImportPolicyRulesDto = z.infer<typeof importPolicyRulesSchema>;

export { POLICY_STAGES, MATCH_STRATEGIES, ACTION_TYPES };
