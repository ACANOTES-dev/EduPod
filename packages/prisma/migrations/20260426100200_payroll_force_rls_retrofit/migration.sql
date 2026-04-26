-- Payroll Overhaul (Wave 1) — FORCE RLS retrofit for 10 tables
--
-- The 2026-04-25 four-agent payroll audit found ten tables introduced by
-- 20260324150000_payroll_world_class missing the canonical
-- `FORCE ROW LEVEL SECURITY` form inline in their migration. RLS WAS
-- enabled (so non-owner connections were correctly isolated), but
-- `FORCE` was missing — meaning the table-owning role could bypass the
-- policy. The companion `post_migrate.sql` for that migration corrected
-- the form, but production status was unverified.
--
-- This retrofit re-issues the canonical policy for each table with both
-- ENABLE and FORCE. Every statement is idempotent — DROP POLICY IF EXISTS
-- followed by CREATE POLICY — so it is safe on a fresh DB, on an
-- already-FORCED DB, and on a half-FORCED DB. ALTER TABLE FORCE is a
-- no-op on already-FORCED tables but explicit-is-better.
--
-- DO NOT run mid-business-hours: the DROP-then-CREATE leaves a
-- microsecond window where the table has no policy. RLS stays ENABLED
-- so all access is blocked during that window — the gap is harmless
-- under normal traffic, but a coordinated low-traffic window is the
-- defensive choice.

-- ─── staff_attendance_records ─────────────────────────────────────────
ALTER TABLE staff_attendance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_attendance_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_attendance_records_tenant_isolation ON staff_attendance_records;
CREATE POLICY staff_attendance_records_tenant_isolation ON staff_attendance_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── class_delivery_records ───────────────────────────────────────────
ALTER TABLE class_delivery_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_delivery_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS class_delivery_records_tenant_isolation ON class_delivery_records;
CREATE POLICY class_delivery_records_tenant_isolation ON class_delivery_records
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── payroll_adjustments ──────────────────────────────────────────────
ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_adjustments FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_adjustments_tenant_isolation ON payroll_adjustments;
CREATE POLICY payroll_adjustments_tenant_isolation ON payroll_adjustments
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── payroll_export_templates ─────────────────────────────────────────
ALTER TABLE payroll_export_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_export_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_export_templates_tenant_isolation ON payroll_export_templates;
CREATE POLICY payroll_export_templates_tenant_isolation ON payroll_export_templates
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── payroll_export_logs ──────────────────────────────────────────────
ALTER TABLE payroll_export_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_export_logs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_export_logs_tenant_isolation ON payroll_export_logs;
CREATE POLICY payroll_export_logs_tenant_isolation ON payroll_export_logs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── payroll_approval_configs ─────────────────────────────────────────
ALTER TABLE payroll_approval_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_approval_configs FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_approval_configs_tenant_isolation ON payroll_approval_configs;
CREATE POLICY payroll_approval_configs_tenant_isolation ON payroll_approval_configs
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── payroll_allowance_types ──────────────────────────────────────────
ALTER TABLE payroll_allowance_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_allowance_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_allowance_types_tenant_isolation ON payroll_allowance_types;
CREATE POLICY payroll_allowance_types_tenant_isolation ON payroll_allowance_types
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── staff_allowances ─────────────────────────────────────────────────
ALTER TABLE staff_allowances ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_allowances FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_allowances_tenant_isolation ON staff_allowances;
CREATE POLICY staff_allowances_tenant_isolation ON staff_allowances
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── payroll_one_off_items ────────────────────────────────────────────
ALTER TABLE payroll_one_off_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_one_off_items FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payroll_one_off_items_tenant_isolation ON payroll_one_off_items;
CREATE POLICY payroll_one_off_items_tenant_isolation ON payroll_one_off_items
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── staff_recurring_deductions ───────────────────────────────────────
ALTER TABLE staff_recurring_deductions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_recurring_deductions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS staff_recurring_deductions_tenant_isolation ON staff_recurring_deductions;
CREATE POLICY staff_recurring_deductions_tenant_isolation ON staff_recurring_deductions
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
