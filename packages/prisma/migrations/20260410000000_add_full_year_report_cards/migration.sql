-- Migration: 20260410000000_add_full_year_report_cards
-- Report Cards Phase 1b — Option B: full-year report cards
--
-- Makes `academic_period_id` nullable on 6 report-card tables and adds
-- `academic_year_id NOT NULL` beside it. NULL period now represents a
-- "full year" row; the year column is always populated and authoritative.
--
-- Two partial unique indexes replace the existing period-inclusive uniques
-- on the comment tables so NULL period doesn't silently admit duplicates.
-- (Postgres treats NULL as distinct from NULL in normal uniques.)
--
-- Rollback: ONLY safe while no NULL-period rows exist. Once a full-year
-- report card is generated, reverting means backfilling or deleting those
-- rows. A tag + pg_dump is taken before deploy (see ReportCard-WIP.md §6).

-- ═════════════════════════════════════════════════════════════════════════
-- 1. ADD nullable academic_year_id column on every affected table
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE "report_cards"
  ADD COLUMN IF NOT EXISTS "academic_year_id" UUID;

ALTER TABLE "report_card_batch_jobs"
  ADD COLUMN IF NOT EXISTS "academic_year_id" UUID;

ALTER TABLE "report_comment_windows"
  ADD COLUMN IF NOT EXISTS "academic_year_id" UUID;

ALTER TABLE "report_card_subject_comments"
  ADD COLUMN IF NOT EXISTS "academic_year_id" UUID;

ALTER TABLE "report_card_overall_comments"
  ADD COLUMN IF NOT EXISTS "academic_year_id" UUID;

ALTER TABLE "report_card_teacher_requests"
  ADD COLUMN IF NOT EXISTS "academic_year_id" UUID;

-- ═════════════════════════════════════════════════════════════════════════
-- 2. BACKFILL academic_year_id from the existing period's parent year
-- ═════════════════════════════════════════════════════════════════════════
-- Safe because all existing rows have NOT NULL academic_period_id today.
-- After backfill, the new column is 100% populated and can be NOT NULL-ed.

UPDATE "report_cards" rc
   SET "academic_year_id" = ap."academic_year_id"
  FROM "academic_periods" ap
 WHERE rc."academic_period_id" = ap."id"
   AND rc."academic_year_id" IS NULL;

UPDATE "report_card_batch_jobs" b
   SET "academic_year_id" = ap."academic_year_id"
  FROM "academic_periods" ap
 WHERE b."academic_period_id" = ap."id"
   AND b."academic_year_id" IS NULL;

UPDATE "report_comment_windows" w
   SET "academic_year_id" = ap."academic_year_id"
  FROM "academic_periods" ap
 WHERE w."academic_period_id" = ap."id"
   AND w."academic_year_id" IS NULL;

UPDATE "report_card_subject_comments" sc
   SET "academic_year_id" = ap."academic_year_id"
  FROM "academic_periods" ap
 WHERE sc."academic_period_id" = ap."id"
   AND sc."academic_year_id" IS NULL;

UPDATE "report_card_overall_comments" oc
   SET "academic_year_id" = ap."academic_year_id"
  FROM "academic_periods" ap
 WHERE oc."academic_period_id" = ap."id"
   AND oc."academic_year_id" IS NULL;

UPDATE "report_card_teacher_requests" tr
   SET "academic_year_id" = ap."academic_year_id"
  FROM "academic_periods" ap
 WHERE tr."academic_period_id" = ap."id"
   AND tr."academic_year_id" IS NULL;

-- ═════════════════════════════════════════════════════════════════════════
-- 3. SET NOT NULL on academic_year_id (backfill complete)
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE "report_cards" ALTER COLUMN "academic_year_id" SET NOT NULL;
ALTER TABLE "report_card_batch_jobs" ALTER COLUMN "academic_year_id" SET NOT NULL;
ALTER TABLE "report_comment_windows" ALTER COLUMN "academic_year_id" SET NOT NULL;
ALTER TABLE "report_card_subject_comments" ALTER COLUMN "academic_year_id" SET NOT NULL;
ALTER TABLE "report_card_overall_comments" ALTER COLUMN "academic_year_id" SET NOT NULL;
ALTER TABLE "report_card_teacher_requests" ALTER COLUMN "academic_year_id" SET NOT NULL;

-- ═════════════════════════════════════════════════════════════════════════
-- 4. ADD foreign keys to academic_years(id)
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE "report_cards"
  ADD CONSTRAINT "report_cards_academic_year_id_fkey"
  FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_card_batch_jobs"
  ADD CONSTRAINT "report_card_batch_jobs_academic_year_id_fkey"
  FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_comment_windows"
  ADD CONSTRAINT "report_comment_windows_academic_year_id_fkey"
  FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_card_subject_comments"
  ADD CONSTRAINT "report_card_subject_comments_academic_year_id_fkey"
  FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_card_overall_comments"
  ADD CONSTRAINT "report_card_overall_comments_academic_year_id_fkey"
  FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_card_teacher_requests"
  ADD CONSTRAINT "report_card_teacher_requests_academic_year_id_fkey"
  FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ═════════════════════════════════════════════════════════════════════════
-- 5. MAKE academic_period_id nullable on every affected table
-- ═════════════════════════════════════════════════════════════════════════

ALTER TABLE "report_cards" ALTER COLUMN "academic_period_id" DROP NOT NULL;
ALTER TABLE "report_card_batch_jobs" ALTER COLUMN "academic_period_id" DROP NOT NULL;
ALTER TABLE "report_comment_windows" ALTER COLUMN "academic_period_id" DROP NOT NULL;
ALTER TABLE "report_card_subject_comments" ALTER COLUMN "academic_period_id" DROP NOT NULL;
ALTER TABLE "report_card_overall_comments" ALTER COLUMN "academic_period_id" DROP NOT NULL;
ALTER TABLE "report_card_teacher_requests" ALTER COLUMN "academic_period_id" DROP NOT NULL;

-- ═════════════════════════════════════════════════════════════════════════
-- 6. DROP existing period-inclusive unique indexes on the comment tables
-- ═════════════════════════════════════════════════════════════════════════
-- These were auto-named by Prisma (truncated `_key` suffixes). Partial
-- unique indexes replace them below so NULL period rows don't silently
-- admit duplicates (NULL ≠ NULL in normal Postgres uniques).

DROP INDEX IF EXISTS "report_card_subject_comments_tenant_id_student_id_subject_i_key";
DROP INDEX IF EXISTS "report_card_overall_comments_tenant_id_student_id_academic__key";

-- ═════════════════════════════════════════════════════════════════════════
-- 7. ADD partial unique indexes — period-scoped AND year-scoped pairs
-- ═════════════════════════════════════════════════════════════════════════
--
-- Period-scoped rows: (tenant, student, subject/overall, period) unique
-- WHERE period IS NOT NULL → one per-period comment per student.
--
-- Year-scoped rows: (tenant, student, subject/overall, year) unique
-- WHERE period IS NULL → one full-year comment per student.

CREATE UNIQUE INDEX "uniq_subj_comment_period"
  ON "report_card_subject_comments"
     ("tenant_id", "student_id", "subject_id", "academic_period_id")
  WHERE "academic_period_id" IS NOT NULL;

CREATE UNIQUE INDEX "uniq_subj_comment_year"
  ON "report_card_subject_comments"
     ("tenant_id", "student_id", "subject_id", "academic_year_id")
  WHERE "academic_period_id" IS NULL;

CREATE UNIQUE INDEX "uniq_overall_comment_period"
  ON "report_card_overall_comments"
     ("tenant_id", "student_id", "academic_period_id")
  WHERE "academic_period_id" IS NOT NULL;

CREATE UNIQUE INDEX "uniq_overall_comment_year"
  ON "report_card_overall_comments"
     ("tenant_id", "student_id", "academic_year_id")
  WHERE "academic_period_id" IS NULL;

-- ═════════════════════════════════════════════════════════════════════════
-- 8. ADD secondary year-scoped indexes for lookups
-- ═════════════════════════════════════════════════════════════════════════

CREATE INDEX "idx_report_cards_year"
  ON "report_cards"("tenant_id", "academic_year_id");

CREATE INDEX "idx_report_card_batch_jobs_year"
  ON "report_card_batch_jobs"("tenant_id", "academic_year_id");

CREATE INDEX "idx_report_comment_windows_year"
  ON "report_comment_windows"("tenant_id", "academic_year_id");

CREATE INDEX "idx_subj_comments_year"
  ON "report_card_subject_comments"
     ("tenant_id", "student_id", "subject_id", "academic_year_id");

CREATE INDEX "idx_overall_comments_year"
  ON "report_card_overall_comments"
     ("tenant_id", "student_id", "academic_year_id");

CREATE INDEX "idx_teacher_requests_year"
  ON "report_card_teacher_requests"("tenant_id", "academic_year_id");
