-- Payroll Overhaul (Wave 1) — historical entry backfill
--
-- Copies existing total_pay / override_total_pay into net_pay so that
-- runs finalised before this rebuild keep rendering a non-zero net pay
-- on dashboards until Wave 2's calculation engine has had a chance to
-- repopulate the new columns when runs are re-finalised. The backfill
-- only runs on rows where the new columns are still default (0), so it
-- is idempotent and safe to re-run.

UPDATE payroll_entries
SET    net_pay = COALESCE(override_total_pay, total_pay)
WHERE  net_pay = 0
   AND (total_pay IS NOT NULL OR override_total_pay IS NOT NULL);

UPDATE payroll_entries
SET    gross_pay = COALESCE(basic_pay, 0) + COALESCE(bonus_pay, 0)
WHERE  gross_pay = 0
   AND (basic_pay IS NOT NULL OR bonus_pay IS NOT NULL);
