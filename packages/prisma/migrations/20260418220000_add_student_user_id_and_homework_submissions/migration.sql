-- Wave 3 — Student identity FK + Homework Submissions.
--
-- Student identity fix (the real headline — fixes a latent data-leakage bug):
--   The Student → User link was previously resolved by matching first_name +
--   last_name within a tenant via `findFirst`, which silently picks an
--   arbitrary row when two students share a name. Under RLS, that means
--   Jane Smith #1 could log in and see Jane Smith #2's timetable, grades,
--   report cards, and (once Wave 3 ships) homework submissions.
--
--   This migration adds students.user_id as a nullable FK and enforces a
--   partial unique index `(tenant_id, user_id) WHERE user_id IS NOT NULL`
--   so each user can be linked to at most one student per tenant. The
--   backfill in post_migrate.sql links Adam Moore (the only current
--   student user, seeded 2026-04-11).
--
-- Homework submission schema:
--   Wave 3 of the homework module introduces student submissions.
--   HomeworkSubmission rows exist only after a student submits (not
--   pre-seeded on publish). State machine: submitted → returned_for_revision
--   → submitted (on resubmit) → graded. A new boolean
--   `homework_assignments.accept_late_submissions` controls whether
--   after-deadline submissions are accepted at all; accepted late
--   submissions carry `is_late = true`.

-- ─── Students.user_id ────────────────────────────────────────────────────────

ALTER TABLE "students"
  ADD COLUMN "user_id" UUID;

ALTER TABLE "students"
  ADD CONSTRAINT "students_user_id_fkey"
  FOREIGN KEY ("user_id")
  REFERENCES "users"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;

-- Partial unique index: each user can be linked to at most one student per
-- tenant. NULLs are allowed (unlinked student rows are still the common case
-- until student users are seeded).
CREATE UNIQUE INDEX "idx_students_tenant_user"
  ON "students"("tenant_id", "user_id")
  WHERE "user_id" IS NOT NULL;

-- ─── HomeworkAssignment.accept_late_submissions ──────────────────────────────

ALTER TABLE "homework_assignments"
  ADD COLUMN "accept_late_submissions" BOOLEAN NOT NULL DEFAULT TRUE;

-- ─── HomeworkSubmission ──────────────────────────────────────────────────────

CREATE TYPE "HomeworkSubmissionStatus" AS ENUM (
  'submitted',
  'returned_for_revision',
  'graded'
);

CREATE TABLE "homework_submissions" (
  "id"                      UUID          NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"               UUID          NOT NULL,
  "homework_assignment_id"  UUID          NOT NULL,
  "student_id"              UUID          NOT NULL,
  "submitted_at"            TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "submission_text"         TEXT,
  "status"                  "HomeworkSubmissionStatus" NOT NULL DEFAULT 'submitted',
  "is_late"                 BOOLEAN       NOT NULL DEFAULT FALSE,
  "teacher_feedback"        TEXT,
  "graded_by_user_id"       UUID,
  "graded_at"               TIMESTAMPTZ,
  "points_awarded"          SMALLINT,
  "version"                 INTEGER       NOT NULL DEFAULT 1,
  "created_at"              TIMESTAMPTZ   NOT NULL DEFAULT now(),
  "updated_at"              TIMESTAMPTZ   NOT NULL DEFAULT now(),

  CONSTRAINT "homework_submissions_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "homework_submissions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "homework_submissions_homework_assignment_id_fkey"
    FOREIGN KEY ("homework_assignment_id") REFERENCES "homework_assignments"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "homework_submissions_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "homework_submissions_graded_by_user_id_fkey"
    FOREIGN KEY ("graded_by_user_id") REFERENCES "users"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

-- Exactly one submission row per (homework, student) — resubmissions update
-- the same row (with version bump), not a new row.
CREATE UNIQUE INDEX "idx_homework_submissions_tenant_assignment_student"
  ON "homework_submissions"("tenant_id", "homework_assignment_id", "student_id");

CREATE INDEX "idx_homework_submissions_tenant_student"
  ON "homework_submissions"("tenant_id", "student_id");

CREATE INDEX "idx_homework_submissions_tenant_status"
  ON "homework_submissions"("tenant_id", "status");

-- ─── HomeworkSubmissionAttachment ────────────────────────────────────────────

CREATE TABLE "homework_submission_attachments" (
  "id"                        UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"                 UUID        NOT NULL,
  "homework_submission_id"    UUID        NOT NULL,
  "attachment_type"           VARCHAR(20) NOT NULL,
  "file_name"                 VARCHAR(255),
  "file_key"                  VARCHAR(500),
  "file_size_bytes"           INTEGER,
  "mime_type"                 VARCHAR(100),
  "url"                       TEXT,
  "display_order"             SMALLINT    NOT NULL DEFAULT 0,
  "created_at"                TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT "homework_submission_attachments_pkey" PRIMARY KEY ("id"),

  CONSTRAINT "homework_submission_attachments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "homework_submission_attachments_homework_submission_id_fkey"
    FOREIGN KEY ("homework_submission_id") REFERENCES "homework_submissions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "idx_homework_submission_attachments_submission"
  ON "homework_submission_attachments"("homework_submission_id");

CREATE INDEX "idx_homework_submission_attachments_tenant"
  ON "homework_submission_attachments"("tenant_id");
