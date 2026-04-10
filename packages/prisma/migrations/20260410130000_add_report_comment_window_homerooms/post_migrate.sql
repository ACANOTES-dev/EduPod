-- ============================================================
-- RLS for report_comment_window_homerooms
-- ============================================================

ALTER TABLE report_comment_window_homerooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_comment_window_homerooms FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_comment_window_homerooms_tenant_isolation
  ON report_comment_window_homerooms;

CREATE POLICY report_comment_window_homerooms_tenant_isolation
  ON report_comment_window_homerooms
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
