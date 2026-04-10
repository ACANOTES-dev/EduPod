-- Wave 3 — admissions Stripe checkout + webhook (Impl 06).
-- Installs tenant isolation for the new admissions_payment_events table.
-- Matches the canonical entry in packages/prisma/rls/policies.sql.

ALTER TABLE admissions_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE admissions_payment_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admissions_payment_events_tenant_isolation ON admissions_payment_events;
CREATE POLICY admissions_payment_events_tenant_isolation ON admissions_payment_events
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
