-- Payroll World-Class Enhancement Migration
-- Adds: staff_attendance_records, class_delivery_records, payroll_adjustments,
--       payroll_export_templates, payroll_export_logs, payroll_approval_configs,
--       payroll_allowance_types, staff_allowances, payroll_one_off_items,
--       staff_recurring_deductions

-- ─── Enums ────────────────────────────────────────────────────────────────────

CREATE TYPE "StaffAttendanceStatus" AS ENUM (
  'present',
  'absent',
  'half_day',
  'unpaid_leave',
  'paid_leave',
  'sick_leave'
);

CREATE TYPE "ClassDeliveryStatus" AS ENUM (
  'delivered',
  'absent_covered',
  'absent_uncovered',
  'cancelled'
);

CREATE TYPE "PayrollAdjustmentType" AS ENUM (
  'underpayment',
  'overpayment',
  'bonus',
  'reimbursement',
  'other'
);

CREATE TYPE "PayrollOneOffType" AS ENUM (
  'bonus',
  'reimbursement',
  'other'
);

-- ─── RLS helper ──────────────────────────────────────────────────────────────

-- Staff Attendance Records ─────────────────────────────────────────────────────

CREATE TABLE "staff_attendance_records" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"         UUID NOT NULL,
  "staff_profile_id"  UUID NOT NULL,
  "date"              DATE NOT NULL,
  "status"            "StaffAttendanceStatus" NOT NULL,
  "marked_by_user_id" UUID NOT NULL,
  "notes"             TEXT,
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "staff_attendance_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_attendance_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_attendance_records_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_attendance_records_marked_by_user_id_fkey" FOREIGN KEY ("marked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "idx_staff_attendance_unique" ON "staff_attendance_records"("tenant_id", "staff_profile_id", "date");
CREATE INDEX "idx_staff_attendance_tenant_date" ON "staff_attendance_records"("tenant_id", "date");
CREATE INDEX "idx_staff_attendance_tenant_staff" ON "staff_attendance_records"("tenant_id", "staff_profile_id");

ALTER TABLE "staff_attendance_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_staff_attendance_records" ON "staff_attendance_records"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Class Delivery Records ───────────────────────────────────────────────────────

CREATE TABLE "class_delivery_records" (
  "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"             UUID NOT NULL,
  "staff_profile_id"      UUID NOT NULL,
  "schedule_id"           UUID NOT NULL,
  "delivery_date"         DATE NOT NULL,
  "status"                "ClassDeliveryStatus" NOT NULL,
  "substitute_staff_id"   UUID,
  "notes"                 TEXT,
  "confirmed_by_user_id"  UUID,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "class_delivery_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "class_delivery_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "class_delivery_records_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "class_delivery_records_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE,
  CONSTRAINT "class_delivery_records_substitute_staff_id_fkey" FOREIGN KEY ("substitute_staff_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL,
  CONSTRAINT "class_delivery_records_confirmed_by_user_id_fkey" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "idx_class_delivery_unique" ON "class_delivery_records"("tenant_id", "staff_profile_id", "schedule_id", "delivery_date");
CREATE INDEX "idx_class_delivery_tenant_staff_date" ON "class_delivery_records"("tenant_id", "staff_profile_id", "delivery_date");

ALTER TABLE "class_delivery_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_class_delivery_records" ON "class_delivery_records"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Payroll Adjustments ─────────────────────────────────────────────────────────

CREATE TABLE "payroll_adjustments" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"           UUID NOT NULL,
  "payroll_run_id"      UUID NOT NULL,
  "payroll_entry_id"    UUID NOT NULL,
  "adjustment_type"     "PayrollAdjustmentType" NOT NULL,
  "amount"              NUMERIC(12, 2) NOT NULL,
  "description"         TEXT NOT NULL,
  "reference_period"    VARCHAR(100),
  "created_by_user_id"  UUID NOT NULL,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_adjustments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_adjustments_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_adjustments_payroll_entry_id_fkey" FOREIGN KEY ("payroll_entry_id") REFERENCES "payroll_entries"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_adjustments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_payroll_adjustments_entry" ON "payroll_adjustments"("tenant_id", "payroll_entry_id");

ALTER TABLE "payroll_adjustments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_payroll_adjustments" ON "payroll_adjustments"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Payroll Export Templates ────────────────────────────────────────────────────

CREATE TABLE "payroll_export_templates" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"           UUID NOT NULL,
  "name"                VARCHAR(200) NOT NULL,
  "columns_json"        JSONB NOT NULL,
  "file_format"         VARCHAR(10) NOT NULL DEFAULT 'csv',
  "created_by_user_id"  UUID NOT NULL,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "payroll_export_templates_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_export_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_export_templates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX "idx_payroll_export_templates_tenant_name" ON "payroll_export_templates"("tenant_id", "name");
CREATE INDEX "idx_payroll_export_templates_tenant" ON "payroll_export_templates"("tenant_id");

ALTER TABLE "payroll_export_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_payroll_export_templates" ON "payroll_export_templates"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Payroll Export Logs ─────────────────────────────────────────────────────────

CREATE TABLE "payroll_export_logs" (
  "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"             UUID NOT NULL,
  "payroll_run_id"        UUID NOT NULL,
  "export_template_id"    UUID,
  "exported_by_user_id"   UUID NOT NULL,
  "exported_at"           TIMESTAMPTZ NOT NULL,
  "file_name"             VARCHAR(500) NOT NULL,
  "row_count"             INTEGER NOT NULL,
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "payroll_export_logs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_export_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_export_logs_payroll_run_id_fkey" FOREIGN KEY ("payroll_run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_export_logs_export_template_id_fkey" FOREIGN KEY ("export_template_id") REFERENCES "payroll_export_templates"("id") ON DELETE SET NULL,
  CONSTRAINT "payroll_export_logs_exported_by_user_id_fkey" FOREIGN KEY ("exported_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_payroll_export_logs_run" ON "payroll_export_logs"("tenant_id", "payroll_run_id");

ALTER TABLE "payroll_export_logs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_payroll_export_logs" ON "payroll_export_logs"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Payroll Approval Config ─────────────────────────────────────────────────────

CREATE TABLE "payroll_approval_configs" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"   UUID NOT NULL UNIQUE,
  "steps_json"  JSONB NOT NULL,
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "payroll_approval_configs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_approval_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

ALTER TABLE "payroll_approval_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_payroll_approval_configs" ON "payroll_approval_configs"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Payroll Allowance Types ─────────────────────────────────────────────────────

CREATE TABLE "payroll_allowance_types" (
  "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"       UUID NOT NULL,
  "name"            VARCHAR(200) NOT NULL,
  "name_ar"         VARCHAR(200),
  "is_recurring"    BOOLEAN NOT NULL DEFAULT true,
  "default_amount"  NUMERIC(12, 2),
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "created_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "payroll_allowance_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_allowance_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "idx_payroll_allowance_types_tenant_name" ON "payroll_allowance_types"("tenant_id", "name");
CREATE INDEX "idx_payroll_allowance_types_tenant" ON "payroll_allowance_types"("tenant_id");

ALTER TABLE "payroll_allowance_types" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_payroll_allowance_types" ON "payroll_allowance_types"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Staff Allowances ────────────────────────────────────────────────────────────

CREATE TABLE "staff_allowances" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"           UUID NOT NULL,
  "staff_profile_id"    UUID NOT NULL,
  "allowance_type_id"   UUID NOT NULL,
  "amount"              NUMERIC(12, 2) NOT NULL,
  "effective_from"      DATE NOT NULL,
  "effective_to"        DATE,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "staff_allowances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_allowances_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_allowances_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_allowances_allowance_type_id_fkey" FOREIGN KEY ("allowance_type_id") REFERENCES "payroll_allowance_types"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_staff_allowances_tenant_staff" ON "staff_allowances"("tenant_id", "staff_profile_id");

ALTER TABLE "staff_allowances" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_staff_allowances" ON "staff_allowances"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Payroll One-Off Items ───────────────────────────────────────────────────────

CREATE TABLE "payroll_one_off_items" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"           UUID NOT NULL,
  "payroll_entry_id"    UUID NOT NULL,
  "description"         TEXT NOT NULL,
  "amount"              NUMERIC(12, 2) NOT NULL,
  "item_type"           "PayrollOneOffType" NOT NULL,
  "created_by_user_id"  UUID NOT NULL,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "payroll_one_off_items_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payroll_one_off_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_one_off_items_payroll_entry_id_fkey" FOREIGN KEY ("payroll_entry_id") REFERENCES "payroll_entries"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_one_off_items_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_payroll_one_off_entry" ON "payroll_one_off_items"("tenant_id", "payroll_entry_id");

ALTER TABLE "payroll_one_off_items" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_payroll_one_off_items" ON "payroll_one_off_items"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- Staff Recurring Deductions ──────────────────────────────────────────────────

CREATE TABLE "staff_recurring_deductions" (
  "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"           UUID NOT NULL,
  "staff_profile_id"    UUID NOT NULL,
  "description"         TEXT NOT NULL,
  "total_amount"        NUMERIC(12, 2) NOT NULL,
  "monthly_amount"      NUMERIC(12, 2) NOT NULL,
  "remaining_amount"    NUMERIC(12, 2) NOT NULL,
  "start_date"          DATE NOT NULL,
  "months_remaining"    INTEGER NOT NULL,
  "active"              BOOLEAN NOT NULL DEFAULT true,
  "created_by_user_id"  UUID NOT NULL,
  "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "staff_recurring_deductions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "staff_recurring_deductions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_recurring_deductions_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "staff_recurring_deductions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE INDEX "idx_staff_deductions_tenant_staff" ON "staff_recurring_deductions"("tenant_id", "staff_profile_id");

ALTER TABLE "staff_recurring_deductions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rls_staff_recurring_deductions" ON "staff_recurring_deductions"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
