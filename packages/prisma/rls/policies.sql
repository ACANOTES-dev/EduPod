-- =============================================================
-- RLS Policy Catalogue — School Operating System
-- =============================================================
-- AUTHORITATIVE CATALOGUE: Every tenant-scoped table MUST have
-- an entry here. This file is the single source of truth for
-- all RLS policies in the system. When adding a new
-- tenant-scoped table, add its policy here AND in the
-- corresponding migration's post_migrate.sql.
--
-- Known exceptions (intentionally no RLS):
--   users                    — platform-level, no tenant_id
--   survey_responses         — anonymity by design (DZ-27)
--   survey_participation_tokens — anonymity by design (DZ-27)
--   gdpr_export_policies     — platform-level, no tenant_id
-- =============================================================

-- Template for a standard tenant-scoped table:
--
--   ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;
--
--   DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name};
--   CREATE POLICY {table_name}_tenant_isolation ON {table_name}
--     USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
--     WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
--
-- For tables with nullable tenant_id (platform + tenant rows):
--
--   ALTER TABLE {table_name} ENABLE ROW LEVEL SECURITY;
--   ALTER TABLE {table_name} FORCE ROW LEVEL SECURITY;
--
--   DROP POLICY IF EXISTS {table_name}_tenant_isolation ON {table_name};
--   CREATE POLICY {table_name}_tenant_isolation ON {table_name}
--     USING (
--       tenant_id IS NULL
--       OR tenant_id = current_setting('app.current_tenant_id')::uuid
--     )
--     WITH CHECK (
--       tenant_id IS NULL
--       OR tenant_id = current_setting('app.current_tenant_id')::uuid
--     );

-- =============================================================
-- P7 RLS Policies — Communications, Notifications & CMS
-- =============================================================
-- Defined in: packages/prisma/migrations/20260316240000_add_p7_communications_cms/post_migrate.sql

-- announcements (standard)
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS announcements_tenant_isolation ON announcements;
CREATE POLICY announcements_tenant_isolation ON announcements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- notification_templates (dual — nullable tenant_id: platform templates have NULL)
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notification_templates_tenant_isolation ON notification_templates;
CREATE POLICY notification_templates_tenant_isolation ON notification_templates
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  );

-- notifications (standard)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_tenant_isolation ON notifications;
CREATE POLICY notifications_tenant_isolation ON notifications
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- parent_inquiries (standard)
ALTER TABLE parent_inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_inquiries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parent_inquiries_tenant_isolation ON parent_inquiries;
CREATE POLICY parent_inquiries_tenant_isolation ON parent_inquiries
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- parent_inquiry_messages (standard)
ALTER TABLE parent_inquiry_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE parent_inquiry_messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parent_inquiry_messages_tenant_isolation ON parent_inquiry_messages;
CREATE POLICY parent_inquiry_messages_tenant_isolation ON parent_inquiry_messages
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- website_pages (standard)
ALTER TABLE website_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE website_pages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS website_pages_tenant_isolation ON website_pages;
CREATE POLICY website_pages_tenant_isolation ON website_pages
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- contact_form_submissions (standard)
ALTER TABLE contact_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_form_submissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contact_form_submissions_tenant_isolation ON contact_form_submissions;
CREATE POLICY contact_form_submissions_tenant_isolation ON contact_form_submissions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- Early Warning System RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260329140000_add_early_warning_tables/post_migrate.sql

-- student_risk_profiles (standard)
ALTER TABLE student_risk_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_risk_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_risk_profiles_tenant_isolation ON student_risk_profiles;
CREATE POLICY student_risk_profiles_tenant_isolation ON student_risk_profiles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- student_risk_signals (standard)
ALTER TABLE student_risk_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_risk_signals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_risk_signals_tenant_isolation ON student_risk_signals;
CREATE POLICY student_risk_signals_tenant_isolation ON student_risk_signals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- early_warning_tier_transitions (standard)
ALTER TABLE early_warning_tier_transitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE early_warning_tier_transitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS early_warning_tier_transitions_tenant_isolation ON early_warning_tier_transitions;
CREATE POLICY early_warning_tier_transitions_tenant_isolation ON early_warning_tier_transitions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- early_warning_configs (standard)
ALTER TABLE early_warning_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE early_warning_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS early_warning_configs_tenant_isolation ON early_warning_configs;
CREATE POLICY early_warning_configs_tenant_isolation ON early_warning_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- SEN Module RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260331100000_add_sen_tables/post_migrate.sql

-- sen_profiles (standard)
ALTER TABLE sen_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_profiles_tenant_isolation ON sen_profiles;
CREATE POLICY sen_profiles_tenant_isolation ON sen_profiles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sen_support_plans (standard)
ALTER TABLE sen_support_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_support_plans FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_support_plans_tenant_isolation ON sen_support_plans;
CREATE POLICY sen_support_plans_tenant_isolation ON sen_support_plans
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sen_goals (standard)
ALTER TABLE sen_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_goals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_goals_tenant_isolation ON sen_goals;
CREATE POLICY sen_goals_tenant_isolation ON sen_goals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sen_goal_strategies (standard)
ALTER TABLE sen_goal_strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_goal_strategies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_goal_strategies_tenant_isolation ON sen_goal_strategies;
CREATE POLICY sen_goal_strategies_tenant_isolation ON sen_goal_strategies
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sen_goal_progress (standard)
ALTER TABLE sen_goal_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_goal_progress FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_goal_progress_tenant_isolation ON sen_goal_progress;
CREATE POLICY sen_goal_progress_tenant_isolation ON sen_goal_progress
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sen_resource_allocations (standard)
ALTER TABLE sen_resource_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_resource_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_resource_allocations_tenant_isolation ON sen_resource_allocations;
CREATE POLICY sen_resource_allocations_tenant_isolation ON sen_resource_allocations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sen_student_hours (standard)
ALTER TABLE sen_student_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_student_hours FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_student_hours_tenant_isolation ON sen_student_hours;
CREATE POLICY sen_student_hours_tenant_isolation ON sen_student_hours
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sen_sna_assignments (standard)
ALTER TABLE sen_sna_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_sna_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_sna_assignments_tenant_isolation ON sen_sna_assignments;
CREATE POLICY sen_sna_assignments_tenant_isolation ON sen_sna_assignments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sen_professional_involvements (standard)
ALTER TABLE sen_professional_involvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_professional_involvements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_professional_involvements_tenant_isolation ON sen_professional_involvements;
CREATE POLICY sen_professional_involvements_tenant_isolation ON sen_professional_involvements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sen_accommodations (standard)
ALTER TABLE sen_accommodations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_accommodations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_accommodations_tenant_isolation ON sen_accommodations;
CREATE POLICY sen_accommodations_tenant_isolation ON sen_accommodations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sen_transition_notes (standard)
ALTER TABLE sen_transition_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE sen_transition_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sen_transition_notes_tenant_isolation ON sen_transition_notes;
CREATE POLICY sen_transition_notes_tenant_isolation ON sen_transition_notes
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- Homework & Diary RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260330000000_add_homework_diary_tables/post_migrate.sql

-- homework_assignments (standard)
ALTER TABLE homework_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS homework_assignments_tenant_isolation ON homework_assignments;
CREATE POLICY homework_assignments_tenant_isolation ON homework_assignments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- homework_attachments (standard)
ALTER TABLE homework_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS homework_attachments_tenant_isolation ON homework_attachments;
CREATE POLICY homework_attachments_tenant_isolation ON homework_attachments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- homework_completions (standard)
ALTER TABLE homework_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_completions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS homework_completions_tenant_isolation ON homework_completions;
CREATE POLICY homework_completions_tenant_isolation ON homework_completions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- homework_recurrence_rules (standard)
ALTER TABLE homework_recurrence_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE homework_recurrence_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS homework_recurrence_rules_tenant_isolation ON homework_recurrence_rules;
CREATE POLICY homework_recurrence_rules_tenant_isolation ON homework_recurrence_rules
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- diary_notes (standard)
ALTER TABLE diary_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS diary_notes_tenant_isolation ON diary_notes;
CREATE POLICY diary_notes_tenant_isolation ON diary_notes
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- diary_parent_notes (standard)
ALTER TABLE diary_parent_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE diary_parent_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS diary_parent_notes_tenant_isolation ON diary_parent_notes;
CREATE POLICY diary_parent_notes_tenant_isolation ON diary_parent_notes
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P5 Gradebook — World-Class Extensions RLS Policies
-- =============================================================

-- rubric_templates (standard)
ALTER TABLE rubric_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubric_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rubric_templates_tenant_isolation ON rubric_templates;
CREATE POLICY rubric_templates_tenant_isolation ON rubric_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- rubric_grades (standard)
ALTER TABLE rubric_grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE rubric_grades FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rubric_grades_tenant_isolation ON rubric_grades;
CREATE POLICY rubric_grades_tenant_isolation ON rubric_grades
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- curriculum_standards (standard)
ALTER TABLE curriculum_standards ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_standards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS curriculum_standards_tenant_isolation ON curriculum_standards;
CREATE POLICY curriculum_standards_tenant_isolation ON curriculum_standards
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- assessment_standard_mappings (standard)
ALTER TABLE assessment_standard_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_standard_mappings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assessment_standard_mappings_tenant_isolation ON assessment_standard_mappings;
CREATE POLICY assessment_standard_mappings_tenant_isolation ON assessment_standard_mappings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- competency_scales (standard)
ALTER TABLE competency_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE competency_scales FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS competency_scales_tenant_isolation ON competency_scales;
CREATE POLICY competency_scales_tenant_isolation ON competency_scales
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- student_competency_snapshots (standard)
ALTER TABLE student_competency_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_competency_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_competency_snapshots_tenant_isolation ON student_competency_snapshots;
CREATE POLICY student_competency_snapshots_tenant_isolation ON student_competency_snapshots
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- gpa_snapshots (standard)
ALTER TABLE gpa_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE gpa_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gpa_snapshots_tenant_isolation ON gpa_snapshots;
CREATE POLICY gpa_snapshots_tenant_isolation ON gpa_snapshots
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- grade_curve_audit (standard)
ALTER TABLE grade_curve_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_curve_audit FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grade_curve_audit_tenant_isolation ON grade_curve_audit;
CREATE POLICY grade_curve_audit_tenant_isolation ON grade_curve_audit
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- assessment_templates (standard)
ALTER TABLE assessment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assessment_templates_tenant_isolation ON assessment_templates;
CREATE POLICY assessment_templates_tenant_isolation ON assessment_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ai_grading_instructions (standard)
ALTER TABLE ai_grading_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_grading_instructions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_grading_instructions_tenant_isolation ON ai_grading_instructions;
CREATE POLICY ai_grading_instructions_tenant_isolation ON ai_grading_instructions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ai_grading_references (standard)
ALTER TABLE ai_grading_references ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_grading_references FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_grading_references_tenant_isolation ON ai_grading_references;
CREATE POLICY ai_grading_references_tenant_isolation ON ai_grading_references
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- student_academic_risk_alerts (standard)
ALTER TABLE student_academic_risk_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_academic_risk_alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_academic_risk_alerts_tenant_isolation ON student_academic_risk_alerts;
CREATE POLICY student_academic_risk_alerts_tenant_isolation ON student_academic_risk_alerts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- progress_reports (standard)
ALTER TABLE progress_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS progress_reports_tenant_isolation ON progress_reports;
CREATE POLICY progress_reports_tenant_isolation ON progress_reports
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- progress_report_entries (standard)
ALTER TABLE progress_report_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_report_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS progress_report_entries_tenant_isolation ON progress_report_entries;
CREATE POLICY progress_report_entries_tenant_isolation ON progress_report_entries
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- nl_query_history (standard)
ALTER TABLE nl_query_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE nl_query_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS nl_query_history_tenant_isolation ON nl_query_history;
CREATE POLICY nl_query_history_tenant_isolation ON nl_query_history
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- year_group_grade_weights (standard)
ALTER TABLE year_group_grade_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_group_grade_weights FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS year_group_grade_weights_tenant_isolation ON year_group_grade_weights;
CREATE POLICY year_group_grade_weights_tenant_isolation ON year_group_grade_weights
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P5 Report Cards Enhancement RLS Policies
-- =============================================================

-- report_card_templates (standard)
ALTER TABLE report_card_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_templates_tenant_isolation ON report_card_templates;
CREATE POLICY report_card_templates_tenant_isolation ON report_card_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_card_approval_configs (standard)
ALTER TABLE report_card_approval_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_approval_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_approval_configs_tenant_isolation ON report_card_approval_configs;
CREATE POLICY report_card_approval_configs_tenant_isolation ON report_card_approval_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_card_approvals (standard)
ALTER TABLE report_card_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_approvals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_approvals_tenant_isolation ON report_card_approvals;
CREATE POLICY report_card_approvals_tenant_isolation ON report_card_approvals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_card_batch_jobs (standard)
ALTER TABLE report_card_batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_batch_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_batch_jobs_tenant_isolation ON report_card_batch_jobs;
CREATE POLICY report_card_batch_jobs_tenant_isolation ON report_card_batch_jobs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_card_custom_field_defs (standard)
ALTER TABLE report_card_custom_field_defs ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_custom_field_defs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_custom_field_defs_tenant_isolation ON report_card_custom_field_defs;
CREATE POLICY report_card_custom_field_defs_tenant_isolation ON report_card_custom_field_defs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_card_custom_field_values (standard)
ALTER TABLE report_card_custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_custom_field_values FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_custom_field_values_tenant_isolation ON report_card_custom_field_values;
CREATE POLICY report_card_custom_field_values_tenant_isolation ON report_card_custom_field_values
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_card_deliveries (standard)
ALTER TABLE report_card_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_deliveries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_deliveries_tenant_isolation ON report_card_deliveries;
CREATE POLICY report_card_deliveries_tenant_isolation ON report_card_deliveries
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- grade_threshold_configs (standard)
ALTER TABLE grade_threshold_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_threshold_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grade_threshold_configs_tenant_isolation ON grade_threshold_configs;
CREATE POLICY grade_threshold_configs_tenant_isolation ON grade_threshold_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_card_acknowledgments (standard)
ALTER TABLE report_card_acknowledgments ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_acknowledgments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_acknowledgments_tenant_isolation ON report_card_acknowledgments;
CREATE POLICY report_card_acknowledgments_tenant_isolation ON report_card_acknowledgments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_card_verification_tokens (standard)
ALTER TABLE report_card_verification_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_verification_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_verification_tokens_tenant_isolation ON report_card_verification_tokens;
CREATE POLICY report_card_verification_tokens_tenant_isolation ON report_card_verification_tokens
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- Report Cards Redesign (Implementation 01) — RLS Policies
-- =============================================================

-- report_comment_windows (standard)
ALTER TABLE report_comment_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_comment_windows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_comment_windows_tenant_isolation ON report_comment_windows;
CREATE POLICY report_comment_windows_tenant_isolation ON report_comment_windows
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_comment_window_homerooms (standard)
ALTER TABLE report_comment_window_homerooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_comment_window_homerooms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_comment_window_homerooms_tenant_isolation ON report_comment_window_homerooms;
CREATE POLICY report_comment_window_homerooms_tenant_isolation ON report_comment_window_homerooms
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_card_subject_comments (standard)
ALTER TABLE report_card_subject_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_subject_comments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_subject_comments_tenant_isolation ON report_card_subject_comments;
CREATE POLICY report_card_subject_comments_tenant_isolation ON report_card_subject_comments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_card_overall_comments (standard)
ALTER TABLE report_card_overall_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_overall_comments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_overall_comments_tenant_isolation ON report_card_overall_comments;
CREATE POLICY report_card_overall_comments_tenant_isolation ON report_card_overall_comments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_card_teacher_requests (standard)
ALTER TABLE report_card_teacher_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_teacher_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_teacher_requests_tenant_isolation ON report_card_teacher_requests;
CREATE POLICY report_card_teacher_requests_tenant_isolation ON report_card_teacher_requests
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_card_tenant_settings (standard)
ALTER TABLE report_card_tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_tenant_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_tenant_settings_tenant_isolation ON report_card_tenant_settings;
CREATE POLICY report_card_tenant_settings_tenant_isolation ON report_card_tenant_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P4A Scheduling — Extended RLS Policies
-- =============================================================

-- calendar_subscription_tokens (standard)
ALTER TABLE calendar_subscription_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_subscription_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS calendar_subscription_tokens_tenant_isolation ON calendar_subscription_tokens;
CREATE POLICY calendar_subscription_tokens_tenant_isolation ON calendar_subscription_tokens
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- exam_sessions (standard)
ALTER TABLE exam_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_sessions_tenant_isolation ON exam_sessions;
CREATE POLICY exam_sessions_tenant_isolation ON exam_sessions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- exam_slots (standard)
ALTER TABLE exam_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_slots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_slots_tenant_isolation ON exam_slots;
CREATE POLICY exam_slots_tenant_isolation ON exam_slots
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- exam_invigilation (standard)
ALTER TABLE exam_invigilation ENABLE ROW LEVEL SECURITY;
ALTER TABLE exam_invigilation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exam_invigilation_tenant_isolation ON exam_invigilation;
CREATE POLICY exam_invigilation_tenant_isolation ON exam_invigilation
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- scheduling_scenarios (standard)
ALTER TABLE scheduling_scenarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_scenarios FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheduling_scenarios_tenant_isolation ON scheduling_scenarios;
CREATE POLICY scheduling_scenarios_tenant_isolation ON scheduling_scenarios
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- rotation_configs (standard)
ALTER TABLE rotation_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE rotation_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rotation_configs_tenant_isolation ON rotation_configs;
CREATE POLICY rotation_configs_tenant_isolation ON rotation_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- teacher_absences (standard)
ALTER TABLE teacher_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_absences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teacher_absences_tenant_isolation ON teacher_absences;
CREATE POLICY teacher_absences_tenant_isolation ON teacher_absences
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- substitution_records (standard)
ALTER TABLE substitution_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE substitution_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS substitution_records_tenant_isolation ON substitution_records;
CREATE POLICY substitution_records_tenant_isolation ON substitution_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P6 Finance — World-Class Extensions RLS Policies
-- =============================================================

-- invoice_reminders (standard)
ALTER TABLE invoice_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_reminders FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_reminders_tenant_isolation ON invoice_reminders;
CREATE POLICY invoice_reminders_tenant_isolation ON invoice_reminders
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- recurring_invoice_configs (standard)
ALTER TABLE recurring_invoice_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_invoice_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS recurring_invoice_configs_tenant_isolation ON recurring_invoice_configs;
CREATE POLICY recurring_invoice_configs_tenant_isolation ON recurring_invoice_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- credit_notes (standard)
ALTER TABLE credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credit_notes_tenant_isolation ON credit_notes;
CREATE POLICY credit_notes_tenant_isolation ON credit_notes
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- credit_note_applications (standard)
ALTER TABLE credit_note_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_note_applications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS credit_note_applications_tenant_isolation ON credit_note_applications;
CREATE POLICY credit_note_applications_tenant_isolation ON credit_note_applications
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- late_fee_configs (standard)
ALTER TABLE late_fee_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_fee_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS late_fee_configs_tenant_isolation ON late_fee_configs;
CREATE POLICY late_fee_configs_tenant_isolation ON late_fee_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- late_fee_applications (standard)
ALTER TABLE late_fee_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE late_fee_applications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS late_fee_applications_tenant_isolation ON late_fee_applications;
CREATE POLICY late_fee_applications_tenant_isolation ON late_fee_applications
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payment_plan_requests (standard)
ALTER TABLE payment_plan_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_plan_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_plan_requests_tenant_isolation ON payment_plan_requests;
CREATE POLICY payment_plan_requests_tenant_isolation ON payment_plan_requests
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- scholarships (standard)
ALTER TABLE scholarships ENABLE ROW LEVEL SECURITY;
ALTER TABLE scholarships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scholarships_tenant_isolation ON scholarships;
CREATE POLICY scholarships_tenant_isolation ON scholarships
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P6B Payroll — World-Class Extensions RLS Policies
-- =============================================================

-- staff_attendance_records (standard)
ALTER TABLE staff_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_attendance_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_attendance_records_tenant_isolation ON staff_attendance_records;
CREATE POLICY staff_attendance_records_tenant_isolation ON staff_attendance_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- class_delivery_records (standard)
ALTER TABLE class_delivery_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_delivery_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_delivery_records_tenant_isolation ON class_delivery_records;
CREATE POLICY class_delivery_records_tenant_isolation ON class_delivery_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_adjustments (standard)
ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_adjustments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_adjustments_tenant_isolation ON payroll_adjustments;
CREATE POLICY payroll_adjustments_tenant_isolation ON payroll_adjustments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_export_templates (standard)
ALTER TABLE payroll_export_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_export_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_export_templates_tenant_isolation ON payroll_export_templates;
CREATE POLICY payroll_export_templates_tenant_isolation ON payroll_export_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_export_logs (standard)
ALTER TABLE payroll_export_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_export_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_export_logs_tenant_isolation ON payroll_export_logs;
CREATE POLICY payroll_export_logs_tenant_isolation ON payroll_export_logs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_approval_configs (standard)
ALTER TABLE payroll_approval_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_approval_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_approval_configs_tenant_isolation ON payroll_approval_configs;
CREATE POLICY payroll_approval_configs_tenant_isolation ON payroll_approval_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_allowance_types (standard)
ALTER TABLE payroll_allowance_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_allowance_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_allowance_types_tenant_isolation ON payroll_allowance_types;
CREATE POLICY payroll_allowance_types_tenant_isolation ON payroll_allowance_types
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- staff_allowances (standard)
ALTER TABLE staff_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_allowances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_allowances_tenant_isolation ON staff_allowances;
CREATE POLICY staff_allowances_tenant_isolation ON staff_allowances
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_one_off_items (standard)
ALTER TABLE payroll_one_off_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_one_off_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_one_off_items_tenant_isolation ON payroll_one_off_items;
CREATE POLICY payroll_one_off_items_tenant_isolation ON payroll_one_off_items
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- staff_recurring_deductions (standard)
ALTER TABLE staff_recurring_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_recurring_deductions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_recurring_deductions_tenant_isolation ON staff_recurring_deductions;
CREATE POLICY staff_recurring_deductions_tenant_isolation ON staff_recurring_deductions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P8 Reporting & Compliance RLS Policies
-- =============================================================

-- saved_reports (standard)
ALTER TABLE saved_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_reports_tenant_isolation ON saved_reports;
CREATE POLICY saved_reports_tenant_isolation ON saved_reports
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- board_reports (standard)
ALTER TABLE board_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE board_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS board_reports_tenant_isolation ON board_reports;
CREATE POLICY board_reports_tenant_isolation ON board_reports
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- compliance_report_templates (standard)
ALTER TABLE compliance_report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_report_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compliance_report_templates_tenant_isolation ON compliance_report_templates;
CREATE POLICY compliance_report_templates_tenant_isolation ON compliance_report_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- scheduled_reports (standard)
ALTER TABLE scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheduled_reports_tenant_isolation ON scheduled_reports;
CREATE POLICY scheduled_reports_tenant_isolation ON scheduled_reports
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_alerts (standard)
ALTER TABLE report_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_alerts_tenant_isolation ON report_alerts;
CREATE POLICY report_alerts_tenant_isolation ON report_alerts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- import_job_records (standard)
ALTER TABLE import_job_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_job_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_job_records_tenant_isolation ON import_job_records;
CREATE POLICY import_job_records_tenant_isolation ON import_job_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- Pastoral Care — NEPS Visits RLS Policies
-- =============================================================

-- pastoral_neps_visits (standard)
ALTER TABLE pastoral_neps_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_neps_visits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_neps_visits_tenant_isolation ON pastoral_neps_visits;
CREATE POLICY pastoral_neps_visits_tenant_isolation ON pastoral_neps_visits
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_neps_visit_students (standard)
ALTER TABLE pastoral_neps_visit_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_neps_visit_students FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_neps_visit_students_tenant_isolation ON pastoral_neps_visit_students;
CREATE POLICY pastoral_neps_visit_students_tenant_isolation ON pastoral_neps_visit_students
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- Engagement Module RLS Policies
-- =============================================================

-- engagement_form_templates (standard)
ALTER TABLE engagement_form_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_form_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_form_templates_tenant_isolation ON engagement_form_templates;
CREATE POLICY engagement_form_templates_tenant_isolation ON engagement_form_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- engagement_form_submissions (standard)
ALTER TABLE engagement_form_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_form_submissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_form_submissions_tenant_isolation ON engagement_form_submissions;
CREATE POLICY engagement_form_submissions_tenant_isolation ON engagement_form_submissions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- engagement_consent_records (standard)
ALTER TABLE engagement_consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_consent_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_consent_records_tenant_isolation ON engagement_consent_records;
CREATE POLICY engagement_consent_records_tenant_isolation ON engagement_consent_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- engagement_events (standard)
ALTER TABLE engagement_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_events_tenant_isolation ON engagement_events;
CREATE POLICY engagement_events_tenant_isolation ON engagement_events
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- engagement_event_staff (standard)
ALTER TABLE engagement_event_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_event_staff FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_event_staff_tenant_isolation ON engagement_event_staff;
CREATE POLICY engagement_event_staff_tenant_isolation ON engagement_event_staff
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- engagement_event_participants (standard)
ALTER TABLE engagement_event_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_event_participants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_event_participants_tenant_isolation ON engagement_event_participants;
CREATE POLICY engagement_event_participants_tenant_isolation ON engagement_event_participants
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- conference_time_slots (standard)
ALTER TABLE conference_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE conference_time_slots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conference_time_slots_tenant_isolation ON conference_time_slots;
CREATE POLICY conference_time_slots_tenant_isolation ON conference_time_slots
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- conference_bookings (standard)
ALTER TABLE conference_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE conference_bookings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conference_bookings_tenant_isolation ON conference_bookings;
CREATE POLICY conference_bookings_tenant_isolation ON conference_bookings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- engagement_incident_reports (standard)
ALTER TABLE engagement_incident_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE engagement_incident_reports FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS engagement_incident_reports_tenant_isolation ON engagement_incident_reports;
CREATE POLICY engagement_incident_reports_tenant_isolation ON engagement_incident_reports
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- Attendance Pattern Alerts RLS Policy (S-01 security fix)
-- =============================================================
-- Defined in: packages/prisma/migrations/20260324020000_attendance_default_present/migration.sql
-- Fix applied in: packages/prisma/migrations/20260401100000_fix_attendance_pattern_alerts_rls/migration.sql
-- Original migration had ENABLE + non-standard policy name; FORCE and rename added here.

-- attendance_pattern_alerts (standard)
ALTER TABLE attendance_pattern_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_pattern_alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_pattern_alerts_tenant_isolation ON attendance_pattern_alerts;
CREATE POLICY attendance_pattern_alerts_tenant_isolation ON attendance_pattern_alerts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P1 RLS Policies — Tenancy, Users & RBAC
-- =============================================================
-- Defined in: packages/prisma/migrations/20260316072748_add_p1_tenancy_users_rbac/post_migrate.sql
-- Updated in: packages/prisma/migrations/20260402150500_fix_auth_bootstrap_rls/post_migrate.sql

-- tenant_domains (tenant + exact-domain bootstrap read)
ALTER TABLE tenant_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_domains FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_domains_tenant_isolation ON tenant_domains;
DROP POLICY IF EXISTS tenant_domains_domain_bootstrap ON tenant_domains;
CREATE POLICY tenant_domains_tenant_isolation ON tenant_domains
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY tenant_domains_domain_bootstrap ON tenant_domains
  FOR SELECT
  USING (
    verification_status = 'verified'
    AND domain = current_setting('app.current_tenant_domain', true)
  );

-- tenant_modules (standard)
ALTER TABLE tenant_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_modules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_modules_tenant_isolation ON tenant_modules;
CREATE POLICY tenant_modules_tenant_isolation ON tenant_modules
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_branding (standard)
ALTER TABLE tenant_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_branding FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_branding_tenant_isolation ON tenant_branding;
CREATE POLICY tenant_branding_tenant_isolation ON tenant_branding
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_settings (standard)
ALTER TABLE tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_settings_tenant_isolation ON tenant_settings;
CREATE POLICY tenant_settings_tenant_isolation ON tenant_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_notification_settings (standard)
ALTER TABLE tenant_notification_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_notification_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_notification_settings_tenant_isolation ON tenant_notification_settings;
CREATE POLICY tenant_notification_settings_tenant_isolation ON tenant_notification_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_sequences (standard)
ALTER TABLE tenant_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_sequences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_sequences_tenant_isolation ON tenant_sequences;
CREATE POLICY tenant_sequences_tenant_isolation ON tenant_sequences
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_stripe_configs (standard)
ALTER TABLE tenant_stripe_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_stripe_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_stripe_configs_tenant_isolation ON tenant_stripe_configs;
CREATE POLICY tenant_stripe_configs_tenant_isolation ON tenant_stripe_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tenant_memberships (tenant + self-service read)
ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_memberships_tenant_isolation ON tenant_memberships;
DROP POLICY IF EXISTS tenant_memberships_self_access ON tenant_memberships;
CREATE POLICY tenant_memberships_tenant_isolation ON tenant_memberships
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY tenant_memberships_self_access ON tenant_memberships
  FOR SELECT
  USING (user_id = current_setting('app.current_user_id', true)::uuid);

-- roles (dual — nullable tenant_id: system roles have NULL)
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_tenant_isolation ON roles;
DROP POLICY IF EXISTS roles_self_access ON roles;
CREATE POLICY roles_tenant_isolation ON roles
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
CREATE POLICY roles_self_access ON roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM membership_roles mr
      WHERE mr.role_id = roles.id
        AND mr.membership_id = current_setting('app.current_membership_id', true)::uuid
    )
    OR EXISTS (
      SELECT 1
      FROM membership_roles mr
      JOIN tenant_memberships tm ON tm.id = mr.membership_id
      WHERE mr.role_id = roles.id
        AND tm.user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

-- role_permissions (dual — nullable tenant_id)
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_tenant_isolation ON role_permissions;
DROP POLICY IF EXISTS role_permissions_self_access ON role_permissions;
CREATE POLICY role_permissions_tenant_isolation ON role_permissions
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );
CREATE POLICY role_permissions_self_access ON role_permissions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM membership_roles mr
      WHERE mr.role_id = role_permissions.role_id
        AND mr.membership_id = current_setting('app.current_membership_id', true)::uuid
    )
    OR EXISTS (
      SELECT 1
      FROM membership_roles mr
      JOIN tenant_memberships tm ON tm.id = mr.membership_id
      WHERE mr.role_id = role_permissions.role_id
        AND tm.user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

-- membership_roles (tenant + self-service read)
ALTER TABLE membership_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_roles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS membership_roles_tenant_isolation ON membership_roles;
DROP POLICY IF EXISTS membership_roles_self_access ON membership_roles;
CREATE POLICY membership_roles_tenant_isolation ON membership_roles
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
CREATE POLICY membership_roles_self_access ON membership_roles
  FOR SELECT
  USING (
    membership_id = current_setting('app.current_membership_id', true)::uuid
    OR EXISTS (
      SELECT 1
      FROM tenant_memberships tm
      WHERE tm.id = membership_roles.membership_id
        AND tm.user_id = current_setting('app.current_user_id', true)::uuid
    )
  );

-- invitations (standard)
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invitations_tenant_isolation ON invitations;
CREATE POLICY invitations_tenant_isolation ON invitations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- approval_workflows (standard)
ALTER TABLE approval_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_workflows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_workflows_tenant_isolation ON approval_workflows;
CREATE POLICY approval_workflows_tenant_isolation ON approval_workflows
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- approval_requests (standard)
ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE approval_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS approval_requests_tenant_isolation ON approval_requests;
CREATE POLICY approval_requests_tenant_isolation ON approval_requests
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- user_ui_preferences (standard)
ALTER TABLE user_ui_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_ui_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_ui_preferences_tenant_isolation ON user_ui_preferences;
CREATE POLICY user_ui_preferences_tenant_isolation ON user_ui_preferences
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P2 RLS Policies — Core Entities
-- =============================================================
-- Defined in: packages/prisma/migrations/20260316100000_add_p2_core_entities/post_migrate.sql

-- households (standard)
ALTER TABLE households ENABLE ROW LEVEL SECURITY;
ALTER TABLE households FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS households_tenant_isolation ON households;
CREATE POLICY households_tenant_isolation ON households
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- household_emergency_contacts (standard)
ALTER TABLE household_emergency_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_emergency_contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS household_emergency_contacts_tenant_isolation ON household_emergency_contacts;
CREATE POLICY household_emergency_contacts_tenant_isolation ON household_emergency_contacts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- parents (standard)
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS parents_tenant_isolation ON parents;
CREATE POLICY parents_tenant_isolation ON parents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- household_parents (standard)
ALTER TABLE household_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_parents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS household_parents_tenant_isolation ON household_parents;
CREATE POLICY household_parents_tenant_isolation ON household_parents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- students (standard)
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE students FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS students_tenant_isolation ON students;
CREATE POLICY students_tenant_isolation ON students
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- student_parents (standard)
ALTER TABLE student_parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_parents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_parents_tenant_isolation ON student_parents;
CREATE POLICY student_parents_tenant_isolation ON student_parents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- staff_profiles (standard)
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_profiles_tenant_isolation ON staff_profiles;
CREATE POLICY staff_profiles_tenant_isolation ON staff_profiles
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- academic_years (standard)
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_years FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS academic_years_tenant_isolation ON academic_years;
CREATE POLICY academic_years_tenant_isolation ON academic_years
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- academic_periods (standard)
ALTER TABLE academic_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_periods FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS academic_periods_tenant_isolation ON academic_periods;
CREATE POLICY academic_periods_tenant_isolation ON academic_periods
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- year_groups (standard)
ALTER TABLE year_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE year_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS year_groups_tenant_isolation ON year_groups;
CREATE POLICY year_groups_tenant_isolation ON year_groups
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- subjects (standard)
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE subjects FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS subjects_tenant_isolation ON subjects;
CREATE POLICY subjects_tenant_isolation ON subjects
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- classes (standard)
ALTER TABLE classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE classes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS classes_tenant_isolation ON classes;
CREATE POLICY classes_tenant_isolation ON classes
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- class_staff (standard)
ALTER TABLE class_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_staff FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_staff_tenant_isolation ON class_staff;
CREATE POLICY class_staff_tenant_isolation ON class_staff
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- class_enrolments (standard)
ALTER TABLE class_enrolments ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_enrolments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_enrolments_tenant_isolation ON class_enrolments;
CREATE POLICY class_enrolments_tenant_isolation ON class_enrolments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P3 RLS Policies — Admissions
-- =============================================================
-- Defined in: packages/prisma/migrations/20260316120000_add_p3_admissions/post_migrate.sql

-- admission_form_definitions (standard)
ALTER TABLE admission_form_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_definitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admission_form_definitions_tenant_isolation ON admission_form_definitions;
CREATE POLICY admission_form_definitions_tenant_isolation ON admission_form_definitions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- admission_form_fields (standard)
ALTER TABLE admission_form_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_form_fields FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS admission_form_fields_tenant_isolation ON admission_form_fields;
CREATE POLICY admission_form_fields_tenant_isolation ON admission_form_fields
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- applications (standard)
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS applications_tenant_isolation ON applications;
CREATE POLICY applications_tenant_isolation ON applications
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- application_notes (standard)
ALTER TABLE application_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE application_notes FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS application_notes_tenant_isolation ON application_notes;
CREATE POLICY application_notes_tenant_isolation ON application_notes
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P4A RLS Policies — Scheduling & Attendance
-- =============================================================
-- Defined in: packages/prisma/migrations/20260316140000_add_p4a_scheduling_attendance/post_migrate.sql

-- rooms (standard)
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rooms_tenant_isolation ON rooms;
CREATE POLICY rooms_tenant_isolation ON rooms
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- schedules (standard)
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedules_tenant_isolation ON schedules;
CREATE POLICY schedules_tenant_isolation ON schedules
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- school_closures (standard)
ALTER TABLE school_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_closures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS school_closures_tenant_isolation ON school_closures;
CREATE POLICY school_closures_tenant_isolation ON school_closures
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- attendance_sessions (standard)
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_sessions_tenant_isolation ON attendance_sessions;
CREATE POLICY attendance_sessions_tenant_isolation ON attendance_sessions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- attendance_records (standard)
ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attendance_records_tenant_isolation ON attendance_records;
CREATE POLICY attendance_records_tenant_isolation ON attendance_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- daily_attendance_summaries (standard)
ALTER TABLE daily_attendance_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_attendance_summaries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS daily_attendance_summaries_tenant_isolation ON daily_attendance_summaries;
CREATE POLICY daily_attendance_summaries_tenant_isolation ON daily_attendance_summaries
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P4B RLS Policies — Auto-Scheduling
-- =============================================================
-- Defined in: packages/prisma/migrations/20260316160000_add_p4b_auto_scheduling/post_migrate.sql

-- schedule_period_templates (standard)
ALTER TABLE schedule_period_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_period_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schedule_period_templates_tenant_isolation ON schedule_period_templates;
CREATE POLICY schedule_period_templates_tenant_isolation ON schedule_period_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- class_scheduling_requirements (standard)
ALTER TABLE class_scheduling_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_scheduling_requirements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_scheduling_requirements_tenant_isolation ON class_scheduling_requirements;
CREATE POLICY class_scheduling_requirements_tenant_isolation ON class_scheduling_requirements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- staff_availability (standard)
ALTER TABLE staff_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_availability FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_availability_tenant_isolation ON staff_availability;
CREATE POLICY staff_availability_tenant_isolation ON staff_availability
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- staff_scheduling_preferences (standard)
ALTER TABLE staff_scheduling_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_scheduling_preferences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_scheduling_preferences_tenant_isolation ON staff_scheduling_preferences;
CREATE POLICY staff_scheduling_preferences_tenant_isolation ON staff_scheduling_preferences
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- scheduling_runs (standard)
ALTER TABLE scheduling_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheduling_runs_tenant_isolation ON scheduling_runs;
CREATE POLICY scheduling_runs_tenant_isolation ON scheduling_runs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P4B-v2 RLS Policies — Auto-Scheduler Redesign
-- =============================================================
-- Defined in: packages/prisma/migrations/20260319000000_p4b_v2_auto_scheduler_redesign/post_migrate.sql
-- NOTE: original migration omitted FORCE ROW LEVEL SECURITY — added here.

-- curriculum_requirements (standard)
ALTER TABLE curriculum_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE curriculum_requirements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS curriculum_requirements_tenant_isolation ON curriculum_requirements;
CREATE POLICY curriculum_requirements_tenant_isolation ON curriculum_requirements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- teacher_competencies (standard)
ALTER TABLE teacher_competencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_competencies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teacher_competencies_tenant_isolation ON teacher_competencies;
CREATE POLICY teacher_competencies_tenant_isolation ON teacher_competencies
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- break_groups (standard)
ALTER TABLE break_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS break_groups_tenant_isolation ON break_groups;
CREATE POLICY break_groups_tenant_isolation ON break_groups
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- break_group_year_groups (standard)
ALTER TABLE break_group_year_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE break_group_year_groups FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS break_group_year_groups_tenant_isolation ON break_group_year_groups;
CREATE POLICY break_group_year_groups_tenant_isolation ON break_group_year_groups
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- room_closures (standard)
ALTER TABLE room_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_closures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS room_closures_tenant_isolation ON room_closures;
CREATE POLICY room_closures_tenant_isolation ON room_closures
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- teacher_scheduling_configs (standard)
ALTER TABLE teacher_scheduling_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_scheduling_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS teacher_scheduling_configs_tenant_isolation ON teacher_scheduling_configs;
CREATE POLICY teacher_scheduling_configs_tenant_isolation ON teacher_scheduling_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P5 RLS Policies — Gradebook
-- =============================================================
-- Defined in: packages/prisma/migrations/20260316180000_add_p5_gradebook_tables/post_migrate.sql

-- grading_scales (standard)
ALTER TABLE grading_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE grading_scales FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grading_scales_tenant_isolation ON grading_scales;
CREATE POLICY grading_scales_tenant_isolation ON grading_scales
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- assessment_categories (standard)
ALTER TABLE assessment_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assessment_categories_tenant_isolation ON assessment_categories;
CREATE POLICY assessment_categories_tenant_isolation ON assessment_categories
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- class_subject_grade_configs (standard)
ALTER TABLE class_subject_grade_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_subject_grade_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_subject_grade_configs_tenant_isolation ON class_subject_grade_configs;
CREATE POLICY class_subject_grade_configs_tenant_isolation ON class_subject_grade_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- assessments (standard)
ALTER TABLE assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS assessments_tenant_isolation ON assessments;
CREATE POLICY assessments_tenant_isolation ON assessments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- grades (standard)
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
ALTER TABLE grades FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS grades_tenant_isolation ON grades;
CREATE POLICY grades_tenant_isolation ON grades
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- period_grade_snapshots (standard)
ALTER TABLE period_grade_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_grade_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS period_grade_snapshots_tenant_isolation ON period_grade_snapshots;
CREATE POLICY period_grade_snapshots_tenant_isolation ON period_grade_snapshots
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- report_cards (standard)
ALTER TABLE report_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_cards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_cards_tenant_isolation ON report_cards;
CREATE POLICY report_cards_tenant_isolation ON report_cards
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P6 RLS Policies — Finance
-- =============================================================
-- Defined in: packages/prisma/migrations/20260316200000_add_p6_finance_tables/post_migrate.sql

-- fee_structures (standard)
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS fee_structures_tenant_isolation ON fee_structures;
CREATE POLICY fee_structures_tenant_isolation ON fee_structures
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- discounts (standard)
ALTER TABLE discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE discounts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS discounts_tenant_isolation ON discounts;
CREATE POLICY discounts_tenant_isolation ON discounts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- household_fee_assignments (standard)
ALTER TABLE household_fee_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE household_fee_assignments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS household_fee_assignments_tenant_isolation ON household_fee_assignments;
CREATE POLICY household_fee_assignments_tenant_isolation ON household_fee_assignments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- invoices (standard)
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_tenant_isolation ON invoices;
CREATE POLICY invoices_tenant_isolation ON invoices
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- invoice_lines (standard)
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoice_lines_tenant_isolation ON invoice_lines;
CREATE POLICY invoice_lines_tenant_isolation ON invoice_lines
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- installments (standard)
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;
ALTER TABLE installments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS installments_tenant_isolation ON installments;
CREATE POLICY installments_tenant_isolation ON installments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payments (standard)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payments_tenant_isolation ON payments;
CREATE POLICY payments_tenant_isolation ON payments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payment_allocations (standard)
ALTER TABLE payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_allocations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payment_allocations_tenant_isolation ON payment_allocations;
CREATE POLICY payment_allocations_tenant_isolation ON payment_allocations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- receipts (standard)
ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS receipts_tenant_isolation ON receipts;
CREATE POLICY receipts_tenant_isolation ON receipts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- refunds (standard)
ALTER TABLE refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS refunds_tenant_isolation ON refunds;
CREATE POLICY refunds_tenant_isolation ON refunds
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P6B RLS Policies — Payroll
-- =============================================================
-- Defined in: packages/prisma/migrations/20260316220000_add_p6b_payroll_tables/post_migrate.sql

-- staff_compensation (standard)
ALTER TABLE staff_compensation ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_compensation FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_compensation_tenant_isolation ON staff_compensation;
CREATE POLICY staff_compensation_tenant_isolation ON staff_compensation
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_runs (standard)
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_runs_tenant_isolation ON payroll_runs;
CREATE POLICY payroll_runs_tenant_isolation ON payroll_runs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payroll_entries (standard)
ALTER TABLE payroll_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_entries FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_entries_tenant_isolation ON payroll_entries;
CREATE POLICY payroll_entries_tenant_isolation ON payroll_entries
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- payslips (standard)
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payslips_tenant_isolation ON payslips;
CREATE POLICY payslips_tenant_isolation ON payslips
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- P8 RLS Policies — Audit, Compliance, Import, Search
-- =============================================================
-- Defined in: packages/prisma/migrations/20260316260000_add_p8_audit_compliance_import_search/post_migrate.sql

-- audit_logs (dual — nullable tenant_id: platform-level actions have NULL)
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_tenant_isolation ON audit_logs;
CREATE POLICY audit_logs_tenant_isolation ON audit_logs
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  );

-- compliance_requests (standard)
ALTER TABLE compliance_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS compliance_requests_tenant_isolation ON compliance_requests;
CREATE POLICY compliance_requests_tenant_isolation ON compliance_requests
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- import_jobs (standard)
ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS import_jobs_tenant_isolation ON import_jobs;
CREATE POLICY import_jobs_tenant_isolation ON import_jobs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- search_index_status (standard)
ALTER TABLE search_index_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_index_status FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS search_index_status_tenant_isolation ON search_index_status;
CREATE POLICY search_index_status_tenant_isolation ON search_index_status
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- Behaviour Management RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260326200000_add_behaviour_management_tables/post_migrate.sql

-- behaviour_categories (standard)
ALTER TABLE behaviour_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_categories FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_categories_tenant_isolation ON behaviour_categories;
CREATE POLICY behaviour_categories_tenant_isolation ON behaviour_categories
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_incidents (standard)
ALTER TABLE behaviour_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_incidents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_incidents_tenant_isolation ON behaviour_incidents;
CREATE POLICY behaviour_incidents_tenant_isolation ON behaviour_incidents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_incident_participants (standard)
ALTER TABLE behaviour_incident_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_incident_participants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_incident_participants_tenant_isolation ON behaviour_incident_participants;
CREATE POLICY behaviour_incident_participants_tenant_isolation ON behaviour_incident_participants
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_description_templates (standard)
ALTER TABLE behaviour_description_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_description_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_description_templates_tenant_isolation ON behaviour_description_templates;
CREATE POLICY behaviour_description_templates_tenant_isolation ON behaviour_description_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_entity_history (standard)
ALTER TABLE behaviour_entity_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_entity_history FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_entity_history_tenant_isolation ON behaviour_entity_history;
CREATE POLICY behaviour_entity_history_tenant_isolation ON behaviour_entity_history
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_tasks (standard)
ALTER TABLE behaviour_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_tasks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_tasks_tenant_isolation ON behaviour_tasks;
CREATE POLICY behaviour_tasks_tenant_isolation ON behaviour_tasks
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_parent_acknowledgements (standard)
ALTER TABLE behaviour_parent_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_parent_acknowledgements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_parent_acknowledgements_tenant_isolation ON behaviour_parent_acknowledgements;
CREATE POLICY behaviour_parent_acknowledgements_tenant_isolation ON behaviour_parent_acknowledgements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_sanctions (standard)
ALTER TABLE behaviour_sanctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_sanctions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_sanctions_tenant_isolation ON behaviour_sanctions;
CREATE POLICY behaviour_sanctions_tenant_isolation ON behaviour_sanctions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_appeals (standard)
ALTER TABLE behaviour_appeals ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_appeals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_appeals_tenant_isolation ON behaviour_appeals;
CREATE POLICY behaviour_appeals_tenant_isolation ON behaviour_appeals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_amendment_notices (standard)
ALTER TABLE behaviour_amendment_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_amendment_notices FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_amendment_notices_tenant_isolation ON behaviour_amendment_notices;
CREATE POLICY behaviour_amendment_notices_tenant_isolation ON behaviour_amendment_notices
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_exclusion_cases (standard)
ALTER TABLE behaviour_exclusion_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_exclusion_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_exclusion_cases_tenant_isolation ON behaviour_exclusion_cases;
CREATE POLICY behaviour_exclusion_cases_tenant_isolation ON behaviour_exclusion_cases
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_attachments (standard)
ALTER TABLE behaviour_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_attachments_tenant_isolation ON behaviour_attachments;
CREATE POLICY behaviour_attachments_tenant_isolation ON behaviour_attachments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_interventions (standard)
ALTER TABLE behaviour_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_interventions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_interventions_tenant_isolation ON behaviour_interventions;
CREATE POLICY behaviour_interventions_tenant_isolation ON behaviour_interventions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_intervention_incidents (standard)
ALTER TABLE behaviour_intervention_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_intervention_incidents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_intervention_incidents_tenant_isolation ON behaviour_intervention_incidents;
CREATE POLICY behaviour_intervention_incidents_tenant_isolation ON behaviour_intervention_incidents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_intervention_reviews (standard)
ALTER TABLE behaviour_intervention_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_intervention_reviews FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_intervention_reviews_tenant_isolation ON behaviour_intervention_reviews;
CREATE POLICY behaviour_intervention_reviews_tenant_isolation ON behaviour_intervention_reviews
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_recognition_awards (standard)
ALTER TABLE behaviour_recognition_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_recognition_awards FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_recognition_awards_tenant_isolation ON behaviour_recognition_awards;
CREATE POLICY behaviour_recognition_awards_tenant_isolation ON behaviour_recognition_awards
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_award_types (standard)
ALTER TABLE behaviour_award_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_award_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_award_types_tenant_isolation ON behaviour_award_types;
CREATE POLICY behaviour_award_types_tenant_isolation ON behaviour_award_types
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_house_teams (standard)
ALTER TABLE behaviour_house_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_house_teams FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_house_teams_tenant_isolation ON behaviour_house_teams;
CREATE POLICY behaviour_house_teams_tenant_isolation ON behaviour_house_teams
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_house_memberships (standard)
ALTER TABLE behaviour_house_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_house_memberships FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_house_memberships_tenant_isolation ON behaviour_house_memberships;
CREATE POLICY behaviour_house_memberships_tenant_isolation ON behaviour_house_memberships
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_policy_rules (standard)
ALTER TABLE behaviour_policy_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_policy_rules FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_policy_rules_tenant_isolation ON behaviour_policy_rules;
CREATE POLICY behaviour_policy_rules_tenant_isolation ON behaviour_policy_rules
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_policy_rule_actions (standard)
ALTER TABLE behaviour_policy_rule_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_policy_rule_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_policy_rule_actions_tenant_isolation ON behaviour_policy_rule_actions;
CREATE POLICY behaviour_policy_rule_actions_tenant_isolation ON behaviour_policy_rule_actions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_policy_rule_versions (standard)
ALTER TABLE behaviour_policy_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_policy_rule_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_policy_rule_versions_tenant_isolation ON behaviour_policy_rule_versions;
CREATE POLICY behaviour_policy_rule_versions_tenant_isolation ON behaviour_policy_rule_versions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_policy_evaluations (standard)
ALTER TABLE behaviour_policy_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_policy_evaluations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_policy_evaluations_tenant_isolation ON behaviour_policy_evaluations;
CREATE POLICY behaviour_policy_evaluations_tenant_isolation ON behaviour_policy_evaluations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_policy_action_executions (standard)
ALTER TABLE behaviour_policy_action_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_policy_action_executions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_policy_action_executions_tenant_isolation ON behaviour_policy_action_executions;
CREATE POLICY behaviour_policy_action_executions_tenant_isolation ON behaviour_policy_action_executions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_alerts (standard)
ALTER TABLE behaviour_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_alerts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_alerts_tenant_isolation ON behaviour_alerts;
CREATE POLICY behaviour_alerts_tenant_isolation ON behaviour_alerts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_alert_recipients (standard)
ALTER TABLE behaviour_alert_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_alert_recipients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_alert_recipients_tenant_isolation ON behaviour_alert_recipients;
CREATE POLICY behaviour_alert_recipients_tenant_isolation ON behaviour_alert_recipients
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_documents (standard)
ALTER TABLE behaviour_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_documents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_documents_tenant_isolation ON behaviour_documents;
CREATE POLICY behaviour_documents_tenant_isolation ON behaviour_documents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_document_templates (standard)
ALTER TABLE behaviour_document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_document_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_document_templates_tenant_isolation ON behaviour_document_templates;
CREATE POLICY behaviour_document_templates_tenant_isolation ON behaviour_document_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_guardian_restrictions (standard)
ALTER TABLE behaviour_guardian_restrictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_guardian_restrictions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_guardian_restrictions_tenant_isolation ON behaviour_guardian_restrictions;
CREATE POLICY behaviour_guardian_restrictions_tenant_isolation ON behaviour_guardian_restrictions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_publication_approvals (standard)
ALTER TABLE behaviour_publication_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_publication_approvals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_publication_approvals_tenant_isolation ON behaviour_publication_approvals;
CREATE POLICY behaviour_publication_approvals_tenant_isolation ON behaviour_publication_approvals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- behaviour_legal_holds (standard)
ALTER TABLE behaviour_legal_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_legal_holds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS behaviour_legal_holds_tenant_isolation ON behaviour_legal_holds;
CREATE POLICY behaviour_legal_holds_tenant_isolation ON behaviour_legal_holds
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- safeguarding_concerns (standard)
ALTER TABLE safeguarding_concerns ENABLE ROW LEVEL SECURITY;
ALTER TABLE safeguarding_concerns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS safeguarding_concerns_tenant_isolation ON safeguarding_concerns;
CREATE POLICY safeguarding_concerns_tenant_isolation ON safeguarding_concerns
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- safeguarding_actions (standard)
ALTER TABLE safeguarding_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE safeguarding_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS safeguarding_actions_tenant_isolation ON safeguarding_actions;
CREATE POLICY safeguarding_actions_tenant_isolation ON safeguarding_actions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- safeguarding_concern_incidents (standard)
ALTER TABLE safeguarding_concern_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE safeguarding_concern_incidents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS safeguarding_concern_incidents_tenant_isolation ON safeguarding_concern_incidents;
CREATE POLICY safeguarding_concern_incidents_tenant_isolation ON safeguarding_concern_incidents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- safeguarding_break_glass_grants (standard)
ALTER TABLE safeguarding_break_glass_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE safeguarding_break_glass_grants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS safeguarding_break_glass_grants_tenant_isolation ON safeguarding_break_glass_grants;
CREATE POLICY safeguarding_break_glass_grants_tenant_isolation ON safeguarding_break_glass_grants
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- Pastoral Care RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260327200000_add_pastoral_care_tables/post_migrate.sql
-- Note: pastoral_concerns and cp_records use non-standard policies (tiered access).

-- pastoral_concern_versions (standard)
ALTER TABLE pastoral_concern_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_concern_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_concern_versions_tenant_isolation ON pastoral_concern_versions;
CREATE POLICY pastoral_concern_versions_tenant_isolation ON pastoral_concern_versions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- cp_access_grants (standard)
ALTER TABLE cp_access_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_access_grants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cp_access_grants_tenant_isolation ON cp_access_grants;
CREATE POLICY cp_access_grants_tenant_isolation ON cp_access_grants
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_cases (standard)
ALTER TABLE pastoral_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_cases FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_cases_tenant_isolation ON pastoral_cases;
CREATE POLICY pastoral_cases_tenant_isolation ON pastoral_cases
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_case_students (standard)
ALTER TABLE pastoral_case_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_case_students FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_case_students_tenant_isolation ON pastoral_case_students;
CREATE POLICY pastoral_case_students_tenant_isolation ON pastoral_case_students
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_interventions (standard)
ALTER TABLE pastoral_interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_interventions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_interventions_tenant_isolation ON pastoral_interventions;
CREATE POLICY pastoral_interventions_tenant_isolation ON pastoral_interventions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_intervention_actions (standard)
ALTER TABLE pastoral_intervention_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_intervention_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_intervention_actions_tenant_isolation ON pastoral_intervention_actions;
CREATE POLICY pastoral_intervention_actions_tenant_isolation ON pastoral_intervention_actions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_intervention_progress (standard)
ALTER TABLE pastoral_intervention_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_intervention_progress FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_intervention_progress_tenant_isolation ON pastoral_intervention_progress;
CREATE POLICY pastoral_intervention_progress_tenant_isolation ON pastoral_intervention_progress
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_referrals (standard)
ALTER TABLE pastoral_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_referrals FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_referrals_tenant_isolation ON pastoral_referrals;
CREATE POLICY pastoral_referrals_tenant_isolation ON pastoral_referrals
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_referral_recommendations (standard)
ALTER TABLE pastoral_referral_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_referral_recommendations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_referral_recommendations_tenant_isolation ON pastoral_referral_recommendations;
CREATE POLICY pastoral_referral_recommendations_tenant_isolation ON pastoral_referral_recommendations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sst_members (standard)
ALTER TABLE sst_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst_members FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sst_members_tenant_isolation ON sst_members;
CREATE POLICY sst_members_tenant_isolation ON sst_members
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sst_meetings (standard)
ALTER TABLE sst_meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst_meetings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sst_meetings_tenant_isolation ON sst_meetings;
CREATE POLICY sst_meetings_tenant_isolation ON sst_meetings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sst_meeting_agenda_items (standard)
ALTER TABLE sst_meeting_agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst_meeting_agenda_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sst_meeting_agenda_items_tenant_isolation ON sst_meeting_agenda_items;
CREATE POLICY sst_meeting_agenda_items_tenant_isolation ON sst_meeting_agenda_items
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- sst_meeting_actions (standard)
ALTER TABLE sst_meeting_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sst_meeting_actions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sst_meeting_actions_tenant_isolation ON sst_meeting_actions;
CREATE POLICY sst_meeting_actions_tenant_isolation ON sst_meeting_actions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_parent_contacts (standard)
ALTER TABLE pastoral_parent_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_parent_contacts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_parent_contacts_tenant_isolation ON pastoral_parent_contacts;
CREATE POLICY pastoral_parent_contacts_tenant_isolation ON pastoral_parent_contacts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_events (standard)
ALTER TABLE pastoral_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_events_tenant_isolation ON pastoral_events;
CREATE POLICY pastoral_events_tenant_isolation ON pastoral_events
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_dsar_reviews (standard)
ALTER TABLE pastoral_dsar_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_dsar_reviews FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_dsar_reviews_tenant_isolation ON pastoral_dsar_reviews;
CREATE POLICY pastoral_dsar_reviews_tenant_isolation ON pastoral_dsar_reviews
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- critical_incidents (standard)
ALTER TABLE critical_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE critical_incidents FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS critical_incidents_tenant_isolation ON critical_incidents;
CREATE POLICY critical_incidents_tenant_isolation ON critical_incidents
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- critical_incident_affected (standard)
ALTER TABLE critical_incident_affected ENABLE ROW LEVEL SECURITY;
ALTER TABLE critical_incident_affected FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS critical_incident_affected_tenant_isolation ON critical_incident_affected;
CREATE POLICY critical_incident_affected_tenant_isolation ON critical_incident_affected
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- student_checkins (standard)
ALTER TABLE student_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_checkins FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS student_checkins_tenant_isolation ON student_checkins;
CREATE POLICY student_checkins_tenant_isolation ON student_checkins
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- pastoral_concerns (tiered access — non-standard: tier < 3 OR active cp_access_grants)
ALTER TABLE pastoral_concerns ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_concerns FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_concerns_tiered_access ON pastoral_concerns;
CREATE POLICY pastoral_concerns_tiered_access ON pastoral_concerns
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND (
      tier < 3
      OR EXISTS (
        SELECT 1 FROM cp_access_grants
        WHERE cp_access_grants.tenant_id = pastoral_concerns.tenant_id
          AND cp_access_grants.user_id = current_setting('app.current_user_id')::uuid
          AND cp_access_grants.revoked_at IS NULL
      )
    )
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::uuid
  );

-- cp_records (CP-access-gated — requires active cp_access_grants for current user)
ALTER TABLE cp_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE cp_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cp_records_tenant_and_grant ON cp_records;
CREATE POLICY cp_records_tenant_and_grant ON cp_records
  USING (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM cp_access_grants
      WHERE cp_access_grants.tenant_id = cp_records.tenant_id
        AND cp_access_grants.user_id = current_setting('app.current_user_id')::uuid
        AND cp_access_grants.revoked_at IS NULL
    )
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant_id')::uuid
    AND EXISTS (
      SELECT 1 FROM cp_access_grants
      WHERE cp_access_grants.tenant_id = cp_records.tenant_id
        AND cp_access_grants.user_id = current_setting('app.current_user_id')::uuid
        AND cp_access_grants.revoked_at IS NULL
    )
  );

-- =============================================================
-- Pastoral Care — Involved Students RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260328110000_add_pastoral_concern_involved_students/post_migrate.sql

-- pastoral_concern_involved_students (standard)
ALTER TABLE pastoral_concern_involved_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE pastoral_concern_involved_students FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pastoral_concern_involved_students_tenant_isolation ON pastoral_concern_involved_students;
CREATE POLICY pastoral_concern_involved_students_tenant_isolation ON pastoral_concern_involved_students
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- Regulatory Portal RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260328200000_add_regulatory_portal_tables/post_migrate.sql

-- regulatory_calendar_events (standard)
ALTER TABLE regulatory_calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_calendar_events FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS regulatory_calendar_events_tenant_isolation ON regulatory_calendar_events;
CREATE POLICY regulatory_calendar_events_tenant_isolation ON regulatory_calendar_events
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- regulatory_submissions (standard)
ALTER TABLE regulatory_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_submissions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS regulatory_submissions_tenant_isolation ON regulatory_submissions;
CREATE POLICY regulatory_submissions_tenant_isolation ON regulatory_submissions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- tusla_absence_code_mappings (standard)
ALTER TABLE tusla_absence_code_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tusla_absence_code_mappings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tusla_absence_code_mappings_tenant_isolation ON tusla_absence_code_mappings;
CREATE POLICY tusla_absence_code_mappings_tenant_isolation ON tusla_absence_code_mappings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- reduced_school_days (standard)
ALTER TABLE reduced_school_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE reduced_school_days FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reduced_school_days_tenant_isolation ON reduced_school_days;
CREATE POLICY reduced_school_days_tenant_isolation ON reduced_school_days
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- des_subject_code_mappings (standard)
ALTER TABLE des_subject_code_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE des_subject_code_mappings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS des_subject_code_mappings_tenant_isolation ON des_subject_code_mappings;
CREATE POLICY des_subject_code_mappings_tenant_isolation ON des_subject_code_mappings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ppod_student_mappings (standard)
ALTER TABLE ppod_student_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppod_student_mappings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppod_student_mappings_tenant_isolation ON ppod_student_mappings;
CREATE POLICY ppod_student_mappings_tenant_isolation ON ppod_student_mappings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ppod_sync_logs (standard)
ALTER TABLE ppod_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppod_sync_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppod_sync_logs_tenant_isolation ON ppod_sync_logs;
CREATE POLICY ppod_sync_logs_tenant_isolation ON ppod_sync_logs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ppod_cba_sync_records (standard)
ALTER TABLE ppod_cba_sync_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE ppod_cba_sync_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ppod_cba_sync_records_tenant_isolation ON ppod_cba_sync_records;
CREATE POLICY ppod_cba_sync_records_tenant_isolation ON ppod_cba_sync_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- inter_school_transfers (standard)
ALTER TABLE inter_school_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE inter_school_transfers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inter_school_transfers_tenant_isolation ON inter_school_transfers;
CREATE POLICY inter_school_transfers_tenant_isolation ON inter_school_transfers
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- GDPR Tokenisation RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260329000000_add_gdpr_tokenisation_tables/post_migrate.sql

-- gdpr_anonymisation_tokens (standard)
ALTER TABLE gdpr_anonymisation_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_anonymisation_tokens FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gdpr_anonymisation_tokens_tenant_isolation ON gdpr_anonymisation_tokens;
CREATE POLICY gdpr_anonymisation_tokens_tenant_isolation ON gdpr_anonymisation_tokens
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- gdpr_token_usage_log (standard)
ALTER TABLE gdpr_token_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE gdpr_token_usage_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gdpr_token_usage_log_tenant_isolation ON gdpr_token_usage_log;
CREATE POLICY gdpr_token_usage_log_tenant_isolation ON gdpr_token_usage_log
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- Consent Records RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260329100000_add_consent_records/post_migrate.sql

-- consent_records (standard)
ALTER TABLE consent_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS consent_records_tenant_isolation ON consent_records;
CREATE POLICY consent_records_tenant_isolation ON consent_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- GDPR Legal & Privacy Infrastructure RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260329110000_add_gdpr_legal_privacy_infrastructure/post_migrate.sql

-- data_processing_agreements (standard)
ALTER TABLE data_processing_agreements ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_processing_agreements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS data_processing_agreements_tenant_isolation ON data_processing_agreements;
CREATE POLICY data_processing_agreements_tenant_isolation ON data_processing_agreements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- privacy_notice_versions (standard)
ALTER TABLE privacy_notice_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_notice_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS privacy_notice_versions_tenant_isolation ON privacy_notice_versions;
CREATE POLICY privacy_notice_versions_tenant_isolation ON privacy_notice_versions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- privacy_notice_acknowledgements (standard)
ALTER TABLE privacy_notice_acknowledgements ENABLE ROW LEVEL SECURITY;
ALTER TABLE privacy_notice_acknowledgements FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS privacy_notice_acknowledgements_tenant_isolation ON privacy_notice_acknowledgements;
CREATE POLICY privacy_notice_acknowledgements_tenant_isolation ON privacy_notice_acknowledgements
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- Staff Wellbeing RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260328100000_add_staff_wellbeing_tables/post_migrate.sql
-- NOTE: survey_responses and survey_participation_tokens intentionally have NO RLS
-- and NO tenant_id — anonymity by architecture (see DZ-27).

-- staff_surveys (standard)
ALTER TABLE staff_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_surveys FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_surveys_tenant_isolation ON staff_surveys;
CREATE POLICY staff_surveys_tenant_isolation ON staff_surveys
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- survey_questions (standard)
ALTER TABLE survey_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE survey_questions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS survey_questions_tenant_isolation ON survey_questions;
CREATE POLICY survey_questions_tenant_isolation ON survey_questions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- Tenant Module Settings RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260331000000_add_tenant_module_settings_table/post_migrate.sql

-- tenant_module_settings (standard)
ALTER TABLE tenant_module_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_module_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_module_settings_tenant_isolation ON tenant_module_settings;
CREATE POLICY tenant_module_settings_tenant_isolation ON tenant_module_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- GDPR Retention & AI Processing RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260329120000_add_retention_policy_tables/migration.sql
-- Defined in: packages/prisma/migrations/20260329120000_add_ai_processing_logs/migration.sql

-- retention_policies (dual — nullable tenant_id: platform defaults have NULL)
ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_policies FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retention_policies_tenant_isolation ON retention_policies;
CREATE POLICY retention_policies_tenant_isolation ON retention_policies
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  )
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- retention_holds (standard)
ALTER TABLE retention_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_holds FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retention_holds_tenant_isolation ON retention_holds;
CREATE POLICY retention_holds_tenant_isolation ON retention_holds
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ai_processing_logs (standard)
ALTER TABLE ai_processing_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_processing_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_processing_logs_tenant_isolation ON ai_processing_logs;
CREATE POLICY ai_processing_logs_tenant_isolation ON ai_processing_logs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- =============================================================
-- Cron Execution Logs RLS Policies
-- =============================================================
-- Defined in: packages/prisma/migrations/20260402080000_add_reliability_r13_r18_r19_r23/post_migrate.sql

-- cron_execution_logs (nullable tenant_id — cross-tenant cron jobs)
ALTER TABLE cron_execution_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_execution_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_execution_logs_tenant_isolation ON cron_execution_logs;
CREATE POLICY cron_execution_logs_tenant_isolation ON cron_execution_logs
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  );

-- ─── Teacher Grading Weights ─────────────────────────────────────────────────
ALTER TABLE teacher_grading_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE teacher_grading_weights FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS teacher_grading_weights_tenant_isolation ON teacher_grading_weights;
CREATE POLICY teacher_grading_weights_tenant_isolation ON teacher_grading_weights
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Assessment Unlock Requests ──────────────────────────────────────────────
ALTER TABLE assessment_unlock_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_unlock_requests FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS assessment_unlock_requests_tenant_isolation ON assessment_unlock_requests;
CREATE POLICY assessment_unlock_requests_tenant_isolation ON assessment_unlock_requests
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Grade Edit Audits ───────────────────────────────────────────────────────
ALTER TABLE grade_edit_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE grade_edit_audits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS grade_edit_audits_tenant_isolation ON grade_edit_audits;
CREATE POLICY grade_edit_audits_tenant_isolation ON grade_edit_audits
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Subject Period Weights ─────────────────────────────────────────────────
ALTER TABLE subject_period_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE subject_period_weights FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS subject_period_weights_tenant_isolation ON subject_period_weights;
CREATE POLICY subject_period_weights_tenant_isolation ON subject_period_weights
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Period Year Weights ────────────────────────────────────────────────────
ALTER TABLE period_year_weights ENABLE ROW LEVEL SECURITY;
ALTER TABLE period_year_weights FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS period_year_weights_tenant_isolation ON period_year_weights;
CREATE POLICY period_year_weights_tenant_isolation ON period_year_weights
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Admission Overrides ────────────────────────────────────────────────────
ALTER TABLE admission_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE admission_overrides FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admission_overrides_tenant_isolation ON admission_overrides;
CREATE POLICY admission_overrides_tenant_isolation ON admission_overrides
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Admissions Payment Events ──────────────────────────────────────────────
ALTER TABLE admissions_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admissions_payment_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admissions_payment_events_tenant_isolation ON admissions_payment_events;
CREATE POLICY admissions_payment_events_tenant_isolation ON admissions_payment_events
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── New Inbox / Messaging (Wave 1, Impl 01) ────────────────────────────────

-- Conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_tenant_isolation ON conversations;
CREATE POLICY conversations_tenant_isolation ON conversations
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Conversation Participants
ALTER TABLE conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_participants FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversation_participants_tenant_isolation ON conversation_participants;
CREATE POLICY conversation_participants_tenant_isolation ON conversation_participants
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Messages
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_tenant_isolation ON messages;
CREATE POLICY messages_tenant_isolation ON messages
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Message Reads
ALTER TABLE message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_reads_tenant_isolation ON message_reads;
CREATE POLICY message_reads_tenant_isolation ON message_reads
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Message Edits
ALTER TABLE message_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_edits FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_edits_tenant_isolation ON message_edits;
CREATE POLICY message_edits_tenant_isolation ON message_edits
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Message Attachments
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_attachments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_attachments_tenant_isolation ON message_attachments;
CREATE POLICY message_attachments_tenant_isolation ON message_attachments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Broadcast Audience Definitions
ALTER TABLE broadcast_audience_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_audience_definitions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS broadcast_audience_definitions_tenant_isolation ON broadcast_audience_definitions;
CREATE POLICY broadcast_audience_definitions_tenant_isolation ON broadcast_audience_definitions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Broadcast Audience Snapshots
ALTER TABLE broadcast_audience_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE broadcast_audience_snapshots FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS broadcast_audience_snapshots_tenant_isolation ON broadcast_audience_snapshots;
CREATE POLICY broadcast_audience_snapshots_tenant_isolation ON broadcast_audience_snapshots
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Saved Audiences
ALTER TABLE saved_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_audiences FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS saved_audiences_tenant_isolation ON saved_audiences;
CREATE POLICY saved_audiences_tenant_isolation ON saved_audiences
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Tenant Messaging Policy (role-pair grid)
ALTER TABLE tenant_messaging_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_messaging_policy FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_messaging_policy_tenant_isolation ON tenant_messaging_policy;
CREATE POLICY tenant_messaging_policy_tenant_isolation ON tenant_messaging_policy
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Tenant Settings Inbox
ALTER TABLE tenant_settings_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_settings_inbox FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_settings_inbox_tenant_isolation ON tenant_settings_inbox;
CREATE POLICY tenant_settings_inbox_tenant_isolation ON tenant_settings_inbox
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Safeguarding Keywords
ALTER TABLE safeguarding_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE safeguarding_keywords FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS safeguarding_keywords_tenant_isolation ON safeguarding_keywords;
CREATE POLICY safeguarding_keywords_tenant_isolation ON safeguarding_keywords
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Message Flags
ALTER TABLE message_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_flags FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS message_flags_tenant_isolation ON message_flags;
CREATE POLICY message_flags_tenant_isolation ON message_flags
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Oversight Access Log
ALTER TABLE oversight_access_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE oversight_access_log FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS oversight_access_log_tenant_isolation ON oversight_access_log;
CREATE POLICY oversight_access_log_tenant_isolation ON oversight_access_log
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Leave & Cover (2026-04-14) ─────────────────────────────────────────────

-- Leave Types (dual-policy: NULL tenant_id = system defaults)
ALTER TABLE leave_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leave_types_tenant_isolation ON leave_types;
CREATE POLICY leave_types_tenant_isolation ON leave_types
  USING (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  )
  WITH CHECK (
    tenant_id IS NULL
    OR tenant_id = current_setting('app.current_tenant_id')::uuid
  );

-- Leave Requests
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leave_requests_tenant_isolation ON leave_requests;
CREATE POLICY leave_requests_tenant_isolation ON leave_requests
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Substitution Offers
ALTER TABLE substitution_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE substitution_offers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS substitution_offers_tenant_isolation ON substitution_offers;
CREATE POLICY substitution_offers_tenant_isolation ON substitution_offers
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Tenant Scheduling Settings
ALTER TABLE tenant_scheduling_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_scheduling_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_scheduling_settings_tenant_isolation ON tenant_scheduling_settings;
CREATE POLICY tenant_scheduling_settings_tenant_isolation ON tenant_scheduling_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
