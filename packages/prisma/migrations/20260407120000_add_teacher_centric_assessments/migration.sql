-- ============================================================
-- Teacher-Centric Assessments: Phase 1 Migration
-- ============================================================

-- ─── New Enum: ConfigApprovalStatus ─────────────────────────────────────────
CREATE TYPE "ConfigApprovalStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'archived');

-- ─── Extend AssessmentStatus Enum ───────────────────────────────────────────
ALTER TYPE "AssessmentStatus" ADD VALUE IF NOT EXISTS 'submitted_locked';
ALTER TYPE "AssessmentStatus" ADD VALUE IF NOT EXISTS 'unlock_requested';
ALTER TYPE "AssessmentStatus" ADD VALUE IF NOT EXISTS 'reopened';
ALTER TYPE "AssessmentStatus" ADD VALUE IF NOT EXISTS 'final_locked';

-- ─── Modify assessment_categories ───────────────────────────────────────────

-- Make default_weight nullable (deprecated)
ALTER TABLE "assessment_categories" ALTER COLUMN "default_weight" DROP NOT NULL;

-- Add new columns
ALTER TABLE "assessment_categories" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;
ALTER TABLE "assessment_categories" ADD COLUMN IF NOT EXISTS "subject_id" UUID;
ALTER TABLE "assessment_categories" ADD COLUMN IF NOT EXISTS "year_group_id" UUID;
ALTER TABLE "assessment_categories" ADD COLUMN IF NOT EXISTS "status" "ConfigApprovalStatus" NOT NULL DEFAULT 'approved';
ALTER TABLE "assessment_categories" ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" UUID;
ALTER TABLE "assessment_categories" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMPTZ;
ALTER TABLE "assessment_categories" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

-- Add foreign keys
ALTER TABLE "assessment_categories" ADD CONSTRAINT "assessment_categories_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_categories" ADD CONSTRAINT "assessment_categories_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_categories" ADD CONSTRAINT "assessment_categories_year_group_id_fkey"
  FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_categories" ADD CONSTRAINT "assessment_categories_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop old unique constraint, add new partial unique indexes
DROP INDEX IF EXISTS "idx_assessment_categories_tenant_name";

CREATE UNIQUE INDEX "idx_assessment_categories_scoped"
  ON "assessment_categories" ("tenant_id", "name", "subject_id", "year_group_id")
  WHERE "subject_id" IS NOT NULL AND "year_group_id" IS NOT NULL;

CREATE UNIQUE INDEX "idx_assessment_categories_global"
  ON "assessment_categories" ("tenant_id", "name")
  WHERE "subject_id" IS NULL AND "year_group_id" IS NULL;

CREATE INDEX IF NOT EXISTS "idx_assessment_categories_scope"
  ON "assessment_categories" ("tenant_id", "subject_id", "year_group_id");

-- ─── Modify rubric_templates ────────────────────────────────────────────────

ALTER TABLE "rubric_templates" ADD COLUMN IF NOT EXISTS "status" "ConfigApprovalStatus" NOT NULL DEFAULT 'approved';
ALTER TABLE "rubric_templates" ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" UUID;
ALTER TABLE "rubric_templates" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMPTZ;
ALTER TABLE "rubric_templates" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

ALTER TABLE "rubric_templates" ADD CONSTRAINT "rubric_templates_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Modify curriculum_standards ────────────────────────────────────────────

ALTER TABLE "curriculum_standards" ADD COLUMN IF NOT EXISTS "created_by_user_id" UUID;
ALTER TABLE "curriculum_standards" ADD COLUMN IF NOT EXISTS "status" "ConfigApprovalStatus" NOT NULL DEFAULT 'approved';
ALTER TABLE "curriculum_standards" ADD COLUMN IF NOT EXISTS "reviewed_by_user_id" UUID;
ALTER TABLE "curriculum_standards" ADD COLUMN IF NOT EXISTS "reviewed_at" TIMESTAMPTZ;
ALTER TABLE "curriculum_standards" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

ALTER TABLE "curriculum_standards" ADD CONSTRAINT "curriculum_standards_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "curriculum_standards" ADD CONSTRAINT "curriculum_standards_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── New Table: teacher_grading_weights ─────────────────────────────────────

CREATE TABLE "teacher_grading_weights" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "created_by_user_id" UUID NOT NULL,
  "subject_id" UUID NOT NULL,
  "year_group_id" UUID NOT NULL,
  "academic_period_id" UUID NOT NULL,
  "category_weights_json" JSONB NOT NULL,
  "status" "ConfigApprovalStatus" NOT NULL DEFAULT 'draft',
  "reviewed_by_user_id" UUID,
  "reviewed_at" TIMESTAMPTZ,
  "rejection_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "teacher_grading_weights_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "teacher_grading_weights" ADD CONSTRAINT "teacher_grading_weights_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_grading_weights" ADD CONSTRAINT "teacher_grading_weights_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_grading_weights" ADD CONSTRAINT "teacher_grading_weights_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_grading_weights" ADD CONSTRAINT "teacher_grading_weights_year_group_id_fkey"
  FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_grading_weights" ADD CONSTRAINT "teacher_grading_weights_academic_period_id_fkey"
  FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_grading_weights" ADD CONSTRAINT "teacher_grading_weights_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "idx_teacher_grading_weights_unique"
  ON "teacher_grading_weights" ("tenant_id", "created_by_user_id", "subject_id", "year_group_id", "academic_period_id");
CREATE INDEX "idx_teacher_grading_weights_tenant"
  ON "teacher_grading_weights" ("tenant_id");
CREATE INDEX "idx_teacher_grading_weights_creator"
  ON "teacher_grading_weights" ("tenant_id", "created_by_user_id");

-- ─── New Table: assessment_unlock_requests ──────────────────────────────────

CREATE TABLE "assessment_unlock_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "assessment_id" UUID NOT NULL,
  "requested_by_user_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "ApprovalStepStatus" NOT NULL DEFAULT 'pending',
  "reviewed_by_user_id" UUID,
  "reviewed_at" TIMESTAMPTZ,
  "rejection_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "assessment_unlock_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "assessment_unlock_requests" ADD CONSTRAINT "assessment_unlock_requests_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_unlock_requests" ADD CONSTRAINT "assessment_unlock_requests_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_unlock_requests" ADD CONSTRAINT "assessment_unlock_requests_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_unlock_requests" ADD CONSTRAINT "assessment_unlock_requests_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_unlock_requests_assessment"
  ON "assessment_unlock_requests" ("tenant_id", "assessment_id");
CREATE INDEX "idx_unlock_requests_status"
  ON "assessment_unlock_requests" ("tenant_id", "status");

-- ─── New Table: grade_edit_audits ───────────────────────────────────────────

CREATE TABLE "grade_edit_audits" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id" UUID NOT NULL,
  "grade_id" UUID NOT NULL,
  "assessment_id" UUID NOT NULL,
  "student_id" UUID NOT NULL,
  "old_raw_score" DECIMAL(10, 4),
  "new_raw_score" DECIMAL(10, 4),
  "old_comment" TEXT,
  "new_comment" TEXT,
  "edited_by_user_id" UUID NOT NULL,
  "reason" TEXT NOT NULL,
  "unlock_request_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "grade_edit_audits_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "grade_edit_audits" ADD CONSTRAINT "grade_edit_audits_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_edit_audits" ADD CONSTRAINT "grade_edit_audits_grade_id_fkey"
  FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_edit_audits" ADD CONSTRAINT "grade_edit_audits_assessment_id_fkey"
  FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_edit_audits" ADD CONSTRAINT "grade_edit_audits_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_edit_audits" ADD CONSTRAINT "grade_edit_audits_edited_by_user_id_fkey"
  FOREIGN KEY ("edited_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_edit_audits" ADD CONSTRAINT "grade_edit_audits_unlock_request_id_fkey"
  FOREIGN KEY ("unlock_request_id") REFERENCES "assessment_unlock_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_grade_edit_audits_assessment"
  ON "grade_edit_audits" ("tenant_id", "assessment_id");
CREATE INDEX "idx_grade_edit_audits_grade"
  ON "grade_edit_audits" ("tenant_id", "grade_id");

-- ─── Data Migration ─────────────────────────────────────────────────────────

-- Migrate existing assessment statuses: closed → submitted_locked, locked → final_locked
UPDATE "assessments" SET "status" = 'submitted_locked' WHERE "status" = 'closed';
UPDATE "assessments" SET "status" = 'final_locked' WHERE "status" = 'locked';

-- Existing assessment categories, rubric templates, and curriculum standards
-- are already set to 'approved' via DEFAULT — no action needed.
