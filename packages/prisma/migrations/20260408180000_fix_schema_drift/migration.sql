-- Migration: 20260408180000_fix_schema_drift
-- Fix schema drift: add columns, indexes, and FKs that exist in schema.prisma
-- but were never created in any migration.
-- Uses ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS for idempotency.
-- FKs use DROP CONSTRAINT IF EXISTS before ADD CONSTRAINT for idempotency.

-- ─── 1. critical_incidents — 13 missing columns ──────────────────────────────

ALTER TABLE "critical_incidents"
  ADD COLUMN IF NOT EXISTS "incident_number" VARCHAR(20),
  ADD COLUMN IF NOT EXISTS "incident_type_other" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "incident_date" DATE,
  ADD COLUMN IF NOT EXISTS "declared_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS "scope_year_group_ids" JSONB,
  ADD COLUMN IF NOT EXISTS "scope_class_ids" JSONB,
  ADD COLUMN IF NOT EXISTS "status_changed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "status_changed_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "communication_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "linked_communication_ids" JSONB,
  ADD COLUMN IF NOT EXISTS "closure_notes" TEXT,
  ADD COLUMN IF NOT EXISTS "closed_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "academic_year_id" UUID;

-- FK: status_changed_by_id -> users(id) ON DELETE SET NULL
ALTER TABLE "critical_incidents"
  DROP CONSTRAINT IF EXISTS "critical_incidents_status_changed_by_id_fkey";
ALTER TABLE "critical_incidents"
  ADD CONSTRAINT "critical_incidents_status_changed_by_id_fkey"
  FOREIGN KEY ("status_changed_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Missing indexes for critical_incidents
CREATE INDEX IF NOT EXISTS "idx_critical_incidents_tenant_date"
  ON "critical_incidents"("tenant_id", "incident_date");
CREATE INDEX IF NOT EXISTS "idx_critical_incidents_tenant_year"
  ON "critical_incidents"("tenant_id", "academic_year_id");


-- ─── 2. critical_incident_affected — 5 missing columns ──────────────────────

ALTER TABLE "critical_incident_affected"
  ADD COLUMN IF NOT EXISTS "wellbeing_flag_active" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "wellbeing_flag_expires_at" DATE,
  ADD COLUMN IF NOT EXISTS "support_offered_at" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "support_offered_by_id" UUID,
  ADD COLUMN IF NOT EXISTS "support_notes" TEXT;

-- FK: support_offered_by_id -> users(id) ON DELETE SET NULL
ALTER TABLE "critical_incident_affected"
  DROP CONSTRAINT IF EXISTS "critical_incident_affected_support_offered_by_id_fkey";
ALTER TABLE "critical_incident_affected"
  ADD CONSTRAINT "critical_incident_affected_support_offered_by_id_fkey"
  FOREIGN KEY ("support_offered_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Missing indexes for critical_incident_affected
CREATE INDEX IF NOT EXISTS "idx_critical_incident_affected_tenant_student"
  ON "critical_incident_affected"("tenant_id", "student_id");
CREATE INDEX IF NOT EXISTS "idx_critical_incident_affected_flag_expiry"
  ON "critical_incident_affected"("tenant_id", "wellbeing_flag_expires_at");


-- ─── 3. student_checkins — 1 missing column ─────────────────────────────────

ALTER TABLE "student_checkins"
  ADD COLUMN IF NOT EXISTS "academic_year_id" UUID;

-- Missing indexes for student_checkins
CREATE INDEX IF NOT EXISTS "idx_student_checkins_tenant_student_date"
  ON "student_checkins"("tenant_id", "student_id", "checkin_date" DESC);
CREATE INDEX IF NOT EXISTS "idx_student_checkins_tenant_date_mood"
  ON "student_checkins"("tenant_id", "checkin_date", "mood_score");
CREATE INDEX IF NOT EXISTS "idx_student_checkins_tenant_flagged"
  ON "student_checkins"("tenant_id", "flagged");


-- ─── 4. student_risk_profiles — 2 missing columns ──────────────────────────

ALTER TABLE "student_risk_profiles"
  ADD COLUMN IF NOT EXISTS "acknowledged_by_user_id" UUID,
  ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMPTZ;

-- FK: acknowledged_by_user_id -> users(id) ON DELETE SET NULL
ALTER TABLE "student_risk_profiles"
  DROP CONSTRAINT IF EXISTS "student_risk_profiles_acknowledged_by_user_id_fkey";
ALTER TABLE "student_risk_profiles"
  ADD CONSTRAINT "student_risk_profiles_acknowledged_by_user_id_fkey"
  FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
