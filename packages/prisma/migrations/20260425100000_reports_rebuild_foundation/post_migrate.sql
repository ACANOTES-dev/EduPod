-- Reports Rebuild — Impl 01 post-migrate: RLS policies for the five new
-- tenant-scoped tables. Idempotent. DROP POLICY IF EXISTS + CREATE POLICY.
--
-- Mirrored into packages/prisma/rls/policies.sql (the canonical catalogue).

-- ─── saved_report_drafts ────────────────────────────────────────────────────

ALTER TABLE saved_report_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_report_drafts FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS saved_report_drafts_tenant_isolation ON saved_report_drafts;
CREATE POLICY saved_report_drafts_tenant_isolation ON saved_report_drafts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── scheduled_report_runs ──────────────────────────────────────────────────

ALTER TABLE scheduled_report_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduled_report_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scheduled_report_runs_tenant_isolation ON scheduled_report_runs;
CREATE POLICY scheduled_report_runs_tenant_isolation ON scheduled_report_runs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── report_alert_runs ──────────────────────────────────────────────────────

ALTER TABLE report_alert_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_alert_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_alert_runs_tenant_isolation ON report_alert_runs;
CREATE POLICY report_alert_runs_tenant_isolation ON report_alert_runs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── report_share_log ───────────────────────────────────────────────────────

ALTER TABLE report_share_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_share_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_share_log_tenant_isolation ON report_share_log;
CREATE POLICY report_share_log_tenant_isolation ON report_share_log
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── reports_kpi_tenant_preferences ─────────────────────────────────────────

ALTER TABLE reports_kpi_tenant_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports_kpi_tenant_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reports_kpi_tenant_preferences_tenant_isolation ON reports_kpi_tenant_preferences;
CREATE POLICY reports_kpi_tenant_preferences_tenant_isolation ON reports_kpi_tenant_preferences
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
