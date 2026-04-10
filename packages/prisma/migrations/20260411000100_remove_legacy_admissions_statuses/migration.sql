-- ============================================================
-- New Admissions — Schema Foundation (Part 2 of 2)
-- ============================================================
--
-- Wave 1, Implementation 01.
--
-- This migration:
--   1. Adds the ApplicationWaitingListSubstatus + AdmissionOverrideType enums.
--   2. Creates the admission_overrides table (RLS policy is installed by
--      post_migrate.sql).
--   3. Extends applications with the gating columns + apply_date + cents-
--      precision payment amount + FK hooks to the above.
--   4. Backfills apply_date (COALESCE(submitted_at, created_at)) and
--      payment_amount_cents (ROUND(payment_amount * 100)).
--   5. Remaps legacy ApplicationStatus rows:
--        draft                       -> withdrawn
--        under_review                -> ready_to_admit
--        pending_acceptance_approval -> ready_to_admit
--        accepted                    -> approved
--   6. Swaps the ApplicationStatus enum type — postgres has no DROP VALUE, so
--      we rename the old type, create a new one with only the desired values,
--      re-type the column, and drop the legacy type.
--   7. Tightens classes.max_capacity to NOT NULL (defaults any nulls to 25).
--
-- Every step is idempotent enough to re-run on a partially-applied DB.

-- ─── 1. New enums ───────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ApplicationWaitingListSubstatus') THEN
    CREATE TYPE "ApplicationWaitingListSubstatus" AS ENUM ('awaiting_year_setup');
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AdmissionOverrideType') THEN
    CREATE TYPE "AdmissionOverrideType" AS ENUM ('full_waiver', 'partial_waiver', 'deferred_payment');
  END IF;
END
$$;

-- ─── 2. admission_overrides table ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "admission_overrides" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "application_id" UUID NOT NULL,
  "approved_by_user_id" UUID NOT NULL,
  "expected_amount_cents" INTEGER NOT NULL,
  "actual_amount_cents" INTEGER NOT NULL DEFAULT 0,
  "justification" TEXT NOT NULL,
  "override_type" "AdmissionOverrideType" NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "admission_overrides_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admission_overrides_tenant_id_fkey'
  ) THEN
    ALTER TABLE "admission_overrides"
      ADD CONSTRAINT "admission_overrides_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admission_overrides_application_id_fkey'
  ) THEN
    ALTER TABLE "admission_overrides"
      ADD CONSTRAINT "admission_overrides_application_id_fkey"
      FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'admission_overrides_approved_by_user_id_fkey'
  ) THEN
    ALTER TABLE "admission_overrides"
      ADD CONSTRAINT "admission_overrides_approved_by_user_id_fkey"
      FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "idx_admission_overrides_tenant_time"
  ON "admission_overrides" ("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_admission_overrides_application"
  ON "admission_overrides" ("application_id");

-- ─── 3. applications — new columns ──────────────────────────────────────────

ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "target_academic_year_id" UUID,
  ADD COLUMN IF NOT EXISTS "target_year_group_id" UUID,
  ADD COLUMN IF NOT EXISTS "apply_date" TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "payment_amount_cents" INTEGER,
  ADD COLUMN IF NOT EXISTS "currency_code" VARCHAR(3),
  ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" VARCHAR(255),
  ADD COLUMN IF NOT EXISTS "waiting_list_substatus" "ApplicationWaitingListSubstatus",
  ADD COLUMN IF NOT EXISTS "override_record_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'applications_target_academic_year_id_fkey'
  ) THEN
    ALTER TABLE "applications"
      ADD CONSTRAINT "applications_target_academic_year_id_fkey"
      FOREIGN KEY ("target_academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'applications_target_year_group_id_fkey'
  ) THEN
    ALTER TABLE "applications"
      ADD CONSTRAINT "applications_target_year_group_id_fkey"
      FOREIGN KEY ("target_year_group_id") REFERENCES "year_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'applications_override_record_id_fkey'
  ) THEN
    ALTER TABLE "applications"
      ADD CONSTRAINT "applications_override_record_id_fkey"
      FOREIGN KEY ("override_record_id") REFERENCES "admission_overrides"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- ─── 4. Backfills ───────────────────────────────────────────────────────────

UPDATE "applications"
SET "apply_date" = COALESCE("submitted_at", "created_at")
WHERE "apply_date" IS NULL OR "apply_date" = "created_at";

UPDATE "applications"
SET "payment_amount_cents" = ROUND("payment_amount" * 100)::int
WHERE "payment_amount" IS NOT NULL
  AND "payment_amount_cents" IS NULL;

-- ─── 5. Remap legacy ApplicationStatus rows ─────────────────────────────────

UPDATE "applications" SET "status" = 'withdrawn'
WHERE "status"::text = 'draft';

UPDATE "applications" SET "status" = 'ready_to_admit'
WHERE "status"::text IN ('under_review', 'pending_acceptance_approval');

UPDATE "applications" SET "status" = 'approved'
WHERE "status"::text = 'accepted';

-- ─── 6. Swap enum type (rename → new enum → re-type → drop old) ─────────────
--
-- Postgres has no ALTER TYPE ... DROP VALUE, so we rename the old enum out of
-- the way, create a new one with only the target values, recast the applications
-- column, then drop the legacy type. Wrapped in a DO block so a re-run is a no-op
-- if the swap has already happened.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    WHERE t.typname = 'ApplicationStatus' AND e.enumlabel = 'draft'
  ) THEN
    ALTER TYPE "ApplicationStatus" RENAME TO "ApplicationStatus_old";

    CREATE TYPE "ApplicationStatus" AS ENUM (
      'submitted',
      'waiting_list',
      'ready_to_admit',
      'conditional_approval',
      'approved',
      'rejected',
      'withdrawn'
    );

    ALTER TABLE "applications"
      ALTER COLUMN "status" DROP DEFAULT,
      ALTER COLUMN "status" TYPE "ApplicationStatus"
        USING ("status"::text::"ApplicationStatus"),
      ALTER COLUMN "status" SET DEFAULT 'submitted';

    DROP TYPE "ApplicationStatus_old";
  END IF;
END
$$;

-- ─── 7. applications — new indexes ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS "idx_applications_gating"
  ON "applications" ("tenant_id", "status", "target_year_group_id", "target_academic_year_id", "apply_date");

CREATE INDEX IF NOT EXISTS "idx_applications_expiry"
  ON "applications" ("tenant_id", "status", "payment_deadline");

-- ─── 8. classes.max_capacity → NOT NULL ─────────────────────────────────────
--
-- Default backfill is 25. Tenants with historical rows missing a capacity should
-- review and update via the Classes UI after this migration ships.

UPDATE "classes" SET "max_capacity" = 25 WHERE "max_capacity" IS NULL;

ALTER TABLE "classes" ALTER COLUMN "max_capacity" SET NOT NULL;
