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
