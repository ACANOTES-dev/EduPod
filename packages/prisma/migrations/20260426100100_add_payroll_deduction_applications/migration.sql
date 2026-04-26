-- Payroll Overhaul (Wave 1) — idempotent recurring-deduction application
--
-- Records each application of a `staff_recurring_deduction` to a particular
-- payroll run/entry. The two-phase shape (`applied_at` for the schedule,
-- `committed_at` for the balance decrement) lets requestFinalisation plan
-- applications safely (idempotent via the unique key) and finaliseAtomic
-- decrement balances exactly once. See payrollnew/PLAN.md §5.
--
-- The unique key is on (payroll_run_id, staff_recurring_deduction_id) —
-- not (payroll_entry_id, staff_recurring_deduction_id) — because a single
-- recurring deduction belongs to a single staff member, so the entry +
-- deduction pair is implicit. This shape lets the finaliser look up "have
-- we already applied deduction X to run Y" without joining via the entry.

-- CreateTable
CREATE TABLE "payroll_deduction_applications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "payroll_run_id" UUID NOT NULL,
    "payroll_entry_id" UUID NOT NULL,
    "staff_recurring_deduction_id" UUID NOT NULL,
    "applied_amount" DECIMAL(12,2) NOT NULL,
    "applied_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "committed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_deduction_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payroll_deduction_applications_payroll_run_id_staff_recurri_key"
  ON "payroll_deduction_applications" ("payroll_run_id", "staff_recurring_deduction_id");

CREATE INDEX "idx_deduction_apps_run"
  ON "payroll_deduction_applications" ("tenant_id", "payroll_run_id");

CREATE INDEX "idx_deduction_apps_entry"
  ON "payroll_deduction_applications" ("tenant_id", "payroll_entry_id");

CREATE INDEX "idx_deduction_apps_deduction"
  ON "payroll_deduction_applications" ("tenant_id", "staff_recurring_deduction_id");

-- AddForeignKey
ALTER TABLE "payroll_deduction_applications"
  ADD CONSTRAINT "payroll_deduction_applications_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_deduction_applications"
  ADD CONSTRAINT "payroll_deduction_applications_payroll_run_id_fkey"
  FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_deduction_applications"
  ADD CONSTRAINT "payroll_deduction_applications_payroll_entry_id_fkey"
  FOREIGN KEY ("payroll_entry_id") REFERENCES "payroll_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll_deduction_applications"
  ADD CONSTRAINT "payroll_deduction_applications_staff_recurring_deduction_id_fkey"
  FOREIGN KEY ("staff_recurring_deduction_id") REFERENCES "staff_recurring_deductions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
