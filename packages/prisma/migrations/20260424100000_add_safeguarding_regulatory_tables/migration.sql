-- Phase 9 — Regulatory Safeguarding registers
--
-- Adds three tenant-scoped tables that back the new /regulatory/safeguarding
-- sub-hub: designated-liaison-person register, staff vetting records, and
-- annual child-protection-policy reviews.
--
-- RLS policies live in post_migrate.sql.

-- ─── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE "DlpRole" AS ENUM ('designated_liaison', 'deputy_liaison');

CREATE TYPE "StaffVettingType" AS ENUM ('garda_vetting', 'international', 'other');

CREATE TYPE "StaffVettingStatus" AS ENUM (
    'active',
    'expiring_soon',
    'expired',
    'pending_renewal',
    'revoked'
);

CREATE TYPE "ChildProtectionReviewStatus" AS ENUM (
    'scheduled',
    'in_progress',
    'completed',
    'overdue'
);

-- ─── dlp_register_entries ────────────────────────────────────────────────────

CREATE TABLE "dlp_register_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "DlpRole" NOT NULL,
    "appointed_at" DATE NOT NULL,
    "retired_at" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "dlp_register_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_dlp_register_tenant_active"
    ON "dlp_register_entries"("tenant_id", "retired_at");

CREATE INDEX "idx_dlp_register_user"
    ON "dlp_register_entries"("tenant_id", "user_id");

ALTER TABLE "dlp_register_entries"
    ADD CONSTRAINT "dlp_register_entries_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "dlp_register_entries"
    ADD CONSTRAINT "dlp_register_entries_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

-- ─── staff_vetting_records ──────────────────────────────────────────────────

CREATE TABLE "staff_vetting_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "vetting_type" "StaffVettingType" NOT NULL,
    "reference_number" VARCHAR(100),
    "vetting_date" DATE NOT NULL,
    "expiry_date" DATE NOT NULL,
    "status" "StaffVettingStatus" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "staff_vetting_records_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_staff_vetting_tenant_expiry"
    ON "staff_vetting_records"("tenant_id", "expiry_date");

CREATE INDEX "idx_staff_vetting_user"
    ON "staff_vetting_records"("tenant_id", "user_id");

CREATE INDEX "idx_staff_vetting_status"
    ON "staff_vetting_records"("tenant_id", "status");

ALTER TABLE "staff_vetting_records"
    ADD CONSTRAINT "staff_vetting_records_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "staff_vetting_records"
    ADD CONSTRAINT "staff_vetting_records_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE RESTRICT
    ON UPDATE CASCADE;

-- ─── child_protection_reviews ──────────────────────────────────────────────

CREATE TABLE "child_protection_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_year" VARCHAR(20) NOT NULL,
    "review_date" DATE NOT NULL,
    "next_review_due" DATE NOT NULL,
    "conducted_by_id" UUID,
    "attendees" TEXT,
    "findings" TEXT,
    "actions_required" TEXT,
    "status" "ChildProtectionReviewStatus" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "child_protection_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_cp_reviews_tenant_date"
    ON "child_protection_reviews"("tenant_id", "review_date" DESC);

CREATE INDEX "idx_cp_reviews_next_due"
    ON "child_protection_reviews"("tenant_id", "next_review_due");

CREATE INDEX "idx_cp_reviews_academic_year"
    ON "child_protection_reviews"("tenant_id", "academic_year");

ALTER TABLE "child_protection_reviews"
    ADD CONSTRAINT "child_protection_reviews_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "child_protection_reviews"
    ADD CONSTRAINT "child_protection_reviews_conducted_by_id_fkey"
    FOREIGN KEY ("conducted_by_id")
    REFERENCES "users"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
