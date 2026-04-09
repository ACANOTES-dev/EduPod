-- ============================================================
-- Report Cards Redesign Foundation: RLS Policies for New Tables
-- ============================================================

-- ─── report_comment_windows ──────────────────────────────────────────────────
ALTER TABLE report_comment_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_comment_windows FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_comment_windows_tenant_isolation ON report_comment_windows;
CREATE POLICY report_comment_windows_tenant_isolation ON report_comment_windows
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── report_card_subject_comments ────────────────────────────────────────────
ALTER TABLE report_card_subject_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_subject_comments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_subject_comments_tenant_isolation ON report_card_subject_comments;
CREATE POLICY report_card_subject_comments_tenant_isolation ON report_card_subject_comments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── report_card_overall_comments ────────────────────────────────────────────
ALTER TABLE report_card_overall_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_overall_comments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_overall_comments_tenant_isolation ON report_card_overall_comments;
CREATE POLICY report_card_overall_comments_tenant_isolation ON report_card_overall_comments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── report_card_teacher_requests ────────────────────────────────────────────
ALTER TABLE report_card_teacher_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_teacher_requests FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_teacher_requests_tenant_isolation ON report_card_teacher_requests;
CREATE POLICY report_card_teacher_requests_tenant_isolation ON report_card_teacher_requests
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── report_card_tenant_settings ─────────────────────────────────────────────
ALTER TABLE report_card_tenant_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_card_tenant_settings FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS report_card_tenant_settings_tenant_isolation ON report_card_tenant_settings;
CREATE POLICY report_card_tenant_settings_tenant_isolation ON report_card_tenant_settings
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
