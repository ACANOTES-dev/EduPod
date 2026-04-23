/**
 * Shared types and Zod schemas for the wellbeing rebuild.
 * Consumed by the API, worker, and web layers via the `@school/shared/wellbeing`
 * subpath export.
 *
 * Surface:
 *   - TenantAiFlag: per-(tenant, module) AI feature gate
 *   - WellbeingChannelPreferences: per-event notification channel overrides
 *   - WELLBEING_AI_MODULE_KEYS: canonical module-key list used everywhere
 */
import { z } from 'zod';

// ─── Module keys ────────────────────────────────────────────────────────────

/** Modules gated by the per-module AI flag. */
export const WELLBEING_AI_MODULE_KEYS = [
  'behaviour',
  'pastoral',
  'staff_wellbeing',
  'early_warning',
] as const;

export type WellbeingAiModuleKey = (typeof WELLBEING_AI_MODULE_KEYS)[number];

export const wellbeingAiModuleKeySchema = z.enum(WELLBEING_AI_MODULE_KEYS);

// ─── TenantAiFlag ───────────────────────────────────────────────────────────

export const tenantAiFlagSchema = z.object({
  id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  module_key: wellbeingAiModuleKeySchema,
  enabled: z.boolean(),
  updated_at: z.string().datetime(),
  updated_by: z.string().uuid().nullable(),
});
export type TenantAiFlag = z.infer<typeof tenantAiFlagSchema>;

/** Input shape for updating a single AI flag. */
export const updateTenantAiFlagSchema = z.object({
  module_key: wellbeingAiModuleKeySchema,
  enabled: z.boolean(),
});
export type UpdateTenantAiFlagDto = z.infer<typeof updateTenantAiFlagSchema>;

// ─── WellbeingChannelPreferences ────────────────────────────────────────────

export const wellbeingChannelToggleSchema = z.object({
  email: z.boolean().optional(),
  sms: z.boolean().optional(),
  whatsapp: z.boolean().optional(),
});

/**
 * Shape of the `tenant_notification_preferences.wellbeing_channels` JSONB
 * column. In-app delivery is always on and lives outside this structure.
 */
export const wellbeingChannelPreferencesSchema = z.object({
  defaults: z.object({
    email: z.boolean(),
    sms: z.boolean(),
    whatsapp: z.boolean(),
  }),
  overrides: z.record(z.string().min(1), wellbeingChannelToggleSchema),
});
export type WellbeingChannelPreferences = z.infer<typeof wellbeingChannelPreferencesSchema>;

/**
 * Input schema for updating the per-tenant wellbeing channel preferences.
 * Mirrors the persisted shape so the controller can `.parse` the body
 * directly.
 */
export const updateWellbeingChannelPreferencesSchema = wellbeingChannelPreferencesSchema;
export type UpdateWellbeingChannelPreferencesDto = z.infer<
  typeof updateWellbeingChannelPreferencesSchema
>;

/**
 * Canonical list of wellbeing event keys used under `overrides`. Consumers
 * import this to avoid typos when wiring up per-event channel overrides.
 * Extending the list is safe; removing an entry requires a data migration.
 *
 * Mirrored exactly by the backend constant
 * `apps/api/src/modules/wellbeing-notifications/events/wellbeing-event-keys.ts`.
 */
export const WELLBEING_NOTIFICATION_EVENT_KEYS = [
  // Behaviour
  'incident.logged',
  'incident.escalated',
  'incident.parent_meeting_scheduled',
  'sanction.scheduled',
  'sanction.served',
  'sanction.no_show',
  'recognition.awarded',
  'amendment.sent',
  'document.sent_to_parent',
  // Pastoral & SST
  'concern.raised',
  'concern.acknowledged',
  // Safeguarding
  'sla.breach',
  'critical.declared',
  'critical.acknowledged',
  'break_glass.granted',
  'break_glass.expired',
  // Behaviour appeal lifecycle
  'appeal.submitted',
  'appeal.decided',
  // Parent acknowledgement reminders
  'reminder.acknowledgement',
] as const;

export type WellbeingNotificationEventKey = (typeof WELLBEING_NOTIFICATION_EVENT_KEYS)[number];

export const wellbeingNotificationEventKeySchema = z.enum(WELLBEING_NOTIFICATION_EVENT_KEYS);

/** Severity badge applied to in-app rows and surfaced in the UI. */
export const WELLBEING_DISPATCH_SEVERITIES = ['info', 'warning', 'critical'] as const;
export type WellbeingDispatchSeverity = (typeof WELLBEING_DISPATCH_SEVERITIES)[number];

export const wellbeingDispatchSeveritySchema = z.enum(WELLBEING_DISPATCH_SEVERITIES);

// ─── Wellbeing dashboard summary (super-hub aggregator) ─────────────────────

/**
 * Payload shape for `GET /api/v1/wellbeing/dashboard-summary`. Consumed by
 * the `/wellbeing` super-hub to render the KPI strip, pending-attention
 * banner, hub-tile counters, and the recent-activity feed.
 */
export const wellbeingDashboardSummarySchema = z.object({
  kpis: z.object({
    students_at_risk: z.object({
      amber: z.number().int().nonnegative(),
      red: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
    open_incidents: z.object({
      total: z.number().int().nonnegative(),
      positive: z.number().int().nonnegative(),
      negative: z.number().int().nonnegative(),
    }),
    open_pastoral_cases: z.number().int().nonnegative(),
    overdue_actions: z.object({
      sanctions: z.number().int().nonnegative(),
      tasks: z.number().int().nonnegative(),
      sla_breaches: z.number().int().nonnegative(),
      total: z.number().int().nonnegative(),
    }),
  }),
  pending_attention: z.array(
    z.object({
      kind: z.enum([
        'sla_breach',
        'overdue_intervention',
        'unack_critical',
        'pending_appeal',
        'awaiting_parent_meeting',
      ]),
      severity: z.enum(['critical', 'high', 'medium']),
      title: z.string(),
      detail: z.string(),
      href: z.string(),
      due_at: z.string().datetime().optional(),
      count: z.number().int().nonnegative().optional(),
    }),
  ),
  hub_counts: z.object({
    behaviour: z.number().int().nonnegative(),
    pastoral: z.number().int().nonnegative(),
    safeguarding: z.number().int().nonnegative(),
    sen: z.number().int().nonnegative(),
    early_warnings: z.number().int().nonnegative(),
    staff_wellbeing: z.number().int().nonnegative(),
  }),
  recent_activity: z.array(
    z.object({
      id: z.string(),
      kind: z.enum([
        'incident',
        'concern',
        'acknowledgement',
        'escalation',
        'sanction_served',
        'recognition',
      ]),
      title: z.string(),
      actor_name: z.string().nullable(),
      occurred_at: z.string().datetime(),
      href: z.string(),
    }),
  ),
});

export type WellbeingDashboardSummary = z.infer<typeof wellbeingDashboardSummarySchema>;
