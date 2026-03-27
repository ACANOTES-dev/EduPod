import { z } from 'zod';

import {
  DEFAULT_CONCERN_CATEGORIES,
  DEFAULT_FLAGGED_KEYWORDS,
  DEFAULT_INTERVENTION_TYPES,
} from '../enums';

// ─── Concern Category Config ───────────────────────────────────────────────

export const concernCategoryConfigSchema = z.object({
  key: z.string(),
  label: z.string(),
  auto_tier: z.number().min(1).max(3).optional(),
  active: z.boolean().default(true),
});

export type ConcernCategoryConfig = z.infer<typeof concernCategoryConfigSchema>;

// ─── Intervention Type Config ──────────────────────────────────────────────

export const interventionTypeConfigSchema = z.object({
  key: z.string(),
  label: z.string(),
  active: z.boolean().default(true),
});

export type InterventionTypeConfig = z.infer<typeof interventionTypeConfigSchema>;

// ─── Notification Recipients Config ────────────────────────────────────────

export const notificationRecipientsConfigSchema = z.object({
  urgent: z.array(z.string().uuid()).default([]),
  critical: z.array(z.string().uuid()).default([]),
});

export type NotificationRecipientsConfig = z.infer<typeof notificationRecipientsConfigSchema>;

// ─── Escalation Config ─────────────────────────────────────────────────────

export const escalationConfigSchema = z.object({
  urgent_timeout_minutes: z.number().min(15).default(120),
  critical_timeout_minutes: z.number().min(5).default(30),
});

export type EscalationConfig = z.infer<typeof escalationConfigSchema>;

// ─── Checkin Config ────────────────────────────────────────────────────────

export const checkinConfigSchema = z.object({
  enabled: z.boolean().default(false),
  frequency: z.enum(['daily', 'weekly']).default('weekly'),
  monitoring_owner_user_ids: z.array(z.string().uuid()).default([]),
  monitoring_hours_start: z.string().default('08:00'),
  monitoring_hours_end: z.string().default('16:00'),
  monitoring_days: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
  flagged_keywords: z.array(z.string()).default([...DEFAULT_FLAGGED_KEYWORDS]),
  consecutive_low_threshold: z.number().min(2).default(3),
  min_cohort_for_aggregate: z.number().min(5).default(10),
  prerequisites_acknowledged: z.boolean().default(false),
});

export type CheckinConfig = z.infer<typeof checkinConfigSchema>;

// ─── SST Config ────────────────────────────────────────────────────────────

export const sstConfigSchema = z.object({
  meeting_frequency: z.enum(['weekly', 'fortnightly', 'monthly']).default('fortnightly'),
  auto_agenda_sources: z.array(z.enum([
    'new_concerns', 'case_reviews', 'overdue_actions', 'early_warning', 'neps', 'intervention_reviews',
  ])).default(['new_concerns', 'case_reviews', 'overdue_actions', 'intervention_reviews']),
  precompute_minutes_before: z.number().min(5).default(30),
});

export type SstConfig = z.infer<typeof sstConfigSchema>;

// ─── Response Plan Template Item Config ────────────────────────────────────

export const responsePlanTemplateItemSchema = z.object({
  label: z.string(),
  description: z.string().optional(),
  default_assignee_role: z.string().optional(),
});

export type ResponsePlanTemplateItem = z.infer<typeof responsePlanTemplateItemSchema>;

// ─── Critical Incident Response Plan Template ─────────────────────────────

export const criticalIncidentResponsePlanTemplateSchema = z.object({
  immediate: z.array(responsePlanTemplateItemSchema).default([
    { label: 'Convene Critical Incident Management Team' },
    { label: 'Gather and verify facts' },
    { label: 'Contact bereaved/affected family' },
    { label: 'Designate staff room and support room' },
    { label: 'Prepare statement for staff briefing' },
    { label: 'Brief all staff before school starts' },
    { label: 'Identify high-risk students' },
    { label: 'Assign staff to support identified students' },
    { label: 'Contact NEPS for support' },
    { label: 'Prepare parent notification' },
  ]),
  short_term: z.array(responsePlanTemplateItemSchema).default([
    { label: 'Daily CI Management Team briefing' },
    { label: 'Monitor affected students' },
    { label: 'Arrange external counselling support' },
    { label: 'Coordinate media response (if applicable)' },
    { label: 'Follow up with bereaved/affected family' },
    { label: 'Monitor staff wellbeing' },
    { label: 'Review and adjust support arrangements' },
  ]),
  medium_term: z.array(responsePlanTemplateItemSchema).default([
    { label: 'Review ongoing support needs' },
    { label: 'Identify students needing continued support' },
    { label: 'Liaise with external agencies' },
    { label: 'Plan memorial/commemoration (if appropriate)' },
    { label: 'Review staff support needs' },
    { label: 'Document lessons learned' },
  ]),
  long_term: z.array(responsePlanTemplateItemSchema).default([
    { label: 'Anniversary planning' },
    { label: 'Review at 3-month mark' },
    { label: 'Review at 6-month mark' },
    { label: 'Review at 12-month mark' },
    { label: 'Update CI Management Plan based on learnings' },
  ]),
});

export type CriticalIncidentResponsePlanTemplate = z.infer<typeof criticalIncidentResponsePlanTemplateSchema>;

// ─── Full Pastoral Tenant Settings Schema ──────────────────────────────────

export const pastoralTenantSettingsSchema = z.object({
  concern_categories: z.array(concernCategoryConfigSchema).default(
    DEFAULT_CONCERN_CATEGORIES.map((c) => ({
      key: c.key,
      label: c.label,
      auto_tier: c.auto_tier,
      active: c.active,
    })),
  ),

  intervention_types: z.array(interventionTypeConfigSchema).default(
    DEFAULT_INTERVENTION_TYPES.map((t) => ({
      key: t.key,
      label: t.label,
      active: t.active,
    })),
  ),

  parent_share_default_level: z.enum(['category_only', 'category_summary', 'full_detail']).default('category_only'),

  tier1_access_logging: z.boolean().default(false),
  tier2_access_logging: z.boolean().default(false),
  // Tier 3 access logging is ALWAYS on — not configurable

  masked_authorship_enabled: z.boolean().default(true),

  cp_retention_years: z.number().min(7).default(25),

  notification_recipients: notificationRecipientsConfigSchema.default({}),

  escalation: escalationConfigSchema.default({}),

  checkins: checkinConfigSchema.default({}),

  sst: sstConfigSchema.default({}),

  critical_incident_response_plan_template: criticalIncidentResponsePlanTemplateSchema.default({}),
});

export type PastoralTenantSettings = z.infer<typeof pastoralTenantSettingsSchema>;
