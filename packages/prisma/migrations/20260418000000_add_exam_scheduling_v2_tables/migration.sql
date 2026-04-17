-- Exam Scheduling v2: config matrices + invigilator pool + multi-room slot assignments.
-- See /packages/prisma/rls/policies.sql for the authoritative RLS catalogue.

-- ─── ExamSlot extensions ─────────────────────────────────────────────────────
ALTER TABLE "exam_slots"
  ADD COLUMN "paper_number"            SMALLINT,
  ADD COLUMN "exam_subject_config_id"  UUID,
  ADD COLUMN "gradebook_assessment_id" UUID;

-- ─── ExamInvigilation extensions ─────────────────────────────────────────────
ALTER TABLE "exam_invigilation"
  ADD COLUMN "exam_slot_room_id" UUID;

-- ─── exam_session_configs ────────────────────────────────────────────────────
CREATE TABLE "exam_session_configs" (
  "id"                            UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"                     UUID         NOT NULL,
  "exam_session_id"               UUID         NOT NULL,
  "allowed_weekdays"              INTEGER[]    NOT NULL,
  "morning_start"                 TIME         NOT NULL,
  "morning_end"                   TIME         NOT NULL,
  "afternoon_start"               TIME         NOT NULL,
  "afternoon_end"                 TIME         NOT NULL,
  "min_gap_minutes_same_student"  INTEGER      NOT NULL DEFAULT 0,
  "max_exams_per_day_per_yg"      INTEGER      NOT NULL DEFAULT 2,
  "created_at"                    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"                    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "exam_session_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exam_session_configs_exam_session_id_key"
  ON "exam_session_configs"("exam_session_id");

CREATE INDEX "idx_exam_session_configs_tenant_session"
  ON "exam_session_configs"("tenant_id", "exam_session_id");

ALTER TABLE "exam_session_configs"
  ADD CONSTRAINT "exam_session_configs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "exam_session_configs_exam_session_id_fkey"
    FOREIGN KEY ("exam_session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE;

-- ─── exam_subject_configs ────────────────────────────────────────────────────
CREATE TABLE "exam_subject_configs" (
  "id"                    UUID         NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"             UUID         NOT NULL,
  "exam_session_id"       UUID         NOT NULL,
  "year_group_id"         UUID         NOT NULL,
  "subject_id"            UUID         NOT NULL,
  "is_examinable"         BOOLEAN      NOT NULL DEFAULT true,
  "paper_count"           SMALLINT     NOT NULL DEFAULT 1,
  "paper_1_duration_mins" INTEGER      NOT NULL DEFAULT 90,
  "paper_2_duration_mins" INTEGER,
  "mode"                  VARCHAR(20)  NOT NULL DEFAULT 'in_person',
  "invigilators_required" INTEGER      NOT NULL DEFAULT 2,
  "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  "updated_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT "exam_subject_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_exam_subject_config_session_yg_subject"
  ON "exam_subject_configs"("exam_session_id", "year_group_id", "subject_id");

CREATE INDEX "idx_exam_subject_configs_tenant_session"
  ON "exam_subject_configs"("tenant_id", "exam_session_id");

ALTER TABLE "exam_subject_configs"
  ADD CONSTRAINT "exam_subject_configs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "exam_subject_configs_exam_session_id_fkey"
    FOREIGN KEY ("exam_session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "exam_subject_configs_year_group_id_fkey"
    FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "exam_subject_configs_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE;

-- ─── exam_invigilator_pool ───────────────────────────────────────────────────
CREATE TABLE "exam_invigilator_pool" (
  "id"               UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"        UUID        NOT NULL,
  "exam_session_id"  UUID        NOT NULL,
  "staff_profile_id" UUID        NOT NULL,
  "created_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "exam_invigilator_pool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_exam_invigilator_pool_session_staff"
  ON "exam_invigilator_pool"("exam_session_id", "staff_profile_id");

CREATE INDEX "idx_exam_invigilator_pool_tenant_session"
  ON "exam_invigilator_pool"("tenant_id", "exam_session_id");

ALTER TABLE "exam_invigilator_pool"
  ADD CONSTRAINT "exam_invigilator_pool_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "exam_invigilator_pool_exam_session_id_fkey"
    FOREIGN KEY ("exam_session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "exam_invigilator_pool_staff_profile_id_fkey"
    FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE;

-- ─── exam_slot_rooms ─────────────────────────────────────────────────────────
CREATE TABLE "exam_slot_rooms" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"    UUID        NOT NULL,
  "exam_slot_id" UUID        NOT NULL,
  "room_id"      UUID        NOT NULL,
  "capacity"     INTEGER     NOT NULL,
  "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "exam_slot_rooms_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_exam_slot_rooms_tenant_slot"
  ON "exam_slot_rooms"("tenant_id", "exam_slot_id");

ALTER TABLE "exam_slot_rooms"
  ADD CONSTRAINT "exam_slot_rooms_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "exam_slot_rooms_exam_slot_id_fkey"
    FOREIGN KEY ("exam_slot_id") REFERENCES "exam_slots"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "exam_slot_rooms_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE;

-- ─── ExamSlot FK to exam_subject_configs ─────────────────────────────────────
ALTER TABLE "exam_slots"
  ADD CONSTRAINT "exam_slots_exam_subject_config_id_fkey"
    FOREIGN KEY ("exam_subject_config_id") REFERENCES "exam_subject_configs"("id") ON DELETE SET NULL;

-- ─── ExamInvigilation FK to exam_slot_rooms ──────────────────────────────────
ALTER TABLE "exam_invigilation"
  ADD CONSTRAINT "exam_invigilation_exam_slot_room_id_fkey"
    FOREIGN KEY ("exam_slot_room_id") REFERENCES "exam_slot_rooms"("id") ON DELETE SET NULL;
