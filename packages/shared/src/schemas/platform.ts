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

export const ALERT_OPERATORS = ['gt', 'lt', 'eq', 'gte', 'lte'] as const;

export const ALERT_METRICS = [
  'health_status',
  'queue_depth',
  'queue_failure_rate',
  'error_rate_5m',
  'stuck_jobs',
  'disk_usage_percent',
  'api_latency_p95',
] as const;

export const ALERT_SEVERITIES = ['info', 'warning', 'critical'] as const;

export const PLATFORM_ALERT_QUEUE_NAMES = [
  'admissions',
  'approvals',
  'attendance',
  'audit-log',
  'behaviour',
  'budgeting',
  'compliance',
  'early-warning',
  'engagement',
  'finance',
  'gradebook',
  'homework',
  'imports',
  'notifications',
  'pastoral',
  'payroll',
  'pdf-rendering',
  'regulatory',
  'reports',
  'safeguarding',
  'scheduling',
  'exam-scheduling',
  'search-sync',
  'security',
  'wellbeing',
] as const;

const legacyAlertMetricSchema = z.enum([
  'component_latency',
  'component_status',
  'disk_free_gb',
  'bullmq_stuck_jobs',
]);

export const alertConditionConfigSchema = z
  .object({
    operator: z.enum(ALERT_OPERATORS),
    threshold: z.coerce.number(),
    duration_minutes: z.coerce.number().int().min(0).max(1440).optional(),
    component: alertComponentSchema.optional(),
    queue: z.enum(PLATFORM_ALERT_QUEUE_NAMES).optional(),
    tenant_id: z.string().uuid().optional(),
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

export const alertMetricSchema = z.union([z.enum(ALERT_METRICS), legacyAlertMetricSchema]);

export const alertSeveritySchema = z.enum(ALERT_SEVERITIES);

export const alertStatusSchema = z.enum(['fired', 'acknowledged', 'resolved']);

const alertRuleBaseSchema = z.object({
  name: z.string().trim().min(1).max(255),
  metric: alertMetricSchema,
  condition_config: alertConditionConfigSchema,
  severity: alertSeveritySchema.default('warning'),
  cooldown_minutes: z.coerce.number().int().min(1).max(1440).default(15),
  is_enabled: z.boolean().default(true),
  is_security_critical: z.boolean().default(false),
  notify_emails: z.array(z.string().trim().email()).default([]),
  channel_ids: z.array(z.string().uuid()).default([]),
});

function validateAlertRuleCondition(
  value: {
    metric?: z.infer<typeof alertMetricSchema>;
    condition_config?: AlertConditionConfig;
  },
  ctx: z.RefinementCtx,
) {
  if (!value.metric || !value.condition_config) {
    return;
  }

  if (
    (value.metric === 'queue_depth' || value.metric === 'queue_failure_rate') &&
    !value.condition_config.queue
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Queue metrics require a queue name in condition_config',
      path: ['condition_config', 'queue'],
    });
  }

  if (value.metric === 'health_status' && !value.condition_config.component) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Health status metric requires a component in condition_config',
      path: ['condition_config', 'component'],
    });
  }

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

export const createAlertRuleSchema = alertRuleBaseSchema.superRefine((value, ctx) => {
  validateAlertRuleCondition(value, ctx);
});

export type CreateAlertRuleDto = z.infer<typeof createAlertRuleSchema>;

export const updateAlertRuleSchema = alertRuleBaseSchema.partial().superRefine((value, ctx) => {
  validateAlertRuleCondition(value, ctx);
});

export type UpdateAlertRuleDto = z.infer<typeof updateAlertRuleSchema>;

export const toggleAlertRuleSchema = z.object({
  is_enabled: z.boolean(),
});

export type ToggleAlertRuleDto = z.infer<typeof toggleAlertRuleSchema>;

export const alertHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: alertStatusSchema.optional(),
  severity: alertSeveritySchema.optional(),
  rule_id: z.string().uuid().optional(),
});

export type AlertHistoryQuery = z.infer<typeof alertHistoryQuerySchema>;

// ─── Owner Confirmation + Alert Silencing ───────────────────────────────────

export const ownerActionConfirmationSchema = z.object({
  action: platformAuditActionSchema,
  target_resource_type: z.string().trim().min(1).max(60),
  target_resource_id: z.string().trim().min(1).max(255).optional(),
  target_tenant_id: z.string().uuid().optional(),
  payload: z.unknown().default({}),
  confirmation_phrase: z.string().trim().min(1).max(200),
  typed_confirmation: z.string().trim().min(1).max(200),
  reason: z.string().trim().min(12).max(4000),
});

export type OwnerActionConfirmationDto = z.infer<typeof ownerActionConfirmationSchema>;

export const ownerActionConfirmationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type OwnerActionConfirmationQuery = z.infer<typeof ownerActionConfirmationQuerySchema>;

export const alertSilenceScopeSchema = z.enum(['single_rule', 'component', 'global']);

export type AlertSilenceScopeDto = z.infer<typeof alertSilenceScopeSchema>;

export const createAlertSilenceSchema = z
  .object({
    scope: alertSilenceScopeSchema,
    alert_rule_id: z.string().uuid().optional(),
    component: alertComponentSchema.optional(),
    reason: z.string().trim().min(12).max(4000),
    starts_at: z.coerce.date().optional(),
    ends_at: z.coerce.date(),
  })
  .superRefine((value, ctx) => {
    const startsAt = value.starts_at ?? new Date();
    if (value.ends_at <= startsAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End time must be after start time',
        path: ['ends_at'],
      });
    }
    if (value.scope === 'single_rule' && !value.alert_rule_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Alert rule is required for single-rule silences',
        path: ['alert_rule_id'],
      });
    }
    if (value.scope === 'component' && !value.component) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Component is required for component silences',
        path: ['component'],
      });
    }
    if (value.scope === 'global' && (value.alert_rule_id || value.component)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Global silences cannot target a rule or component',
        path: ['scope'],
      });
    }
  });

export type CreateAlertSilenceDto = z.infer<typeof createAlertSilenceSchema>;

export const removeAlertSilenceSchema = z.object({
  reason: z.string().trim().min(12).max(4000),
});

export type RemoveAlertSilenceDto = z.infer<typeof removeAlertSilenceSchema>;

export const alertSilenceQuerySchema = z.object({
  include_expired: z.coerce.boolean().default(false),
});

export type AlertSilenceQuery = z.infer<typeof alertSilenceQuerySchema>;

export const createAlertMaintenanceWindowSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(4000).optional(),
    starts_at: z.coerce.date(),
    ends_at: z.coerce.date(),
  })
  .superRefine((value, ctx) => {
    if (value.ends_at <= value.starts_at) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'End time must be after start time',
        path: ['ends_at'],
      });
    }
  });

export type CreateAlertMaintenanceWindowDto = z.infer<typeof createAlertMaintenanceWindowSchema>;

export const cancelAlertMaintenanceWindowSchema = z.object({
  reason: z.string().trim().min(12).max(4000),
});

export type CancelAlertMaintenanceWindowDto = z.infer<typeof cancelAlertMaintenanceWindowSchema>;

export const alertMaintenanceWindowQuerySchema = z.object({
  include_past: z.coerce.boolean().default(false),
});

export type AlertMaintenanceWindowQuery = z.infer<typeof alertMaintenanceWindowQuerySchema>;

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
