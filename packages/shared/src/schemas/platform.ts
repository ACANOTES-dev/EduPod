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

// ─── Platform Audit + Error Log ──────────────────────────────────────────────

export const platformAuditActionSchema = z.enum([
  'tenant_create',
  'tenant_update',
  'tenant_supported_locales_update',
  'tenant_suspend',
  'tenant_reactivate',
  'tenant_archive',
  'tenant_impersonation_started',
  'tenant_domain_created',
  'tenant_domain_updated',
  'tenant_domain_removed',
  'tenant_onboarding_step_updated',
  'tenant_onboarding_reset',
  'user_password_reset_triggered',
  'user_mfa_reset',
  'user_account_unlocked',
  'user_disabled',
  'user_enabled',
  'tenant_ownership_transferred',
  'module_toggled',
  'cache_flushed_tenant',
  'cache_flushed_global',
  'queue_paused',
  'queue_resumed',
  'queue_cleaned',
  'job_retried',
  'job_removed',
  'maintenance_mode_entered',
  'maintenance_mode_exited',
  'maintenance_window_scheduled',
  'maintenance_window_cancelled',
  'session_force_logged_out_user',
  'session_force_logged_out_tenant',
  'platform_user_invited',
  'platform_user_revoked',
  'platform_role_granted',
  'platform_role_revoked',
  'alert_acknowledged',
  'alert_resolved',
  'alert_silenced',
  'alert_rule_created',
  'alert_rule_updated',
  'alert_rule_disabled',
  'alert_rule_deleted',
  'platform_error_redaction_rule_created',
  'platform_error_redaction_rule_deleted',
  'platform_error_retention_purged',
  'two_person_request_initiated',
  'two_person_request_approved',
  'two_person_request_rejected',
  'ai_action_proposed',
  'ai_action_approved',
  'ai_action_executed',
  'ai_action_rejected',
]);

export type PlatformAuditActionDto = z.infer<typeof platformAuditActionSchema>;

export const platformAuditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  actor_user_id: z.string().uuid().optional(),
  action: platformAuditActionSchema.optional(),
  target_resource_type: z.string().trim().min(1).max(60).optional(),
  target_tenant_id: z.string().uuid().optional(),
  start_date: z.coerce.date().optional(),
  end_date: z.coerce.date().optional(),
});

export type PlatformAuditLogQuery = z.infer<typeof platformAuditLogQuerySchema>;

export const platformErrorLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  source: z.enum(['api', 'worker', 'web-ssr', 'web-csr', 'cron']).optional(),
  level: z.enum(['error', 'warn']).optional(),
  fingerprint: z.string().trim().min(1).max(64).optional(),
});

export type PlatformErrorLogQuery = z.infer<typeof platformErrorLogQuerySchema>;

export const createPlatformErrorRedactionRuleSchema = z.object({
  name: z.string().trim().min(1).max(100),
  pattern: z.string().trim().min(1).max(2000),
  pattern_flags: z
    .string()
    .trim()
    .regex(/^[dgimsuvy]*$/)
    .default('g'),
  replacement: z.string().trim().min(1).max(60).default('[REDACTED]'),
  severity: z.enum(['always', 'warn']).default('always'),
});

export type CreatePlatformErrorRedactionRuleDto = z.infer<
  typeof createPlatformErrorRedactionRuleSchema
>;

export const previewPlatformErrorRedactionRuleSchema =
  createPlatformErrorRedactionRuleSchema.extend({
    sample: z.string().max(5000).optional(),
  });

export type PreviewPlatformErrorRedactionRuleDto = z.infer<
  typeof previewPlatformErrorRedactionRuleSchema
>;

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
