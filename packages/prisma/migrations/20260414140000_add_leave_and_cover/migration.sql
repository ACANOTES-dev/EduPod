-- ════════════════════════════════════════════════════════════════════════════
-- Leave & Cover — Stage 1: Schema for teacher-initiated absence reporting,
-- leave-request approval workflow, parallel substitution offers, and
-- tenant-configurable cover settings.
--
-- Depends on: 20260414120000_add_substitute_teacher_competencies
-- ════════════════════════════════════════════════════════════════════════════

-- ─── New enums ──────────────────────────────────────────────────────────────

CREATE TYPE "AbsenceType" AS ENUM ('self_reported', 'approved_leave');

CREATE TYPE "LeaveRequestStatus" AS ENUM (
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'withdrawn'
);

CREATE TYPE "SubstitutionOfferStatus" AS ENUM (
  'pending',
  'accepted',
  'declined',
  'expired',
  'revoked'
);

CREATE TYPE "SubstitutionRecordSource" AS ENUM ('cascade', 'nomination', 'manual');

-- Extend existing enum — adds a "no longer needed" terminal state for records
-- whose absence was cancelled or whose sibling offer won the race.
ALTER TYPE "SubstitutionStatus" ADD VALUE 'revoked';

-- ─── 1. leave_types ─────────────────────────────────────────────────────────
-- System rows (tenant_id IS NULL) seed the default catalogue. Tenants may
-- override by creating their own rows with the same code (separate partial
-- unique indexes keep system + tenant rows distinct).

CREATE TABLE "leave_types" (
    "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"             UUID,
    "code"                  VARCHAR(50) NOT NULL,
    "label"                 VARCHAR(100) NOT NULL,
    "requires_approval"     BOOLEAN NOT NULL DEFAULT TRUE,
    "is_paid_default"       BOOLEAN NOT NULL DEFAULT TRUE,
    "max_days_per_request"  INT,
    "requires_evidence"     BOOLEAN NOT NULL DEFAULT FALSE,
    "display_order"         INT NOT NULL DEFAULT 100,
    "is_active"             BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "leave_types"
    ADD CONSTRAINT "leave_types_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "idx_leave_types_system_code"
    ON "leave_types" ("code") WHERE "tenant_id" IS NULL;

CREATE UNIQUE INDEX "idx_leave_types_tenant_code"
    ON "leave_types" ("tenant_id", "code") WHERE "tenant_id" IS NOT NULL;

-- ─── 2. leave_requests ──────────────────────────────────────────────────────
-- Approval workflow for planned absences. On approval, a teacher_absence row
-- is created and linked via teacher_absences.leave_request_id.

CREATE TABLE "leave_requests" (
    "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"             UUID NOT NULL,
    "staff_profile_id"      UUID NOT NULL,
    "leave_type_id"         UUID NOT NULL,
    "date_from"             DATE NOT NULL,
    "date_to"               DATE NOT NULL,
    "full_day"              BOOLEAN NOT NULL DEFAULT TRUE,
    "period_from"           SMALLINT,
    "period_to"             SMALLINT,
    "reason"                TEXT,
    "evidence_url"          VARCHAR(500),
    "status"                "LeaveRequestStatus" NOT NULL DEFAULT 'pending',
    "submitted_by_user_id"  UUID NOT NULL,
    "submitted_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    "reviewed_by_user_id"   UUID,
    "reviewed_at"           TIMESTAMPTZ,
    "review_notes"          TEXT,
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "leave_requests_date_range_valid" CHECK ("date_to" >= "date_from"),
    CONSTRAINT "leave_requests_period_range_valid"
      CHECK ("full_day" = TRUE OR ("period_from" IS NOT NULL AND "period_to" IS NOT NULL AND "period_to" >= "period_from"))
);

ALTER TABLE "leave_requests"
    ADD CONSTRAINT "leave_requests_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;

ALTER TABLE "leave_requests"
    ADD CONSTRAINT "leave_requests_staff_profile_id_fkey"
    FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE;

ALTER TABLE "leave_requests"
    ADD CONSTRAINT "leave_requests_leave_type_id_fkey"
    FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE RESTRICT;

ALTER TABLE "leave_requests"
    ADD CONSTRAINT "leave_requests_submitted_by_user_id_fkey"
    FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE;

ALTER TABLE "leave_requests"
    ADD CONSTRAINT "leave_requests_reviewed_by_user_id_fkey"
    FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;

CREATE INDEX "idx_leave_requests_tenant_status"
    ON "leave_requests" ("tenant_id", "status");

CREATE INDEX "idx_leave_requests_tenant_staff"
    ON "leave_requests" ("tenant_id", "staff_profile_id", "submitted_at" DESC);

-- ─── 3. Modify teacher_absences ─────────────────────────────────────────────
-- Extend the existing single-day model into an optional date range. The
-- existing `absence_date` column stays as the start-date (logically "date_from"),
-- and a new nullable `date_to` column marks the end of multi-day absences.
-- When `date_to IS NULL`, the absence is single-day (backwards-compatible with
-- every existing caller that treats `absence_date` as the one-and-only date).

ALTER TABLE "teacher_absences" ADD COLUMN "date_to"                 DATE;
ALTER TABLE "teacher_absences" ADD COLUMN "absence_type"            "AbsenceType" NOT NULL DEFAULT 'self_reported';
ALTER TABLE "teacher_absences" ADD COLUMN "leave_type_id"           UUID;
ALTER TABLE "teacher_absences" ADD COLUMN "leave_request_id"        UUID;
ALTER TABLE "teacher_absences" ADD COLUMN "nominated_substitute_id" UUID;
ALTER TABLE "teacher_absences" ADD COLUMN "is_paid"                 BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "teacher_absences" ADD COLUMN "days_counted"            NUMERIC(5,2) NOT NULL DEFAULT 1.00;
ALTER TABLE "teacher_absences" ADD COLUMN "cancelled_at"            TIMESTAMPTZ;
ALTER TABLE "teacher_absences" ADD COLUMN "cancelled_by_user_id"    UUID;
ALTER TABLE "teacher_absences" ADD COLUMN "cancellation_reason"     TEXT;

-- Drop the old single-column uniqueness; multi-day absences need range-based
-- uniqueness instead (enforced via partial unique below).
DROP INDEX IF EXISTS "idx_teacher_absences_unique";

ALTER TABLE "teacher_absences"
    ADD CONSTRAINT "teacher_absences_leave_type_id_fkey"
    FOREIGN KEY ("leave_type_id") REFERENCES "leave_types"("id") ON DELETE SET NULL;

ALTER TABLE "teacher_absences"
    ADD CONSTRAINT "teacher_absences_leave_request_id_fkey"
    FOREIGN KEY ("leave_request_id") REFERENCES "leave_requests"("id") ON DELETE SET NULL;

ALTER TABLE "teacher_absences"
    ADD CONSTRAINT "teacher_absences_nominated_substitute_id_fkey"
    FOREIGN KEY ("nominated_substitute_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL;

ALTER TABLE "teacher_absences"
    ADD CONSTRAINT "teacher_absences_cancelled_by_user_id_fkey"
    FOREIGN KEY ("cancelled_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "teacher_absences"
    ADD CONSTRAINT "teacher_absences_date_range_valid"
    CHECK ("date_to" IS NULL OR "date_to" >= "absence_date");

CREATE INDEX "idx_teacher_absences_tenant_range"
    ON "teacher_absences" ("tenant_id", "absence_date", "date_to");

-- Only active (non-cancelled) absences must be unique per staff + start-date.
-- Multi-day overlap is enforced at the service layer.
CREATE UNIQUE INDEX "idx_teacher_absences_active_start"
    ON "teacher_absences" ("tenant_id", "staff_profile_id", "absence_date")
    WHERE "cancelled_at" IS NULL;

-- ─── 4. substitution_offers ─────────────────────────────────────────────────
-- One row per (absence, schedule_slot, candidate_sub). The cascade engine
-- creates N offers at once (parallel fan-out); first-accept-wins is enforced
-- at the service layer via SELECT FOR UPDATE on the absence+schedule row.

CREATE TABLE "substitution_offers" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"          UUID NOT NULL,
    "absence_id"         UUID NOT NULL,
    "schedule_id"        UUID NOT NULL,
    "absence_date"       DATE NOT NULL,
    "candidate_staff_id" UUID NOT NULL,
    "offered_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    "expires_at"         TIMESTAMPTZ NOT NULL,
    "status"             "SubstitutionOfferStatus" NOT NULL DEFAULT 'pending',
    "responded_at"       TIMESTAMPTZ,
    "decline_reason"     TEXT,
    "is_nomination"      BOOLEAN NOT NULL DEFAULT FALSE,
    "cascade_round"      SMALLINT NOT NULL DEFAULT 1,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "substitution_offers_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "substitution_offers"
    ADD CONSTRAINT "substitution_offers_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;

ALTER TABLE "substitution_offers"
    ADD CONSTRAINT "substitution_offers_absence_id_fkey"
    FOREIGN KEY ("absence_id") REFERENCES "teacher_absences"("id") ON DELETE CASCADE;

ALTER TABLE "substitution_offers"
    ADD CONSTRAINT "substitution_offers_schedule_id_fkey"
    FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE;

ALTER TABLE "substitution_offers"
    ADD CONSTRAINT "substitution_offers_candidate_staff_id_fkey"
    FOREIGN KEY ("candidate_staff_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE;

-- At most one pending offer per (absence, schedule, date, candidate) to prevent
-- duplicate offers across cascade rounds.
CREATE UNIQUE INDEX "idx_substitution_offers_pending_unique"
    ON "substitution_offers" ("tenant_id", "absence_id", "schedule_id", "absence_date", "candidate_staff_id")
    WHERE "status" = 'pending';

CREATE INDEX "idx_substitution_offers_absence_status"
    ON "substitution_offers" ("tenant_id", "absence_id", "status");

CREATE INDEX "idx_substitution_offers_candidate_status"
    ON "substitution_offers" ("tenant_id", "candidate_staff_id", "status");

-- Used by expire-offers cron — partial for pending rows only.
CREATE INDEX "idx_substitution_offers_pending_expiry"
    ON "substitution_offers" ("tenant_id", "expires_at")
    WHERE "status" = 'pending';

-- ─── 5. Expand substitution_records ─────────────────────────────────────────

ALTER TABLE "substitution_records" ADD COLUMN "offer_id"     UUID;
ALTER TABLE "substitution_records" ADD COLUMN "absence_date" DATE;
ALTER TABLE "substitution_records" ADD COLUMN "source"       "SubstitutionRecordSource" NOT NULL DEFAULT 'manual';

ALTER TABLE "substitution_records"
    ADD CONSTRAINT "substitution_records_offer_id_fkey"
    FOREIGN KEY ("offer_id") REFERENCES "substitution_offers"("id") ON DELETE SET NULL;

CREATE INDEX "idx_substitution_records_tenant_absence_date"
    ON "substitution_records" ("tenant_id", "absence_date");

-- ─── 6. tenant_scheduling_settings ──────────────────────────────────────────
-- One row per tenant (created on first write via upsert).

CREATE TABLE "tenant_scheduling_settings" (
    "id"                    UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"             UUID NOT NULL,
    "offer_timeout_minutes" INT NOT NULL DEFAULT 30,
    "parallel_offer_count"  INT NOT NULL DEFAULT 3,
    "sms_enabled"           BOOLEAN NOT NULL DEFAULT FALSE,
    "whatsapp_enabled"      BOOLEAN NOT NULL DEFAULT FALSE,
    "auto_cascade_enabled"  BOOLEAN NOT NULL DEFAULT TRUE,
    "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "tenant_scheduling_settings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tenant_scheduling_settings_timeout_positive" CHECK ("offer_timeout_minutes" BETWEEN 1 AND 1440),
    CONSTRAINT "tenant_scheduling_settings_parallel_positive" CHECK ("parallel_offer_count" BETWEEN 1 AND 20)
);

ALTER TABLE "tenant_scheduling_settings"
    ADD CONSTRAINT "tenant_scheduling_settings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;

CREATE UNIQUE INDEX "idx_tenant_scheduling_settings_tenant"
    ON "tenant_scheduling_settings" ("tenant_id");
