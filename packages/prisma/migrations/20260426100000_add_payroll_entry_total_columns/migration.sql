-- Payroll Overhaul (Wave 1) — entry-level aggregate columns
--
-- Adds the seven NUMERIC(12,2) columns the rebuilt finalisation engine
-- writes per payroll_entry. The pre-existing basic_pay/bonus_pay/total_pay
-- and override_total_pay columns are RETAINED for backwards-compatible
-- dashboard reads — Wave 2 populates BOTH the old and the new sets during
-- finalisation, and Wave 5 plans the deprecation. See payrollnew/PLAN.md
-- §5.
--
-- Defaults are 0 so existing rows do not require a column rewrite at
-- migrate-time; the post_migrate.sql backfill copies historical values
-- into net_pay / gross_pay so dashboards do not display zeros for runs
-- that were finalised before this rebuild.

ALTER TABLE "payroll_entries" ADD COLUMN "gross_pay" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_entries" ADD COLUMN "total_deductions" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_entries" ADD COLUMN "net_pay" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_entries" ADD COLUMN "allowances_total" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_entries" ADD COLUMN "deductions_total" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_entries" ADD COLUMN "adjustments_total" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "payroll_entries" ADD COLUMN "one_off_total" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- Used by Wave 2's finalisation engine + Wave 4's session-generation worker
-- to filter entries by compensation type within a tenant.
CREATE INDEX "idx_payroll_entries_tenant_comp_type"
  ON "payroll_entries" ("tenant_id", "compensation_type");

-- Common payroll list filter: "show me April 2026 runs for this tenant".
-- Replaces a sequential scan of payroll_runs in the dashboard.
CREATE INDEX "idx_payroll_runs_tenant_period"
  ON "payroll_runs" ("tenant_id", "period_year", "period_month");
