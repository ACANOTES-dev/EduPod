-- SW-3A: NEPS Referrals — schema changes

-- 1. Add 'withdrawn' to PastoralReferralStatus enum
ALTER TYPE "PastoralReferralStatus" ADD VALUE IF NOT EXISTS 'withdrawn';

-- 2. Add new columns to pastoral_referrals
ALTER TABLE "pastoral_referrals"
  ADD COLUMN IF NOT EXISTS "reason" TEXT,
  ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "assessment_scheduled_date" DATE,
  ADD COLUMN IF NOT EXISTS "assessment_completed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;

-- 3. Add FK for created_by_user_id
ALTER TABLE "pastoral_referrals"
  ADD CONSTRAINT "pastoral_referrals_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. Create pastoral_neps_visits table
CREATE TABLE "pastoral_neps_visits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "visit_date" DATE NOT NULL,
  "psychologist_name" VARCHAR(200) NOT NULL,
  "notes" TEXT,
  "created_by_user_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "pastoral_neps_visits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pastoral_neps_visits"
  ADD CONSTRAINT "pastoral_neps_visits_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pastoral_neps_visits"
  ADD CONSTRAINT "pastoral_neps_visits_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "idx_pastoral_neps_visits_tenant_date" ON "pastoral_neps_visits"("tenant_id", "visit_date");

-- 5. Create pastoral_neps_visit_students table
CREATE TABLE "pastoral_neps_visit_students" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "visit_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "referral_id" UUID,
  "outcome" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "pastoral_neps_visit_students_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "pastoral_neps_visit_students"
  ADD CONSTRAINT "pastoral_neps_visit_students_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pastoral_neps_visit_students"
  ADD CONSTRAINT "pastoral_neps_visit_students_visit_id_fkey"
  FOREIGN KEY ("visit_id") REFERENCES "pastoral_neps_visits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pastoral_neps_visit_students"
  ADD CONSTRAINT "pastoral_neps_visit_students_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pastoral_neps_visit_students"
  ADD CONSTRAINT "pastoral_neps_visit_students_referral_id_fkey"
  FOREIGN KEY ("referral_id") REFERENCES "pastoral_referrals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "pastoral_neps_visit_students_tenant_id_visit_id_student_id_key"
  ON "pastoral_neps_visit_students"("tenant_id", "visit_id", "student_id");

CREATE INDEX "idx_pastoral_neps_visit_students_tenant_visit"
  ON "pastoral_neps_visit_students"("tenant_id", "visit_id");

-- 6. RLS policies for new tables
ALTER TABLE "pastoral_neps_visits" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "pastoral_neps_visits"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);

ALTER TABLE "pastoral_neps_visit_students" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation" ON "pastoral_neps_visit_students"
  USING ("tenant_id" = current_setting('app.current_tenant_id', true)::uuid);
