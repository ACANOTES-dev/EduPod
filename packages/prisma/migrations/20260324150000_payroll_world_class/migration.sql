-- ─── New Enums ─────────────────────────────────────────────────────────────

CREATE TYPE "StaffAttendanceStatus" AS ENUM ('present', 'absent', 'half_day', 'unpaid_leave', 'paid_leave', 'sick_leave');
CREATE TYPE "ClassDeliveryStatus" AS ENUM ('delivered', 'absent_covered', 'absent_uncovered', 'cancelled');
CREATE TYPE "PayrollAdjustmentType" AS ENUM ('underpayment', 'overpayment', 'bonus', 'reimbursement', 'other');
CREATE TYPE "PayrollOneOffType" AS ENUM ('bonus', 'reimbursement', 'other');

-- ─── New Tables ─────────────────────────────────────────────────────────────

CREATE TABLE "staff_attendance_records" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"          UUID NOT NULL,
    "staff_profile_id"   UUID NOT NULL,
    "date"               DATE NOT NULL,
    "status"             "StaffAttendanceStatus" NOT NULL,
    "marked_by_user_id"  UUID NOT NULL,
    "notes"              TEXT,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "staff_attendance_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "class_delivery_records" (
    "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"            UUID NOT NULL,
    "staff_profile_id"     UUID NOT NULL,
    "schedule_id"          UUID NOT NULL,
    "delivery_date"        DATE NOT NULL,
    "status"               "ClassDeliveryStatus" NOT NULL,
    "substitute_staff_id"  UUID,
    "notes"                TEXT,
    "confirmed_by_user_id" UUID,
    "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "class_delivery_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_adjustments" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"          UUID NOT NULL,
    "payroll_run_id"     UUID NOT NULL,
    "payroll_entry_id"   UUID NOT NULL,
    "adjustment_type"    "PayrollAdjustmentType" NOT NULL,
    "amount"             NUMERIC(12, 2) NOT NULL,
    "description"        TEXT NOT NULL,
    "reference_period"   VARCHAR(100) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_export_templates" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"          UUID NOT NULL,
    "name"               VARCHAR(150) NOT NULL,
    "columns_json"       JSONB NOT NULL,
    "file_format"        VARCHAR(10) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "payroll_export_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_export_logs" (
    "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"           UUID NOT NULL,
    "payroll_run_id"      UUID NOT NULL,
    "export_template_id"  UUID NOT NULL,
    "exported_by_user_id" UUID NOT NULL,
    "exported_at"         TIMESTAMPTZ NOT NULL,
    "file_name"           VARCHAR(255) NOT NULL,
    "row_count"           INTEGER NOT NULL,
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "payroll_export_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_approval_configs" (
    "id"         UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"  UUID NOT NULL,
    "steps_json" JSONB NOT NULL,
    "is_active"  BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "payroll_approval_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_allowance_types" (
    "id"             UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"      UUID NOT NULL,
    "name"           VARCHAR(150) NOT NULL,
    "name_ar"        VARCHAR(150),
    "is_recurring"   BOOLEAN NOT NULL DEFAULT true,
    "default_amount" NUMERIC(12, 2),
    "active"         BOOLEAN NOT NULL DEFAULT true,
    "created_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "payroll_allowance_types_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_allowances" (
    "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"         UUID NOT NULL,
    "staff_profile_id"  UUID NOT NULL,
    "allowance_type_id" UUID NOT NULL,
    "amount"            NUMERIC(12, 2) NOT NULL,
    "effective_from"    DATE NOT NULL,
    "effective_to"      DATE,
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "staff_allowances_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll_one_off_items" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"          UUID NOT NULL,
    "payroll_entry_id"   UUID NOT NULL,
    "description"        TEXT NOT NULL,
    "amount"             NUMERIC(12, 2) NOT NULL,
    "item_type"          "PayrollOneOffType" NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "payroll_one_off_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "staff_recurring_deductions" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"          UUID NOT NULL,
    "staff_profile_id"   UUID NOT NULL,
    "description"        TEXT NOT NULL,
    "total_amount"       NUMERIC(12, 2) NOT NULL,
    "monthly_amount"     NUMERIC(12, 2) NOT NULL,
    "remaining_amount"   NUMERIC(12, 2) NOT NULL,
    "start_date"         DATE NOT NULL,
    "months_remaining"   INTEGER NOT NULL,
    "active"             BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "staff_recurring_deductions_pkey" PRIMARY KEY ("id")
);

-- ─── Foreign Keys ──────────────────────────────────────────────────────────

-- staff_attendance_records
ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "staff_attendance_records_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "staff_attendance_records_staff_profile_id_fkey"
    FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_attendance_records" ADD CONSTRAINT "staff_attendance_records_marked_by_user_id_fkey"
    FOREIGN KEY ("marked_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- class_delivery_records
ALTER TABLE "class_delivery_records" ADD CONSTRAINT "class_delivery_records_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_delivery_records" ADD CONSTRAINT "class_delivery_records_staff_profile_id_fkey"
    FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_delivery_records" ADD CONSTRAINT "class_delivery_records_schedule_id_fkey"
    FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "class_delivery_records" ADD CONSTRAINT "class_delivery_records_substitute_staff_id_fkey"
    FOREIGN KEY ("substitute_staff_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "class_delivery_records" ADD CONSTRAINT "class_delivery_records_confirmed_by_user_id_fkey"
    FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- payroll_adjustments
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payroll_run_id_fkey"
    FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_payroll_entry_id_fkey"
    FOREIGN KEY ("payroll_entry_id") REFERENCES "payroll_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- payroll_export_templates
ALTER TABLE "payroll_export_templates" ADD CONSTRAINT "payroll_export_templates_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_export_templates" ADD CONSTRAINT "payroll_export_templates_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- payroll_export_logs
ALTER TABLE "payroll_export_logs" ADD CONSTRAINT "payroll_export_logs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_export_logs" ADD CONSTRAINT "payroll_export_logs_payroll_run_id_fkey"
    FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_export_logs" ADD CONSTRAINT "payroll_export_logs_export_template_id_fkey"
    FOREIGN KEY ("export_template_id") REFERENCES "payroll_export_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_export_logs" ADD CONSTRAINT "payroll_export_logs_exported_by_user_id_fkey"
    FOREIGN KEY ("exported_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- payroll_approval_configs
ALTER TABLE "payroll_approval_configs" ADD CONSTRAINT "payroll_approval_configs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- payroll_allowance_types
ALTER TABLE "payroll_allowance_types" ADD CONSTRAINT "payroll_allowance_types_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- staff_allowances
ALTER TABLE "staff_allowances" ADD CONSTRAINT "staff_allowances_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_allowances" ADD CONSTRAINT "staff_allowances_staff_profile_id_fkey"
    FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_allowances" ADD CONSTRAINT "staff_allowances_allowance_type_id_fkey"
    FOREIGN KEY ("allowance_type_id") REFERENCES "payroll_allowance_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- payroll_one_off_items
ALTER TABLE "payroll_one_off_items" ADD CONSTRAINT "payroll_one_off_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_one_off_items" ADD CONSTRAINT "payroll_one_off_items_payroll_entry_id_fkey"
    FOREIGN KEY ("payroll_entry_id") REFERENCES "payroll_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_one_off_items" ADD CONSTRAINT "payroll_one_off_items_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- staff_recurring_deductions
ALTER TABLE "staff_recurring_deductions" ADD CONSTRAINT "staff_recurring_deductions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_recurring_deductions" ADD CONSTRAINT "staff_recurring_deductions_staff_profile_id_fkey"
    FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "staff_recurring_deductions" ADD CONSTRAINT "staff_recurring_deductions_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Unique Constraints ────────────────────────────────────────────────────

CREATE UNIQUE INDEX "idx_staff_attendance_unique" ON "staff_attendance_records"("tenant_id", "staff_profile_id", "date");
CREATE UNIQUE INDEX "idx_class_delivery_unique" ON "class_delivery_records"("tenant_id", "staff_profile_id", "schedule_id", "delivery_date");
CREATE UNIQUE INDEX "idx_payroll_export_templates_tenant_name" ON "payroll_export_templates"("tenant_id", "name");
CREATE UNIQUE INDEX "idx_payroll_approval_configs_tenant" ON "payroll_approval_configs"("tenant_id");
CREATE UNIQUE INDEX "idx_payroll_allowance_types_tenant_name" ON "payroll_allowance_types"("tenant_id", "name");

-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX "idx_staff_attendance_tenant_date" ON "staff_attendance_records"("tenant_id", "date");
CREATE INDEX "idx_staff_attendance_tenant_staff" ON "staff_attendance_records"("tenant_id", "staff_profile_id");
CREATE INDEX "idx_class_delivery_tenant_staff_date" ON "class_delivery_records"("tenant_id", "staff_profile_id", "delivery_date");
CREATE INDEX "idx_payroll_adjustments_entry" ON "payroll_adjustments"("tenant_id", "payroll_entry_id");
CREATE INDEX "idx_payroll_export_logs_run" ON "payroll_export_logs"("tenant_id", "payroll_run_id");
CREATE INDEX "idx_staff_allowances_tenant_staff" ON "staff_allowances"("tenant_id", "staff_profile_id");
CREATE INDEX "idx_payroll_one_off_entry" ON "payroll_one_off_items"("tenant_id", "payroll_entry_id");
CREATE INDEX "idx_staff_deductions_tenant_staff" ON "staff_recurring_deductions"("tenant_id", "staff_profile_id");

-- ─── RLS Policies ─────────────────────────────────────────────────────────

ALTER TABLE "staff_attendance_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_staff_attendance_records ON "staff_attendance_records"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "class_delivery_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_class_delivery_records ON "class_delivery_records"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "payroll_adjustments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_payroll_adjustments ON "payroll_adjustments"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "payroll_export_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_payroll_export_templates ON "payroll_export_templates"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "payroll_export_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_payroll_export_logs ON "payroll_export_logs"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "payroll_approval_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_payroll_approval_configs ON "payroll_approval_configs"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "payroll_allowance_types" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_payroll_allowance_types ON "payroll_allowance_types"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "staff_allowances" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_staff_allowances ON "staff_allowances"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "payroll_one_off_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_payroll_one_off_items ON "payroll_one_off_items"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "staff_recurring_deductions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_staff_recurring_deductions ON "staff_recurring_deductions"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
