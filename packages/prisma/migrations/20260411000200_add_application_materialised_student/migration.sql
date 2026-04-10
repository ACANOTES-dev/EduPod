-- ============================================================
-- New Admissions — Conversion-to-Student Service (Wave 2 / Impl 05)
-- ============================================================
--
-- Adds applications.materialised_student_id so the auto-conversion service
-- can track whether an application has already been converted into a
-- Student record and short-circuit subsequent calls idempotently.
--
-- Additive and idempotent; safe to re-run.

ALTER TABLE "applications"
  ADD COLUMN IF NOT EXISTS "materialised_student_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'applications_materialised_student_id_fkey'
  ) THEN
    ALTER TABLE "applications"
      ADD CONSTRAINT "applications_materialised_student_id_fkey"
      FOREIGN KEY ("materialised_student_id") REFERENCES "students"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "idx_applications_materialised_student"
  ON "applications" ("materialised_student_id")
  WHERE "materialised_student_id" IS NOT NULL;
