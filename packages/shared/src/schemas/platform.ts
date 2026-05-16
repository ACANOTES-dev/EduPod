import { z } from 'zod';

// ─── Platform Health History ─────────────────────────────────────────────────

export const healthHistoryQuerySchema = z.object({
  hours: z.coerce.number().min(1).max(168).default(24),
  component: z.enum(['postgresql', 'redis', 'meilisearch', 'bullmq', 'disk']).optional(),
});

export type HealthHistoryQuery = z.infer<typeof healthHistoryQuerySchema>;

// ─── Platform Users + RBAC ───────────────────────────────────────────────────

export const platformRoleKeySchema = z.enum(['platform_owner', 'platform_support']);

export type PlatformRoleKeyDto = z.infer<typeof platformRoleKeySchema>;

export const invitePlatformUserSchema = z.object({
  email: z.string().trim().email().max(255),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  role_keys: z.array(platformRoleKeySchema).min(1),
  notes: z.string().trim().max(2000).optional(),
});

export type InvitePlatformUserDto = z.infer<typeof invitePlatformUserSchema>;

export const updatePlatformUserRolesSchema = z.object({
  role_keys: z.array(platformRoleKeySchema).min(1),
});

export type UpdatePlatformUserRolesDto = z.infer<typeof updatePlatformUserRolesSchema>;

// ─── Platform Alert Rules ────────────────────────────────────────────────────

export const alertComponentSchema = z.enum([
  'postgresql',
  'redis',
  'meilisearch',
  'bullmq',
  'disk',
]);

export const alertConditionConfigSchema = z
  .object({
    operator: z.enum(['gt', 'lt', 'eq', 'gte', 'lte', 'neq']),
    threshold: z.coerce.number(),
    duration_minutes: z.coerce.number().int().min(1).max(60).optional(),
    component: alertComponentSchema.optional(),
    queue: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (
      (value.operator === 'gt' ||
        value.operator === 'gte' ||
        value.operator === 'lt' ||
        value.operator === 'lte') &&
      !Number.isFinite(value.threshold)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Threshold must be a finite number',
        path: ['threshold'],
      });
    }
  });

export type AlertConditionConfig = z.infer<typeof alertConditionConfigSchema>;

export const alertMetricSchema = z.enum([
  'health_status',
  'component_latency',
  'component_status',
  'disk_free_gb',
  'bullmq_stuck_jobs',
]);

export const alertSeveritySchema = z.enum(['info', 'warning', 'critical']);

export const alertStatusSchema = z.enum(['fired', 'acknowledged', 'resolved']);

const alertRuleBaseSchema = z.object({
  name: z.string().trim().min(1).max(255),
  metric: alertMetricSchema,
  condition_config: alertConditionConfigSchema,
  severity: alertSeveritySchema,
  cooldown_minutes: z.coerce.number().int().min(1).max(1440).default(15),
  is_enabled: z.boolean().default(true),
  notify_emails: z.array(z.string().trim().email()).default([]),
});

export const createAlertRuleSchema = alertRuleBaseSchema.superRefine((value, ctx) => {
  if (
    (value.metric === 'component_latency' || value.metric === 'component_status') &&
    !value.condition_config.component
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Component is required for component metrics',
      path: ['condition_config', 'component'],
    });
  }
});

export type CreateAlertRuleDto = z.infer<typeof createAlertRuleSchema>;

export const updateAlertRuleSchema = alertRuleBaseSchema.partial().superRefine((value, ctx) => {
  if (value.condition_config) {
    if (
      (value.metric === 'component_latency' || value.metric === 'component_status') &&
      !value.condition_config.component
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Component is required for component metrics',
        path: ['condition_config', 'component'],
      });
    }
  }
});

export type UpdateAlertRuleDto = z.infer<typeof updateAlertRuleSchema>;

export const alertHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: alertStatusSchema.optional(),
  severity: alertSeveritySchema.optional(),
  rule_id: z.string().uuid().optional(),
});

export type AlertHistoryQuery = z.infer<typeof alertHistoryQuerySchema>;

// ─── Tenant Onboarding ───────────────────────────────────────────────────────

export const onboardingStepStatusSchema = z.enum([
  'pending',
  'in_progress',
  'completed',
  'skipped',
]);

export const updateOnboardingStepSchema = z.object({
  status: onboardingStepStatusSchema,
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateOnboardingStepDto = z.infer<typeof updateOnboardingStepSchema>;
