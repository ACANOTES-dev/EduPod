-- Migration: 20260409120000_add_report_cards_redesign_foundation
-- Report Cards Redesign — Database Foundation (Implementation 01)
-- Adds 4 enums, extends ReportCardStatus, creates 5 new tables, adds new
-- columns to students/report_cards/report_card_templates/report_card_batch_jobs.
-- See: report-card-spec/design-spec.md §5 and report-card-spec/implementations/01-database-foundation.md

-- ─── 1. New enums ────────────────────────────────────────────────────────────

CREATE TYPE "CommentWindowStatus" AS ENUM ('scheduled', 'open', 'closed');

CREATE TYPE "TeacherRequestType" AS ENUM ('open_comment_window', 'regenerate_reports');

CREATE TYPE "TeacherRequestStatus" AS ENUM ('pending', 'approved', 'rejected', 'completed', 'cancelled');

CREATE TYPE "ReportCardContentScope" AS ENUM ('grades_only');

-- ─── 2. Extend ReportCardStatus enum ─────────────────────────────────────────

ALTER TYPE "ReportCardStatus" ADD VALUE IF NOT EXISTS 'superseded';

-- ─── 3. Existing-table column additions ──────────────────────────────────────

-- students
ALTER TABLE "students"
  ADD COLUMN IF NOT EXISTS "preferred_second_language" VARCHAR(10);

-- report_cards: ADD new columns (teacher_comment kept for back-compat; a later
-- impl will migrate consumers to overall_comment_text and drop teacher_comment)
ALTER TABLE "report_cards"
  ADD COLUMN IF NOT EXISTS "overall_comment_text" TEXT,
  ADD COLUMN IF NOT EXISTS "subject_comments_json" JSONB,
  ADD COLUMN IF NOT EXISTS "personal_info_fields_json" JSONB,
  ADD COLUMN IF NOT EXISTS "pdf_storage_key" VARCHAR(512),
  ADD COLUMN IF NOT EXISTS "template_id" UUID;

-- Backfill overall_comment_text from teacher_comment for existing rows so the
-- new column is in sync at the row level. Idempotent: only fills NULL targets.
UPDATE "report_cards"
   SET "overall_comment_text" = "teacher_comment"
 WHERE "overall_comment_text" IS NULL AND "teacher_comment" IS NOT NULL;

-- report_card_templates: add content_scope
ALTER TABLE "report_card_templates"
  ADD COLUMN IF NOT EXISTS "content_scope" "ReportCardContentScope" NOT NULL DEFAULT 'grades_only';

-- report_card_batch_jobs: extend with run-log columns
ALTER TABLE "report_card_batch_jobs"
  ADD COLUMN IF NOT EXISTS "scope_type" VARCHAR(32),
  ADD COLUMN IF NOT EXISTS "scope_ids_json" JSONB,
  ADD COLUMN IF NOT EXISTS "personal_info_fields_json" JSONB,
  ADD COLUMN IF NOT EXISTS "languages_requested" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "students_generated_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "students_blocked_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "errors_json" JSONB;

-- ─── 4. New tables ──────────────────────────────────────────────────────────

-- 4.1 report_comment_windows
CREATE TABLE "report_comment_windows" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "opens_at" TIMESTAMPTZ NOT NULL,
    "closes_at" TIMESTAMPTZ NOT NULL,
    "status" "CommentWindowStatus" NOT NULL DEFAULT 'scheduled',
    "opened_by_user_id" UUID NOT NULL,
    "closed_at" TIMESTAMPTZ,
    "closed_by_user_id" UUID,
    "instructions" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_comment_windows_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "report_comment_windows_closes_after_opens" CHECK ("closes_at" > "opens_at")
);

-- 4.2 report_card_subject_comments
CREATE TABLE "report_card_subject_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "comment_text" TEXT NOT NULL,
    "is_ai_draft" BOOLEAN NOT NULL DEFAULT false,
    "finalised_at" TIMESTAMPTZ,
    "finalised_by_user_id" UUID,
    "last_ai_drafted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_card_subject_comments_pkey" PRIMARY KEY ("id")
);

-- 4.3 report_card_overall_comments
CREATE TABLE "report_card_overall_comments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "author_user_id" UUID NOT NULL,
    "comment_text" TEXT NOT NULL,
    "finalised_at" TIMESTAMPTZ,
    "finalised_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_card_overall_comments_pkey" PRIMARY KEY ("id")
);

-- 4.4 report_card_teacher_requests
CREATE TABLE "report_card_teacher_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "request_type" "TeacherRequestType" NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "target_scope_json" JSONB,
    "reason" TEXT NOT NULL,
    "status" "TeacherRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "review_note" TEXT,
    "resulting_run_id" UUID,
    "resulting_window_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_card_teacher_requests_pkey" PRIMARY KEY ("id")
);

-- 4.5 report_card_tenant_settings
CREATE TABLE "report_card_tenant_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "settings_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_card_tenant_settings_pkey" PRIMARY KEY ("id")
);

-- ─── 5. Indexes ─────────────────────────────────────────────────────────────

-- report_comment_windows
CREATE INDEX "idx_report_comment_windows_tenant_status" ON "report_comment_windows"("tenant_id", "status");
CREATE INDEX "idx_report_comment_windows_period" ON "report_comment_windows"("tenant_id", "academic_period_id");

-- Unique partial index: at most one open window per tenant
CREATE UNIQUE INDEX "report_comment_windows_one_open_per_tenant"
  ON "report_comment_windows"("tenant_id")
  WHERE "status" = 'open';

-- report_card_subject_comments
CREATE INDEX "idx_subj_comments_teacher" ON "report_card_subject_comments"("tenant_id", "author_user_id", "academic_period_id");
CREATE INDEX "idx_subj_comments_class" ON "report_card_subject_comments"("tenant_id", "class_id", "subject_id", "academic_period_id");
CREATE UNIQUE INDEX "report_card_subject_comments_tenant_id_student_id_subject_i_key"
  ON "report_card_subject_comments"("tenant_id", "student_id", "subject_id", "academic_period_id");

-- report_card_overall_comments
CREATE INDEX "idx_overall_comments_class" ON "report_card_overall_comments"("tenant_id", "class_id", "academic_period_id");
CREATE UNIQUE INDEX "report_card_overall_comments_tenant_id_student_id_academic__key"
  ON "report_card_overall_comments"("tenant_id", "student_id", "academic_period_id");

-- report_card_teacher_requests
CREATE INDEX "idx_teacher_requests_status" ON "report_card_teacher_requests"("tenant_id", "status");
CREATE INDEX "idx_teacher_requests_user" ON "report_card_teacher_requests"("tenant_id", "requested_by_user_id");

-- report_card_tenant_settings
CREATE UNIQUE INDEX "report_card_tenant_settings_tenant_id_key" ON "report_card_tenant_settings"("tenant_id");

-- ─── 6. Foreign keys ────────────────────────────────────────────────────────

-- report_cards.template_id → report_card_templates.id
ALTER TABLE "report_cards"
  ADD CONSTRAINT "report_cards_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "report_card_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- report_comment_windows
ALTER TABLE "report_comment_windows"
  ADD CONSTRAINT "report_comment_windows_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_comment_windows"
  ADD CONSTRAINT "report_comment_windows_academic_period_id_fkey"
  FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_comment_windows"
  ADD CONSTRAINT "report_comment_windows_opened_by_user_id_fkey"
  FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_comment_windows"
  ADD CONSTRAINT "report_comment_windows_closed_by_user_id_fkey"
  FOREIGN KEY ("closed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- report_card_subject_comments
ALTER TABLE "report_card_subject_comments"
  ADD CONSTRAINT "report_card_subject_comments_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_subject_comments"
  ADD CONSTRAINT "report_card_subject_comments_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_subject_comments"
  ADD CONSTRAINT "report_card_subject_comments_subject_id_fkey"
  FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_subject_comments"
  ADD CONSTRAINT "report_card_subject_comments_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_subject_comments"
  ADD CONSTRAINT "report_card_subject_comments_academic_period_id_fkey"
  FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_subject_comments"
  ADD CONSTRAINT "report_card_subject_comments_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_card_subject_comments"
  ADD CONSTRAINT "report_card_subject_comments_finalised_by_user_id_fkey"
  FOREIGN KEY ("finalised_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- report_card_overall_comments
ALTER TABLE "report_card_overall_comments"
  ADD CONSTRAINT "report_card_overall_comments_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_overall_comments"
  ADD CONSTRAINT "report_card_overall_comments_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_overall_comments"
  ADD CONSTRAINT "report_card_overall_comments_class_id_fkey"
  FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_overall_comments"
  ADD CONSTRAINT "report_card_overall_comments_academic_period_id_fkey"
  FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_overall_comments"
  ADD CONSTRAINT "report_card_overall_comments_author_user_id_fkey"
  FOREIGN KEY ("author_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_card_overall_comments"
  ADD CONSTRAINT "report_card_overall_comments_finalised_by_user_id_fkey"
  FOREIGN KEY ("finalised_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- report_card_teacher_requests
ALTER TABLE "report_card_teacher_requests"
  ADD CONSTRAINT "report_card_teacher_requests_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_teacher_requests"
  ADD CONSTRAINT "report_card_teacher_requests_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_card_teacher_requests"
  ADD CONSTRAINT "report_card_teacher_requests_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_card_teacher_requests"
  ADD CONSTRAINT "report_card_teacher_requests_academic_period_id_fkey"
  FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_teacher_requests"
  ADD CONSTRAINT "report_card_teacher_requests_resulting_run_id_fkey"
  FOREIGN KEY ("resulting_run_id") REFERENCES "report_card_batch_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_card_teacher_requests"
  ADD CONSTRAINT "report_card_teacher_requests_resulting_window_id_fkey"
  FOREIGN KEY ("resulting_window_id") REFERENCES "report_comment_windows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- report_card_tenant_settings
ALTER TABLE "report_card_tenant_settings"
  ADD CONSTRAINT "report_card_tenant_settings_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── 7. Backfill ReportCard.template_id ──────────────────────────────────────
-- For every tenant that has at least one report_cards row but no English
-- "Grades Only" template yet, create one. Then backfill report_cards.template_id
-- using the English Grades Only template for the same tenant + locale match.
-- After this migration, code is responsible for ensuring template_id is always
-- set on new rows; a follow-up migration will mark the column NOT NULL.

DO $$
DECLARE
  t RECORD;
  template_uuid UUID;
  system_user_id UUID;
BEGIN
  -- Find an arbitrary user to author seed templates (system fallback).
  -- If no users exist yet, defer template creation entirely.
  SELECT id INTO system_user_id FROM "users" LIMIT 1;
  IF system_user_id IS NULL THEN
    RETURN;
  END IF;

  FOR t IN
    SELECT DISTINCT rc.tenant_id
    FROM "report_cards" rc
    WHERE rc.template_id IS NULL
  LOOP
    -- Try to find an existing English Grades Only template for this tenant
    SELECT id INTO template_uuid
    FROM "report_card_templates"
    WHERE tenant_id = t.tenant_id
      AND locale = 'en'
      AND content_scope = 'grades_only'
    ORDER BY is_default DESC, created_at ASC
    LIMIT 1;

    -- Create a default template if none exists
    IF template_uuid IS NULL THEN
      INSERT INTO "report_card_templates" (
        id, tenant_id, name, is_default, locale, content_scope,
        sections_json, created_by_user_id, created_at, updated_at
      ) VALUES (
        gen_random_uuid(),
        t.tenant_id,
        'Grades Only',
        true,
        'en',
        'grades_only',
        '{}'::jsonb,
        system_user_id,
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      RETURNING id INTO template_uuid;
    END IF;

    -- Backfill report_cards.template_id for all rows belonging to this tenant
    UPDATE "report_cards"
    SET template_id = template_uuid
    WHERE tenant_id = t.tenant_id AND template_id IS NULL;
  END LOOP;
END $$;
