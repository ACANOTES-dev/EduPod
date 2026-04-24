-- Phase 9 — Regulatory Safeguarding registers: RLS policies.
-- Idempotent. DROP POLICY IF EXISTS + CREATE POLICY.

-- ─── dlp_register_entries ────────────────────────────────────────────────────

ALTER TABLE dlp_register_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlp_register_entries FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dlp_register_entries_tenant_isolation ON dlp_register_entries;
CREATE POLICY dlp_register_entries_tenant_isolation ON dlp_register_entries
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── staff_vetting_records ──────────────────────────────────────────────────

ALTER TABLE staff_vetting_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_vetting_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_vetting_records_tenant_isolation ON staff_vetting_records;
CREATE POLICY staff_vetting_records_tenant_isolation ON staff_vetting_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── child_protection_reviews ──────────────────────────────────────────────

ALTER TABLE child_protection_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE child_protection_reviews FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS child_protection_reviews_tenant_isolation ON child_protection_reviews;
CREATE POLICY child_protection_reviews_tenant_isolation ON child_protection_reviews
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
