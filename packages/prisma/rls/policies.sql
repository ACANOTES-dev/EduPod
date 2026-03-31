-- =============================================================
-- RLS Policy Template — School Operating System
-- =============================================================
-- Every tenant-scoped table gets this pattern.
-- Actual policies are created in post_migrate.sql files
-- alongside their Prisma migration.
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
