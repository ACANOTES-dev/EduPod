-- Wellbeing Rebuild — Impl 01 post-migrate: RLS policies for the two new
-- tenant-scoped tables. Idempotent. DROP POLICY IF EXISTS + CREATE POLICY.

-- ─── tenant_ai_flags (standard tenant isolation) ────────────────────────────

ALTER TABLE tenant_ai_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_ai_flags FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_ai_flags_tenant_isolation ON tenant_ai_flags;
CREATE POLICY tenant_ai_flags_tenant_isolation ON tenant_ai_flags
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── tenant_notification_preferences (standard tenant isolation) ────────────

ALTER TABLE tenant_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_notification_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_notification_preferences_tenant_isolation ON tenant_notification_preferences;
CREATE POLICY tenant_notification_preferences_tenant_isolation ON tenant_notification_preferences
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
