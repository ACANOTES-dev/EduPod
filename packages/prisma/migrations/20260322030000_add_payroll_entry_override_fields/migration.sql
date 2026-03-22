-- Add override fields to payroll_entries
ALTER TABLE "payroll_entries" ADD COLUMN "override_total_pay" DECIMAL(12,2);
ALTER TABLE "payroll_entries" ADD COLUMN "override_note" VARCHAR(1000);
ALTER TABLE "payroll_entries" ADD COLUMN "override_by_user_id" UUID;
ALTER TABLE "payroll_entries" ADD COLUMN "override_at" TIMESTAMPTZ;

-- Add foreign key for override_by_user_id
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_override_by_user_id_fkey" FOREIGN KEY ("override_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
