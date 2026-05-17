import { z } from 'zod';

import { isModuleKey, type ModuleKey } from '../modules';

import { paginationQuerySchema } from './pagination.schema';

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

export const updatePlatformUserAccessSchema = z
  .object({
    is_active: z.boolean().optional(),
    role: platformRoleKeySchema.optional(),
    role_keys: z.array(platformRoleKeySchema).min(1).optional(),
  })
  .refine(
    (data) =>
      data.is_active !== undefined || data.role !== undefined || data.role_keys !== undefined,
    {
      message: 'At least one access field must be provided',
    },
  );

export type UpdatePlatformUserAccessDto = z.infer<typeof updatePlatformUserAccessSchema>;

// ─── Platform Global Search ─────────────────────────────────────────────────

export const platformGlobalSearchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
});

export type PlatformGlobalSearchQuery = z.infer<typeof platformGlobalSearchQuerySchema>;

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
  'alert_channel_created',
  'alert_channel_updated',
  'alert_channel_deleted',
  'alert_channel_tested',
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
  'ai_conversation_viewed',
  'synthetic_check_created',
  'synthetic_check_updated',
  'synthetic_check_deleted',
  'synthetic_check_run_now',
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
  tenant_id: z.string().uuid().optional(),
  platform_level: z.coerce.boolean().optional(),
  endpoint: z.string().trim().min(1).max(500).optional(),
  http_status: z.coerce.number().int().min(100).max(599).optional(),
  error_code: z.string().trim().min(1).max(100).optional(),
  message: z.string().trim().min(1).max(500).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type PlatformErrorLogQuery = z.infer<typeof platformErrorLogQuerySchema>;

// ─── Tenant Metrics ─────────────────────────────────────────────────────────

const moduleKeySchema = z.custom<ModuleKey>(
  (value): value is ModuleKey => typeof value === 'string' && isModuleKey(value),
);

export const tenantMetricsSnapshotSchema = z.object({
  students_count: z.number().int().min(0),
  staff_count: z.number().int().min(0),
  parents_count: z.number().int().min(0),
  active_users_24h: z.number().int().min(0),
  active_users_7d: z.number().int().min(0),
  invoices_total: z.number().int().min(0),
  invoices_overdue: z.number().int().min(0),
  attendance_rate_avg: z.number().min(0).max(100),
  api_requests_24h: z.number().int().min(0),
  errors_24h: z.number().int().min(0),
  storage_mb: z.number().min(0),
  enabled_modules: z.array(moduleKeySchema),
  disabled_modules: z.array(moduleKeySchema),
  last_login_at: z.string().datetime().nullable(),
});

export type TenantMetricsSnapshot = z.infer<typeof tenantMetricsSnapshotSchema>;

export const tenantMetricsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export type TenantMetricsQuery = z.infer<typeof tenantMetricsQuerySchema>;

export const tenantMetricsCompareQuerySchema = z.object({
  tenant_ids: z.preprocess((value) => {
    if (typeof value === 'string') {
      return value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return value;
  }, z.array(z.string().uuid()).min(2).max(10)),
  days: z.coerce.number().int().min(1).max(90).default(30),
});

export type TenantMetricsCompareQuery = z.infer<typeof tenantMetricsCompareQuerySchema>;

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

// ─── Platform Observability Context ─────────────────────────────────────────

export const platformDeployStatusSchema = z.enum([
  'in_progress',
  'succeeded',
  'failed',
  'rolled_back',
]);

export type PlatformDeployStatusDto = z.infer<typeof platformDeployStatusSchema>;

export const createPlatformDeployEventSchema = z.object({
  sha: z.string().trim().min(7).max(40),
  short_sha: z.string().trim().min(7).max(12),
  deploy_run_url: z.string().trim().url().max(500),
  deploy_run_id: z.string().trim().min(1).max(40),
  migration_version: z.string().trim().min(1).max(80).optional(),
  status: platformDeployStatusSchema,
  duration_seconds: z.coerce.number().int().min(0).optional(),
  rollback_of_id: z.string().uuid().optional(),
  commit_message: z.string().trim().max(2000).optional(),
  commit_author_email: z.string().trim().email().max(200).optional(),
  failure_reason: z.string().trim().max(4000).optional(),
});

export type CreatePlatformDeployEventDto = z.infer<typeof createPlatformDeployEventSchema>;

export const listPlatformDeployEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: platformDeployStatusSchema.optional(),
});

export type ListPlatformDeployEventsQuery = z.infer<typeof listPlatformDeployEventsQuerySchema>;

export const platformRunbookQuerySchema = z.object({
  component: z.string().trim().min(1).max(80).optional(),
  severity: z.string().trim().min(1).max(20).optional(),
  alert_key: z.string().trim().min(1).max(120).optional(),
  tag: z.string().trim().min(1).max(80).optional(),
});

export type PlatformRunbookQuery = z.infer<typeof platformRunbookQuerySchema>;

export const platformTopologyQuerySchema = z.object({
  kind: z.string().trim().min(1).max(40).optional(),
  component: z.string().trim().min(1).max(60).optional(),
  queue: z.string().trim().min(1).max(80).optional(),
  module_key: z.string().trim().min(1).max(80).optional(),
});

export type PlatformTopologyQuery = z.infer<typeof platformTopologyQuerySchema>;

export const platformSeverityPolicyQuerySchema = z.object({
  component: z.string().trim().min(1).max(60).optional(),
  severity: z.enum(['info', 'warning', 'critical']).optional(),
  product_area: z.string().trim().min(1).max(120).optional(),
});

export type PlatformSeverityPolicyQuery = z.infer<typeof platformSeverityPolicyQuerySchema>;

// ─── Platform AI Copilot ────────────────────────────────────────────────────

export const platformAiConversationTypeSchema = z.enum([
  'diagnostic',
  'recommendation',
  'postmortem',
]);

export type PlatformAiConversationTypeDto = z.infer<typeof platformAiConversationTypeSchema>;

export const platformCopilotEvidenceContextKindSchema = z.enum([
  'alert',
  'correlation',
  'deploy',
  'error',
  'health',
  'incident',
  'queue',
  'tenant',
]);

export type PlatformCopilotEvidenceContextKind = z.infer<
  typeof platformCopilotEvidenceContextKindSchema
>;

export const platformCopilotEvidenceContextSchema = z.object({
  kind: platformCopilotEvidenceContextKindSchema,
  id: z.string().trim().min(1).max(255),
});

export type PlatformCopilotEvidenceContext = z.infer<typeof platformCopilotEvidenceContextSchema>;

export const startPlatformCopilotConversationSchema = z.object({
  type: platformAiConversationTypeSchema.default('diagnostic'),
  context: platformCopilotEvidenceContextSchema.optional(),
});

export type StartPlatformCopilotConversationDto = z.infer<
  typeof startPlatformCopilotConversationSchema
>;

export const sendPlatformCopilotMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
  context: platformCopilotEvidenceContextSchema.optional(),
});

export type SendPlatformCopilotMessageDto = z.infer<typeof sendPlatformCopilotMessageSchema>;

export const listPlatformCopilotConversationsQuerySchema = z.object({
  operator_id: z.string().uuid().optional(),
});

export type ListPlatformCopilotConversationsQuery = z.infer<
  typeof listPlatformCopilotConversationsQuerySchema
>;

export const platformAiRecommendationCategorySchema = z.enum([
  'noise_reduction',
  'known_fix',
  'config_drift',
  'deploy_regression',
  'capacity',
  'cost',
  'security',
  'hygiene',
]);

export type PlatformAiRecommendationCategoryDto = z.infer<
  typeof platformAiRecommendationCategorySchema
>;

export const platformAiRecommendationStatusSchema = z.enum([
  'active',
  'resolved',
  'dismissed',
  'expired',
  'superseded',
]);

export type PlatformAiRecommendationStatusDto = z.infer<
  typeof platformAiRecommendationStatusSchema
>;

export const platformAiRecommendationTriggerSchema = z.enum([
  'copilot_question',
  'explain_page',
  'recommendation_button',
  'daily_brief',
]);

export type PlatformAiRecommendationTriggerDto = z.infer<
  typeof platformAiRecommendationTriggerSchema
>;

export const generatePlatformRecommendationSchema = z.object({
  category: platformAiRecommendationCategorySchema.optional(),
  context: platformCopilotEvidenceContextSchema.optional(),
  trigger_source: platformAiRecommendationTriggerSchema.default('recommendation_button'),
});

export type GeneratePlatformRecommendationDto = z.infer<
  typeof generatePlatformRecommendationSchema
>;

export const listPlatformRecommendationsQuerySchema = z.object({
  category: platformAiRecommendationCategorySchema.optional(),
  status: platformAiRecommendationStatusSchema.default('active'),
  target_tenant_id: z.string().uuid().optional(),
});

export type ListPlatformRecommendationsQuery = z.infer<
  typeof listPlatformRecommendationsQuerySchema
>;

export const resolvePlatformRecommendationSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
});

export type ResolvePlatformRecommendationDto = z.infer<typeof resolvePlatformRecommendationSchema>;

export const generatePlatformDailyBriefSchema = z.object({
  since_hours: z.coerce.number().int().min(1).max(168).default(24),
});

export type GeneratePlatformDailyBriefDto = z.infer<typeof generatePlatformDailyBriefSchema>;

export const platformAiActionKindSchema = z.enum([
  'acknowledge_alert',
  'clean_queue',
  'flush_global_cache',
  'flush_tenant_cache',
  'generate_repo_agent_handoff',
  'manual_only',
  'open_github_issue',
  'retry_jobs',
  'run_sentry_triage',
  'schedule_maintenance',
  'silence_alert',
]);

export type PlatformAiActionKindDto = z.infer<typeof platformAiActionKindSchema>;

export const platformAiActionProposalStatusSchema = z.enum([
  'awaiting_approval',
  'approved',
  'rejected',
  'executing',
  'executed',
  'failed',
  'expired',
]);

export type PlatformAiActionProposalStatusDto = z.infer<
  typeof platformAiActionProposalStatusSchema
>;

export const createPlatformAiActionProposalSchema = z.object({
  recommendation_id: z.string().uuid().optional(),
  action_kind: platformAiActionKindSchema.optional(),
  reasoning: z.string().trim().min(1).max(4000).optional(),
});

export type CreatePlatformAiActionProposalDto = z.infer<
  typeof createPlatformAiActionProposalSchema
>;

export const listPlatformAiActionProposalsQuerySchema = z.object({
  status: platformAiActionProposalStatusSchema.default('awaiting_approval'),
  recommendation_id: z.string().uuid().optional(),
  target_tenant_id: z.string().uuid().optional(),
});

export type ListPlatformAiActionProposalsQuery = z.infer<
  typeof listPlatformAiActionProposalsQuerySchema
>;

export const approvePlatformAiActionProposalSchema = z.object({
  reason: z.string().trim().min(12).max(4000).optional(),
  owner_confirmation: z
    .object({
      confirmation_phrase: z.string().trim().min(1).max(200),
      typed_confirmation: z.string().trim().min(1).max(200),
      reason: z.string().trim().min(12).max(4000),
    })
    .optional(),
});

export type ApprovePlatformAiActionProposalDto = z.infer<
  typeof approvePlatformAiActionProposalSchema
>;

export const rejectPlatformAiActionProposalSchema = z.object({
  reason: z.string().trim().min(12).max(4000),
});

export type RejectPlatformAiActionProposalDto = z.infer<
  typeof rejectPlatformAiActionProposalSchema
>;

export const createPlatformAgentHandoffSchema = z.object({
  recommendation_id: z.string().uuid(),
  incident_id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  summary: z.string().trim().min(1).max(4000).optional(),
  hypothesis: z.string().trim().min(1).max(4000).optional(),
});

export type CreatePlatformAgentHandoffDto = z.infer<typeof createPlatformAgentHandoffSchema>;

// ─── Platform Incidents + Postmortems ───────────────────────────────────────

export const platformIncidentSeveritySchema = z.enum(['warning', 'critical']);

export type PlatformIncidentSeverityDto = z.infer<typeof platformIncidentSeveritySchema>;

export const platformIncidentStatusSchema = z.enum([
  'active',
  'monitoring',
  'resolved',
  'cancelled',
]);

export type PlatformIncidentStatusDto = z.infer<typeof platformIncidentStatusSchema>;

export const listPlatformIncidentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: platformIncidentStatusSchema.optional(),
  severity: platformIncidentSeveritySchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type ListPlatformIncidentsQuery = z.infer<typeof listPlatformIncidentsQuerySchema>;

export const updatePlatformIncidentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  status: platformIncidentStatusSchema.optional(),
  affected_tenants: z.array(z.string().uuid()).max(50).optional(),
  affected_components: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
});

export type UpdatePlatformIncidentDto = z.infer<typeof updatePlatformIncidentSchema>;

export const savePlatformIncidentPostmortemSchema = z.object({
  postmortem_final: z.string().trim().min(1).max(60_000),
});

export type SavePlatformIncidentPostmortemDto = z.infer<
  typeof savePlatformIncidentPostmortemSchema
>;

export const createPlatformIncidentTimelineEventSchema = z.object({
  description: z.string().trim().min(1).max(4000),
});

export type CreatePlatformIncidentTimelineEventDto = z.infer<
  typeof createPlatformIncidentTimelineEventSchema
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

export const PLATFORM_QUEUE_NAMES = [
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

export const PLATFORM_ALERT_QUEUE_NAMES = PLATFORM_QUEUE_NAMES;

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

// ─── Platform Alert Channels ────────────────────────────────────────────────

export const ALERT_CHANNEL_TYPES = ['email', 'telegram', 'whatsapp', 'push'] as const;

export const alertChannelTypeSchema = z.enum(ALERT_CHANNEL_TYPES);

export type AlertChannelTypeDto = z.infer<typeof alertChannelTypeSchema>;

export const emailAlertChannelConfigSchema = z.object({
  recipients: z.array(z.string().trim().email()).min(1).max(10),
});

export type EmailAlertChannelConfig = z.infer<typeof emailAlertChannelConfigSchema>;

export const telegramAlertChannelConfigSchema = z.object({
  bot_token: z.string().trim().min(1),
  chat_id: z.string().trim().min(1).max(255),
});

export type TelegramAlertChannelConfig = z.infer<typeof telegramAlertChannelConfigSchema>;

export const whatsappAlertChannelConfigSchema = z.object({
  to_number: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, 'Must be E.164 format'),
});

export type WhatsAppAlertChannelConfig = z.infer<typeof whatsappAlertChannelConfigSchema>;

export const pushAlertChannelConfigSchema = z.object({
  endpoint: z.string().trim().url(),
  keys: z.object({
    p256dh: z.string().trim().min(1),
    auth: z.string().trim().min(1),
  }),
});

export type PushAlertChannelConfig = z.infer<typeof pushAlertChannelConfigSchema>;

export const createAlertChannelSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    name: z.string().trim().min(1).max(255),
    config: emailAlertChannelConfigSchema,
    is_enabled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('telegram'),
    name: z.string().trim().min(1).max(255),
    config: telegramAlertChannelConfigSchema,
    is_enabled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('whatsapp'),
    name: z.string().trim().min(1).max(255),
    config: whatsappAlertChannelConfigSchema,
    is_enabled: z.boolean().default(true),
  }),
  z.object({
    type: z.literal('push'),
    name: z.string().trim().min(1).max(255),
    config: pushAlertChannelConfigSchema,
    is_enabled: z.boolean().default(true),
  }),
]);

export type CreateAlertChannelDto = z.infer<typeof createAlertChannelSchema>;

export const updateAlertChannelSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  config: z.record(z.unknown()).optional(),
  is_enabled: z.boolean().optional(),
});

export type UpdateAlertChannelDto = z.infer<typeof updateAlertChannelSchema>;

export const alertHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: alertStatusSchema.optional(),
  severity: alertSeveritySchema.optional(),
  rule_id: z.string().uuid().optional(),
});

export type AlertHistoryQuery = z.infer<typeof alertHistoryQuerySchema>;

// ─── Queue Management ────────────────────────────────────────────────────────

export const JOB_STATUSES = [
  'waiting',
  'active',
  'completed',
  'failed',
  'delayed',
  'paused',
] as const;

export type QueueJobStatusDto = (typeof JOB_STATUSES)[number];

export const listQueueJobsQuerySchema = paginationQuerySchema.extend({
  status: z.enum(JOB_STATUSES).optional(),
});

export type ListQueueJobsQuery = z.infer<typeof listQueueJobsQuerySchema>;

export const cleanQueueSchema = z.object({
  status: z.enum(['completed', 'failed']),
  grace_ms: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(1000).default(1000),
});

export type CleanQueueDto = z.infer<typeof cleanQueueSchema>;

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

// ─── Platform Synthetic Monitoring ──────────────────────────────────────────

export const syntheticCheckKindSchema = z.enum([
  'http_get',
  'http_post',
  'websocket_handshake',
  'queue_canary',
  'notification_self_test',
  'dns_lookup',
  'tls_check',
  'external_dependency_status',
]);

export type SyntheticCheckKindDto = z.infer<typeof syntheticCheckKindSchema>;

export const syntheticCheckResultStatusSchema = z.enum([
  'passed',
  'degraded',
  'failed',
  'error',
  'skipped_maintenance',
]);

export type SyntheticCheckResultStatusDto = z.infer<typeof syntheticCheckResultStatusSchema>;

const secretLikePatterns = [
  /~\/\.codex/i,
  /\/\.codex\//i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bsk_(live|test)_[A-Za-z0-9]{24,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/,
  /\bAC[a-f0-9]{32}\b/i,
];

function assertNoRawSecrets(value: unknown, ctx: z.RefinementCtx, path: Array<string | number>) {
  if (typeof value === 'string') {
    if (secretLikePatterns.some((pattern) => pattern.test(value))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Synthetic check definitions must reference env keys, not raw secrets or ~/.codex paths',
        path,
      });
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertNoRawSecrets(entry, ctx, [...path, index]));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      assertNoRawSecrets(entry, ctx, [...path, key]);
    }
  }
}

const envReferenceSchema = z.object({
  env: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Z0-9_]+$/, 'Env credential keys must be uppercase env var names'),
});

export const httpSyntheticTargetSchema = z.object({
  url: z.string().trim().url().max(1000),
  headers: z.record(z.string()).optional(),
  headers_env: z.record(z.string().regex(/^[A-Z0-9_]+$/)).optional(),
  body: z
    .record(z.union([z.string(), z.number(), z.boolean(), z.null(), envReferenceSchema]))
    .optional(),
});

export const websocketSyntheticTargetSchema = z.object({
  url: z.string().trim().url().max(1000),
  auth_env: z.record(z.string().regex(/^[A-Z0-9_]+$/)).optional(),
  welcome_event: z.string().trim().max(120).optional(),
});

export const queueSyntheticTargetSchema = z.discriminatedUnion('queue_kind', [
  z.object({ queue_kind: z.literal('synthetic_canary') }),
  z.object({
    queue_kind: z.literal('critical_queue_canary'),
    queue_name: z.enum(['notifications', 'behaviour', 'finance', 'payroll', 'pastoral']),
  }),
]);

export const notificationSyntheticTargetSchema = z.object({
  channel: z.enum(['resend', 'twilio_sms', 'twilio_whatsapp', 'telegram']),
  sink_env: z
    .string()
    .trim()
    .regex(/^[A-Z0-9_]+$/),
});

export const dnsSyntheticTargetSchema = z.object({
  hostname: z.string().trim().min(1).max(255),
  record_type: z.enum(['A', 'AAAA', 'CNAME', 'MX', 'TXT']).default('A'),
});

export const tlsSyntheticTargetSchema = z.object({
  hostname: z.string().trim().min(1).max(255),
  port: z.coerce.number().int().min(1).max(65535).default(443),
});

export const externalDependencySyntheticTargetSchema = z.object({
  provider_key: z.string().trim().min(1).max(60),
  display_name: z.string().trim().min(1).max(160),
  source: z.enum(['status_page', 'health_endpoint']),
  url: z.string().trim().url().max(500),
});

export const syntheticCheckTargetSchema = z.union([
  httpSyntheticTargetSchema,
  websocketSyntheticTargetSchema,
  queueSyntheticTargetSchema,
  notificationSyntheticTargetSchema,
  dnsSyntheticTargetSchema,
  tlsSyntheticTargetSchema,
  externalDependencySyntheticTargetSchema,
]);

export const syntheticCheckExpectedSchema = z
  .object({
    status_codes: z.array(z.coerce.number().int().min(100).max(599)).min(1).max(20).optional(),
    max_latency_ms: z.coerce.number().int().min(1).max(120_000).optional(),
    body_regex: z.string().trim().min(1).max(500).optional(),
    logout_url: z.string().trim().url().max(1000).optional(),
    record_count_min: z.coerce.number().int().min(0).max(1000).optional(),
    warning_days: z.coerce.number().int().min(1).max(3650).optional(),
    critical_days: z.coerce.number().int().min(0).max(3650).optional(),
    operational_indicators: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
  })
  .passthrough();

export const syntheticCheckListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  kind: syntheticCheckKindSchema.optional(),
  status: syntheticCheckResultStatusSchema.optional(),
  related_component: z.string().trim().min(1).max(60).optional(),
});

export type SyntheticCheckListQuery = z.infer<typeof syntheticCheckListQuerySchema>;

export const syntheticCheckResultsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: syntheticCheckResultStatusSchema.optional(),
});

export type SyntheticCheckResultsQuery = z.infer<typeof syntheticCheckResultsQuerySchema>;

const syntheticDefinitionBaseObject = z.object({
  key: z
    .string()
    .trim()
    .min(2)
    .max(120)
    .regex(/^[a-z0-9._:-]+$/),
  display_name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(4000).optional(),
  kind: syntheticCheckKindSchema,
  target: z.unknown(),
  schedule_cron: z.string().trim().min(9).max(80),
  timeout_ms: z.coerce.number().int().min(100).max(120_000).default(15_000),
  expected: syntheticCheckExpectedSchema.default({}),
  consecutive_failure_threshold_critical: z.coerce.number().int().min(1).max(20).default(3),
  retry_attempts: z.coerce.number().int().min(1).max(5).default(1),
  related_component: z.string().trim().min(1).max(60).optional(),
  related_tenant_id: z.string().uuid().optional(),
  enabled: z.boolean().default(true),
});

function validateSyntheticDefinitionTarget(
  value: { kind?: SyntheticCheckKindDto; target?: unknown; expected?: unknown },
  ctx: z.RefinementCtx,
) {
  assertNoRawSecrets(value.target, ctx, ['target']);
  assertNoRawSecrets(value.expected, ctx, ['expected']);
  if (!value.kind || value.target === undefined) return;
  const targetByKind: Record<SyntheticCheckKindDto, z.ZodTypeAny> = {
    dns_lookup: dnsSyntheticTargetSchema,
    external_dependency_status: externalDependencySyntheticTargetSchema,
    http_get: httpSyntheticTargetSchema.omit({ body: true }),
    http_post: httpSyntheticTargetSchema,
    notification_self_test: notificationSyntheticTargetSchema,
    queue_canary: queueSyntheticTargetSchema,
    tls_check: tlsSyntheticTargetSchema,
    websocket_handshake: websocketSyntheticTargetSchema,
  };
  const parsed = targetByKind[value.kind].safeParse(value.target);
  if (!parsed.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Target does not match the selected synthetic check kind',
      path: ['target'],
    });
  }
}

const syntheticDefinitionBaseSchema = syntheticDefinitionBaseObject.superRefine(
  validateSyntheticDefinitionTarget,
);

export const createSyntheticCheckDefinitionSchema = syntheticDefinitionBaseSchema;

export type CreateSyntheticCheckDefinitionDto = z.infer<
  typeof createSyntheticCheckDefinitionSchema
>;

export const updateSyntheticCheckDefinitionSchema = syntheticDefinitionBaseObject
  .partial()
  .superRefine(validateSyntheticDefinitionTarget);

export type UpdateSyntheticCheckDefinitionDto = z.infer<
  typeof updateSyntheticCheckDefinitionSchema
>;

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
