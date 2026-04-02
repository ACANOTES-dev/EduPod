-- RLS policy for cron_execution_logs (R-23)
-- Uses nullable tenant_id: cross-tenant crons have NULL tenant_id,
-- per-tenant crons have a specific tenant_id.

ALTER TABLE "cron_execution_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "cron_execution_logs" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cron_execution_logs_tenant_isolation ON cron_execution_logs;
CREATE POLICY cron_execution_logs_tenant_isolation ON cron_execution_logs
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::uuid);

-- Trigger for updated_at (not needed — cron_execution_logs is append-only with completed_at)
