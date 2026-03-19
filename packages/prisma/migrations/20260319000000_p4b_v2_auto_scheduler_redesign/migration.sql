-- P4B-v2: Auto-Scheduler Redesign
-- New enum, new tables, modified tables for the comprehensive auto-scheduler

-- ─── New Enum ───────────────────────────────────────────────────────────────

CREATE TYPE "SupervisionMode" AS ENUM ('none', 'yard', 'classroom_previous', 'classroom_next');

-- ─── Modify schedule_period_templates ───────────────────────────────────────

ALTER TABLE "schedule_period_templates"
  ADD COLUMN "year_group_id" UUID,
  ADD COLUMN "supervision_mode" "SupervisionMode" NOT NULL DEFAULT 'none',
  ADD COLUMN "break_group_id" UUID;

-- FK constraints for new columns (added after tables are created below)
ALTER TABLE "schedule_period_templates"
  ADD CONSTRAINT "schedule_period_templates_year_group_id_fkey"
    FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── New Table: curriculum_requirements ──────────────────────────────────────

CREATE TABLE "curriculum_requirements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "year_group_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "min_periods_per_week" SMALLINT NOT NULL,
    "max_periods_per_day" SMALLINT NOT NULL DEFAULT 1,
    "preferred_periods_per_week" SMALLINT,
    "requires_double_period" BOOLEAN NOT NULL DEFAULT false,
    "double_period_count" SMALLINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "curriculum_requirements_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "curriculum_requirements"
  ADD CONSTRAINT "curriculum_requirements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "curriculum_requirements_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "curriculum_requirements_year_group_id_fkey" FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "curriculum_requirements_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "idx_curriculum_req_unique" ON "curriculum_requirements"("tenant_id", "academic_year_id", "year_group_id", "subject_id");
CREATE INDEX "idx_curriculum_req_tenant_year" ON "curriculum_requirements"("tenant_id", "academic_year_id");
CREATE INDEX "idx_curriculum_req_year_group" ON "curriculum_requirements"("tenant_id", "academic_year_id", "year_group_id");

-- ─── New Table: teacher_competencies ────────────────────────────────────────

CREATE TABLE "teacher_competencies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "year_group_id" UUID NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "teacher_competencies_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "teacher_competencies"
  ADD CONSTRAINT "teacher_competencies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "teacher_competencies_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "teacher_competencies_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "teacher_competencies_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "teacher_competencies_year_group_id_fkey" FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "idx_teacher_competency_unique" ON "teacher_competencies"("tenant_id", "academic_year_id", "staff_profile_id", "subject_id", "year_group_id");
CREATE INDEX "idx_teacher_competency_staff" ON "teacher_competencies"("tenant_id", "academic_year_id", "staff_profile_id");
CREATE INDEX "idx_teacher_competency_subject_year" ON "teacher_competencies"("tenant_id", "academic_year_id", "subject_id", "year_group_id");

-- ─── New Table: break_groups ────────────────────────────────────────────────

CREATE TABLE "break_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_ar" VARCHAR(100),
    "location" VARCHAR(100),
    "required_supervisor_count" SMALLINT NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "break_groups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "break_groups"
  ADD CONSTRAINT "break_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "break_groups_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "idx_break_groups_unique" ON "break_groups"("tenant_id", "academic_year_id", "name");
CREATE INDEX "idx_break_groups_tenant_year" ON "break_groups"("tenant_id", "academic_year_id");

-- FK for schedule_period_templates.break_group_id (now that break_groups exists)
ALTER TABLE "schedule_period_templates"
  ADD CONSTRAINT "schedule_period_templates_break_group_id_fkey"
    FOREIGN KEY ("break_group_id") REFERENCES "break_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── New Table: break_group_year_groups ─────────────────────────────────────

CREATE TABLE "break_group_year_groups" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "break_group_id" UUID NOT NULL,
    "year_group_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "break_group_year_groups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "break_group_year_groups"
  ADD CONSTRAINT "break_group_year_groups_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "break_group_year_groups_break_group_id_fkey" FOREIGN KEY ("break_group_id") REFERENCES "break_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "break_group_year_groups_year_group_id_fkey" FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "idx_break_group_year_groups_unique" ON "break_group_year_groups"("tenant_id", "break_group_id", "year_group_id");

-- ─── New Table: room_closures ───────────────────────────────────────────────

CREATE TABLE "room_closures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,
    "date_from" DATE NOT NULL,
    "date_to" DATE NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "room_closures_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "room_closures_date_range_check" CHECK ("date_to" >= "date_from")
);

ALTER TABLE "room_closures"
  ADD CONSTRAINT "room_closures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "room_closures_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "room_closures_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON UPDATE CASCADE;

CREATE INDEX "idx_room_closures_tenant_room" ON "room_closures"("tenant_id", "room_id");
CREATE INDEX "idx_room_closures_dates" ON "room_closures"("tenant_id", "date_from", "date_to");

-- ─── New Table: teacher_scheduling_configs ───────────────────────────────────

CREATE TABLE "teacher_scheduling_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "max_periods_per_week" SMALLINT,
    "max_periods_per_day" SMALLINT,
    "max_supervision_duties_per_week" SMALLINT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "teacher_scheduling_configs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "teacher_scheduling_configs"
  ADD CONSTRAINT "teacher_scheduling_configs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "teacher_scheduling_configs_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "teacher_scheduling_configs_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "idx_teacher_sched_config_unique" ON "teacher_scheduling_configs"("tenant_id", "staff_profile_id", "academic_year_id");
CREATE INDEX "idx_teacher_sched_config_tenant_year" ON "teacher_scheduling_configs"("tenant_id", "academic_year_id");
