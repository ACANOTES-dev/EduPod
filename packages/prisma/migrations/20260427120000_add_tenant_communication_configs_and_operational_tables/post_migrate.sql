-- =============================================================
-- Communications Overhaul (Impl 01) — RLS Policies
-- =============================================================
-- Eight new tenant-scoped tables, all with FORCE ROW LEVEL
-- SECURITY and the canonical <table>_tenant_isolation policy.
-- Idempotent. DROP POLICY IF EXISTS + CREATE POLICY.

-- ─── tenant_email_configs (standard tenant isolation) ──────────────────────

ALTER TABLE tenant_email_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_email_configs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_email_configs_tenant_isolation ON tenant_email_configs;
CREATE POLICY tenant_email_configs_tenant_isolation ON tenant_email_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── tenant_sms_configs (standard tenant isolation) ────────────────────────

ALTER TABLE tenant_sms_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_sms_configs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_sms_configs_tenant_isolation ON tenant_sms_configs;
CREATE POLICY tenant_sms_configs_tenant_isolation ON tenant_sms_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── tenant_whatsapp_configs (standard tenant isolation) ───────────────────

ALTER TABLE tenant_whatsapp_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_whatsapp_configs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_whatsapp_configs_tenant_isolation ON tenant_whatsapp_configs;
CREATE POLICY tenant_whatsapp_configs_tenant_isolation ON tenant_whatsapp_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── notification_suppression_list (standard tenant isolation) ─────────────

ALTER TABLE notification_suppression_list ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_suppression_list FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_suppression_list_tenant_isolation ON notification_suppression_list;
CREATE POLICY notification_suppression_list_tenant_isolation ON notification_suppression_list
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── tenant_email_domains (standard tenant isolation) ──────────────────────

ALTER TABLE tenant_email_domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_email_domains FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_email_domains_tenant_isolation ON tenant_email_domains;
CREATE POLICY tenant_email_domains_tenant_isolation ON tenant_email_domains
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── whatsapp_templates (standard tenant isolation) ────────────────────────

ALTER TABLE whatsapp_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_templates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_templates_tenant_isolation ON whatsapp_templates;
CREATE POLICY whatsapp_templates_tenant_isolation ON whatsapp_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── whatsapp_service_windows (standard tenant isolation) ──────────────────

ALTER TABLE whatsapp_service_windows ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_service_windows FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS whatsapp_service_windows_tenant_isolation ON whatsapp_service_windows;
CREATE POLICY whatsapp_service_windows_tenant_isolation ON whatsapp_service_windows
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── notification_webhook_events (standard tenant isolation) ───────────────

ALTER TABLE notification_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_webhook_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_webhook_events_tenant_isolation ON notification_webhook_events;
CREATE POLICY notification_webhook_events_tenant_isolation ON notification_webhook_events
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
