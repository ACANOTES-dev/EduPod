-- ─── New Enums ─────────────────────────────────────────────────────────────

CREATE TYPE "ReminderType" AS ENUM ('due_soon', 'overdue', 'final_notice');
CREATE TYPE "ReminderChannel" AS ENUM ('email', 'whatsapp', 'in_app');
CREATE TYPE "RecurringFrequency" AS ENUM ('monthly', 'term');
CREATE TYPE "CreditNoteStatus" AS ENUM ('open', 'partially_used', 'fully_used', 'cancelled');
CREATE TYPE "LateFeeType" AS ENUM ('fixed', 'percent');
CREATE TYPE "PaymentPlanStatus" AS ENUM ('pending', 'approved', 'rejected', 'counter_offered');
CREATE TYPE "ScholarshipStatus" AS ENUM ('active', 'expired', 'revoked');

-- ─── New Tables ───────────────────────────────────────────────────────────

CREATE TABLE "invoice_reminders" (
    "id"            UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"     UUID NOT NULL,
    "invoice_id"    UUID NOT NULL,
    "reminder_type" "ReminderType" NOT NULL,
    "channel"       "ReminderChannel" NOT NULL,
    "sent_at"       TIMESTAMPTZ NOT NULL,
    "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "invoice_reminders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "recurring_invoice_configs" (
    "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"            UUID NOT NULL,
    "fee_structure_id"     UUID NOT NULL,
    "frequency"            "RecurringFrequency" NOT NULL,
    "next_generation_date" DATE NOT NULL,
    "last_generated_at"    TIMESTAMPTZ,
    "active"               BOOLEAN NOT NULL DEFAULT true,
    "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "recurring_invoice_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_notes" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"          UUID NOT NULL,
    "household_id"       UUID NOT NULL,
    "credit_note_number" VARCHAR(50) NOT NULL,
    "amount"             NUMERIC(12, 2) NOT NULL,
    "remaining_balance"  NUMERIC(12, 2) NOT NULL,
    "reason"             TEXT NOT NULL,
    "status"             "CreditNoteStatus" NOT NULL DEFAULT 'open',
    "issued_by_user_id"  UUID NOT NULL,
    "issued_at"          TIMESTAMPTZ NOT NULL,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "credit_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "credit_note_applications" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"          UUID NOT NULL,
    "credit_note_id"     UUID NOT NULL,
    "invoice_id"         UUID NOT NULL,
    "applied_amount"     NUMERIC(12, 2) NOT NULL,
    "applied_at"         TIMESTAMPTZ NOT NULL,
    "applied_by_user_id" UUID NOT NULL,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "credit_note_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "late_fee_configs" (
    "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"         UUID NOT NULL,
    "name"              VARCHAR(150) NOT NULL,
    "fee_type"          "LateFeeType" NOT NULL,
    "value"             NUMERIC(12, 2) NOT NULL,
    "grace_period_days" INTEGER NOT NULL,
    "max_applications"  INTEGER NOT NULL DEFAULT 1,
    "frequency_days"    INTEGER,
    "active"            BOOLEAN NOT NULL DEFAULT true,
    "created_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "late_fee_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "late_fee_applications" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"          UUID NOT NULL,
    "invoice_id"         UUID NOT NULL,
    "late_fee_config_id" UUID NOT NULL,
    "amount"             NUMERIC(12, 2) NOT NULL,
    "applied_at"         TIMESTAMPTZ NOT NULL,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "late_fee_applications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payment_plan_requests" (
    "id"                         UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"                  UUID NOT NULL,
    "invoice_id"                 UUID NOT NULL,
    "household_id"               UUID NOT NULL,
    "requested_by_parent_id"     UUID NOT NULL,
    "proposed_installments_json" JSONB NOT NULL,
    "reason"                     TEXT NOT NULL,
    "status"                     "PaymentPlanStatus" NOT NULL DEFAULT 'pending',
    "admin_notes"                TEXT,
    "reviewed_by_user_id"        UUID,
    "reviewed_at"                TIMESTAMPTZ,
    "created_at"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"                 TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "payment_plan_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scholarships" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"          UUID NOT NULL,
    "name"               VARCHAR(200) NOT NULL,
    "description"        TEXT,
    "discount_type"      "DiscountType" NOT NULL,
    "value"              NUMERIC(12, 2) NOT NULL,
    "student_id"         UUID NOT NULL,
    "awarded_by_user_id" UUID NOT NULL,
    "award_date"         DATE NOT NULL,
    "renewal_date"       DATE,
    "status"             "ScholarshipStatus" NOT NULL DEFAULT 'active',
    "revocation_reason"  TEXT,
    "fee_structure_id"   UUID,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "scholarships_pkey" PRIMARY KEY ("id")
);

-- ─── Foreign Keys ─────────────────────────────────────────────────────────

-- invoice_reminders
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invoice_reminders" ADD CONSTRAINT "invoice_reminders_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- recurring_invoice_configs
ALTER TABLE "recurring_invoice_configs" ADD CONSTRAINT "recurring_invoice_configs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "recurring_invoice_configs" ADD CONSTRAINT "recurring_invoice_configs_fee_structure_id_fkey"
    FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- credit_notes
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_notes" ADD CONSTRAINT "credit_notes_issued_by_user_id_fkey"
    FOREIGN KEY ("issued_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- credit_note_applications
ALTER TABLE "credit_note_applications" ADD CONSTRAINT "credit_note_applications_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_note_applications" ADD CONSTRAINT "credit_note_applications_credit_note_id_fkey"
    FOREIGN KEY ("credit_note_id") REFERENCES "credit_notes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_note_applications" ADD CONSTRAINT "credit_note_applications_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "credit_note_applications" ADD CONSTRAINT "credit_note_applications_applied_by_user_id_fkey"
    FOREIGN KEY ("applied_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- late_fee_configs
ALTER TABLE "late_fee_configs" ADD CONSTRAINT "late_fee_configs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- late_fee_applications
ALTER TABLE "late_fee_applications" ADD CONSTRAINT "late_fee_applications_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "late_fee_applications" ADD CONSTRAINT "late_fee_applications_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "late_fee_applications" ADD CONSTRAINT "late_fee_applications_late_fee_config_id_fkey"
    FOREIGN KEY ("late_fee_config_id") REFERENCES "late_fee_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- payment_plan_requests
ALTER TABLE "payment_plan_requests" ADD CONSTRAINT "payment_plan_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_plan_requests" ADD CONSTRAINT "payment_plan_requests_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_plan_requests" ADD CONSTRAINT "payment_plan_requests_household_id_fkey"
    FOREIGN KEY ("household_id") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_plan_requests" ADD CONSTRAINT "payment_plan_requests_requested_by_parent_id_fkey"
    FOREIGN KEY ("requested_by_parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payment_plan_requests" ADD CONSTRAINT "payment_plan_requests_reviewed_by_user_id_fkey"
    FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- scholarships
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_awarded_by_user_id_fkey"
    FOREIGN KEY ("awarded_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scholarships" ADD CONSTRAINT "scholarships_fee_structure_id_fkey"
    FOREIGN KEY ("fee_structure_id") REFERENCES "fee_structures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Unique Constraints ───────────────────────────────────────────────────

CREATE UNIQUE INDEX "idx_recurring_configs_tenant_fee" ON "recurring_invoice_configs"("tenant_id", "fee_structure_id");
CREATE UNIQUE INDEX "idx_credit_notes_number" ON "credit_notes"("tenant_id", "credit_note_number");
CREATE UNIQUE INDEX "idx_late_fee_configs_tenant_name" ON "late_fee_configs"("tenant_id", "name");

-- ─── Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX "idx_invoice_reminders_tenant_invoice" ON "invoice_reminders"("tenant_id", "invoice_id");
CREATE INDEX "idx_recurring_configs_tenant_active" ON "recurring_invoice_configs"("tenant_id", "active");
CREATE INDEX "idx_credit_notes_tenant_household" ON "credit_notes"("tenant_id", "household_id");
CREATE INDEX "idx_credit_note_applications_note" ON "credit_note_applications"("tenant_id", "credit_note_id");
CREATE INDEX "idx_credit_note_applications_invoice" ON "credit_note_applications"("tenant_id", "invoice_id");
CREATE INDEX "idx_late_fee_configs_tenant" ON "late_fee_configs"("tenant_id");
CREATE INDEX "idx_late_fee_applications_invoice" ON "late_fee_applications"("tenant_id", "invoice_id");
CREATE INDEX "idx_payment_plan_requests_tenant" ON "payment_plan_requests"("tenant_id", "status");
CREATE INDEX "idx_payment_plan_requests_invoice" ON "payment_plan_requests"("tenant_id", "invoice_id");
CREATE INDEX "idx_scholarships_tenant_student" ON "scholarships"("tenant_id", "student_id");
CREATE INDEX "idx_scholarships_tenant_status" ON "scholarships"("tenant_id", "status");

-- ─── RLS Policies ─────────────────────────────────────────────────────────

ALTER TABLE "invoice_reminders" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_invoice_reminders ON "invoice_reminders"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "recurring_invoice_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_recurring_invoice_configs ON "recurring_invoice_configs"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "credit_notes" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_credit_notes ON "credit_notes"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "credit_note_applications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_credit_note_applications ON "credit_note_applications"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "late_fee_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_late_fee_configs ON "late_fee_configs"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "late_fee_applications" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_late_fee_applications ON "late_fee_applications"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "payment_plan_requests" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_payment_plan_requests ON "payment_plan_requests"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "scholarships" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_scholarships ON "scholarships"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
