-- Add FORCE ROW LEVEL SECURITY (was missing) and standardize policy name
-- Original migration created ENABLE + policy named "tenant_isolation_policy"
-- This migration adds FORCE and renames to the canonical naming convention
ALTER TABLE attendance_pattern_alerts FORCE ROW LEVEL SECURITY;

-- Drop old non-standard policy name
DROP POLICY IF EXISTS tenant_isolation_policy ON attendance_pattern_alerts;

-- Drop canonical name (idempotent — in case it already exists)
DROP POLICY IF EXISTS attendance_pattern_alerts_tenant_isolation ON attendance_pattern_alerts;

-- Recreate with standard naming convention
CREATE POLICY attendance_pattern_alerts_tenant_isolation ON attendance_pattern_alerts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
