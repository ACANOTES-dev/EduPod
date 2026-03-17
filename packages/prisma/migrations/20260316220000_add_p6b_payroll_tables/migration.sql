-- P6B Payroll Tables
-- CreateEnum (idempotent)
DO $$ BEGIN CREATE TYPE "CompensationType" AS ENUM ('salaried', 'per_class'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PayrollRunStatus" AS ENUM ('draft', 'pending_approval', 'finalised', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "staff_compensation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "compensation_type" "CompensationType" NOT NULL,
    "base_salary" DECIMAL(12,2),
    "per_class_rate" DECIMAL(12,2),
    "assigned_class_count" INTEGER,
    "bonus_class_rate" DECIMAL(12,2),
    "bonus_day_multiplier" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_compensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payroll_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "period_label" VARCHAR(100) NOT NULL,
    "period_month" SMALLINT NOT NULL,
    "period_year" SMALLINT NOT NULL,
    "total_working_days" SMALLINT NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'draft',
    "total_basic_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_bonus_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total_pay" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "headcount" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "finalised_by_user_id" UUID,
    "finalised_at" TIMESTAMPTZ,
    "approval_request_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payroll_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "payroll_run_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "compensation_type" "CompensationType" NOT NULL,
    "snapshot_base_salary" DECIMAL(12,2),
    "snapshot_per_class_rate" DECIMAL(12,2),
    "snapshot_assigned_class_count" INTEGER,
    "snapshot_bonus_class_rate" DECIMAL(12,2),
    "snapshot_bonus_day_multiplier" DECIMAL(5,2),
    "days_worked" SMALLINT,
    "classes_taught" INTEGER,
    "auto_populated_class_count" INTEGER,
    "basic_pay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bonus_pay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total_pay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" VARCHAR(1000),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "payslips" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "payroll_entry_id" UUID NOT NULL,
    "payslip_number" VARCHAR(50) NOT NULL,
    "template_locale" VARCHAR(10) NOT NULL,
    "issued_at" TIMESTAMPTZ NOT NULL,
    "issued_by_user_id" UUID,
    "snapshot_payload_json" JSONB NOT NULL,
    "render_version" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "idx_staff_compensation_tenant_staff" ON "staff_compensation"("tenant_id", "staff_profile_id");

CREATE INDEX IF NOT EXISTS "idx_payroll_runs_tenant" ON "payroll_runs"("tenant_id");
CREATE INDEX IF NOT EXISTS "idx_payroll_runs_tenant_status" ON "payroll_runs"("tenant_id", "status");

CREATE UNIQUE INDEX IF NOT EXISTS "idx_payroll_entries_unique" ON "payroll_entries"("tenant_id", "payroll_run_id", "staff_profile_id");
CREATE INDEX IF NOT EXISTS "idx_payroll_entries_run" ON "payroll_entries"("tenant_id", "payroll_run_id");
CREATE INDEX IF NOT EXISTS "idx_payroll_entries_staff" ON "payroll_entries"("tenant_id", "staff_profile_id");

-- payslips: unique constraint on payroll_entry_id (one payslip per entry)
DO $$ BEGIN
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_entry_id_key" UNIQUE ("payroll_entry_id");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_payslips_number" ON "payslips"("tenant_id", "payslip_number");
CREATE INDEX IF NOT EXISTS "idx_payslips_entry" ON "payslips"("payroll_entry_id");

-- AddForeignKey
DO $$ BEGIN
ALTER TABLE "staff_compensation" ADD CONSTRAINT "staff_compensation_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "staff_compensation" ADD CONSTRAINT "staff_compensation_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "staff_compensation" ADD CONSTRAINT "staff_compensation_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_finalised_by_user_id_fkey" FOREIGN KEY ("finalised_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_payroll_entry_id_fkey" FOREIGN KEY ("payroll_entry_id") REFERENCES "payroll_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_issued_by_user_id_fkey" FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
