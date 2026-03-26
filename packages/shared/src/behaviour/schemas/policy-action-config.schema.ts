import { z } from 'zod';

export const AutoEscalateConfigSchema = z.object({
  target_category_id: z.string().uuid(),
  reason: z.string().optional(),
});

export const CreateSanctionConfigSchema = z.object({
  sanction_type: z.enum([
    'detention',
    'suspension_internal',
    'suspension_external',
    'expulsion',
    'community_service',
    'loss_of_privilege',
    'restorative_meeting',
    'other',
  ]),
  days_offset: z.number().int().min(0).optional(),
  duration_minutes: z.number().int().optional(),
  notes: z.string().optional(),
});

export const RequireApprovalConfigSchema = z.object({
  approver_role: z.string().optional(),
  approver_user_id: z.string().uuid().optional(),
  reason: z.string().optional(),
});

export const RequireParentMeetingConfigSchema = z.object({
  due_within_school_days: z.number().int().min(1).default(5),
  assigned_to_role: z.string().optional(),
  notes: z.string().optional(),
});

export const RequireParentNotificationConfigSchema = z.object({
  channels: z
    .array(z.enum(['email', 'whatsapp', 'in_app']))
    .optional(),
  priority: z.enum(['immediate', 'digest']).default('immediate'),
});

export const CreateTaskConfigSchema = z.object({
  task_type: z.enum([
    'follow_up',
    'intervention_review',
    'parent_meeting',
    'parent_acknowledgement',
    'approval_action',
    'sanction_supervision',
    'return_check_in',
    'safeguarding_action',
    'document_requested',
    'appeal_review',
    'break_glass_review',
    'guardian_restriction_review',
    'custom',
  ]),
  title: z.string(),
  assigned_to_role: z.string().optional(),
  assigned_to_user_id: z.string().uuid().optional(),
  due_in_school_days: z.number().int().min(1).default(3),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

export const CreateInterventionConfigSchema = z.object({
  type: z.enum([
    'behaviour_plan',
    'mentoring',
    'counselling_referral',
    'restorative',
    'academic_support',
    'parent_engagement',
    'external_agency',
    'other',
  ]),
  title: z.string(),
  assigned_to_role: z.string().optional(),
});

export const NotifyRolesConfigSchema = z.object({
  roles: z.array(z.string()),
  message_template: z.string().optional(),
  priority: z.enum(['normal', 'urgent']).default('normal'),
});

export const NotifyUsersConfigSchema = z.object({
  user_ids: z.array(z.string().uuid()),
  message_template: z.string().optional(),
  priority: z.enum(['normal', 'urgent']).default('normal'),
});

export const FlagForReviewConfigSchema = z.object({
  reason: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

export const BlockWithoutApprovalConfigSchema = z.object({
  approver_role: z.string().optional(),
  block_reason: z.string(),
});

export const PolicyActionConfigSchemaMap = {
  auto_escalate: AutoEscalateConfigSchema,
  create_sanction: CreateSanctionConfigSchema,
  require_approval: RequireApprovalConfigSchema,
  require_parent_meeting: RequireParentMeetingConfigSchema,
  require_parent_notification: RequireParentNotificationConfigSchema,
  create_task: CreateTaskConfigSchema,
  create_intervention: CreateInterventionConfigSchema,
  notify_roles: NotifyRolesConfigSchema,
  notify_users: NotifyUsersConfigSchema,
  flag_for_review: FlagForReviewConfigSchema,
  block_without_approval: BlockWithoutApprovalConfigSchema,
} as const;

export type PolicyActionType = keyof typeof PolicyActionConfigSchemaMap;
