import { z } from 'zod';

export const behaviourSettingsSchema = z.object({
  // Quick-log
  quick_log_default_polarity: z.enum(['positive', 'negative']).default('positive'),
  quick_log_auto_submit: z.boolean().default(true),
  quick_log_recent_students_count: z.number().int().min(1).max(50).default(5),
  quick_log_show_favourites: z.boolean().default(true),

  // Points
  points_enabled: z.boolean().default(true),
  points_reset_frequency: z.enum(['never', 'academic_year', 'academic_period']).default('academic_year'),

  // House teams
  house_teams_enabled: z.boolean().default(false),
  house_points_visible_to_students: z.boolean().default(true),
  house_leaderboard_public: z.boolean().default(false),

  // Awards
  auto_awards_enabled: z.boolean().default(true),

  // Sanctions
  detention_default_duration_minutes: z.number().int().min(5).max(480).default(30),
  suspension_requires_approval: z.boolean().default(true),
  expulsion_requires_approval: z.boolean().default(true),

  // Parent visibility & communication
  parent_portal_behaviour_enabled: z.boolean().default(false),
  parent_notification_channels: z.array(z.enum(['email', 'whatsapp', 'in_app'])).default(['in_app']),
  parent_notification_negative_severity_threshold: z.number().int().min(1).max(10).default(3),
  parent_notification_positive_always: z.boolean().default(true),
  parent_notification_digest_enabled: z.boolean().default(false),
  parent_notification_digest_time: z.string().default('16:00'),
  parent_acknowledgement_required_severity: z.number().int().min(1).max(10).default(5),
  parent_visibility_show_teacher_name: z.boolean().default(false),
  guardian_specific_visibility_enabled: z.boolean().default(false),

  // Parent-safe content
  parent_notification_send_gate_severity: z.number().int().min(1).max(10).default(3),
  parent_description_auto_lock_on_send: z.boolean().default(true),
  parent_description_amendment_requires_auth: z.boolean().default(true),

  // Document generation
  document_generation_enabled: z.boolean().default(true),
  document_auto_generate_detention_notice: z.boolean().default(false),
  document_auto_generate_suspension_letter: z.boolean().default(true),
  document_auto_generate_exclusion_notice: z.boolean().default(true),

  // Retention
  incident_retention_years: z.number().int().min(1).max(50).default(7),
  sanction_retention_years: z.number().int().min(1).max(50).default(7),
  intervention_retention_years: z.number().int().min(1).max(50).default(7),
  appeal_retention_years: z.number().int().min(1).max(50).default(10),
  exclusion_case_retention_years: z.number().int().min(1).max(50).default(25),
  task_retention_years: z.number().int().min(1).max(50).default(3),
  policy_evaluation_retention_years: z.number().int().min(1).max(50).default(7),
  alert_retention_years: z.number().int().min(1).max(50).default(3),
  parent_ack_retention_years: z.number().int().min(1).max(50).default(7),

  // Recognition wall
  recognition_wall_enabled: z.boolean().default(true),
  recognition_wall_public: z.boolean().default(false),
  recognition_wall_requires_consent: z.boolean().default(true),
  recognition_wall_auto_populate: z.boolean().default(true),
  recognition_wall_min_severity: z.number().int().min(1).max(10).default(3),
  recognition_wall_admin_approval_required: z.boolean().default(true),

  // Safeguarding
  designated_liaison_user_id: z.string().uuid().nullable().default(null),
  deputy_designated_liaison_user_id: z.string().uuid().nullable().default(null),
  dlp_fallback_chain: z.array(z.string().uuid()).default([]),
  safeguarding_sla_critical_hours: z.number().int().min(1).max(168).default(4),
  safeguarding_sla_high_hours: z.number().int().min(1).max(168).default(24),
  safeguarding_sla_medium_hours: z.number().int().min(1).max(336).default(72),
  safeguarding_sla_low_hours: z.number().int().min(1).max(672).default(168),
  safeguarding_retention_years: z.number().int().min(1).max(50).default(25),

  // Analytics & AI
  behaviour_pulse_enabled: z.boolean().default(false),
  ai_insights_enabled: z.boolean().default(false),
  ai_narrative_enabled: z.boolean().default(false),
  ai_nl_query_enabled: z.boolean().default(false),
  ai_confidence_threshold: z.number().min(0).max(1).default(0.85),
  ai_diagnostic_language_blocked: z.boolean().default(true),
  ai_audit_logging: z.boolean().default(true),
  cross_school_benchmarking_enabled: z.boolean().default(false),
  benchmark_min_cohort_size: z.number().int().min(1).max(100).default(10),

  // Admin ops
  admin_destructive_ops_dual_approval: z.boolean().default(true),
});

export type BehaviourSettings = z.infer<typeof behaviourSettingsSchema>;
