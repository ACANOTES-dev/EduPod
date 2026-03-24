-- ─── New Enums ─────────────────────────────────────────────────────────────

CREATE TYPE "ClassroomModel" AS ENUM ('fixed_homeroom', 'free_movement');
CREATE TYPE "SubstitutionStatus" AS ENUM ('assigned', 'confirmed', 'declined', 'completed');
CREATE TYPE "ExamSessionStatus" AS ENUM ('planning', 'published', 'completed');
CREATE TYPE "ScenarioStatus" AS ENUM ('draft', 'solved', 'approved', 'rejected');

-- ─── Modify Existing Tables ───────────────────────────────────────────────

-- year_groups: add classroom_model
ALTER TABLE "year_groups" ADD COLUMN "classroom_model" "ClassroomModel" NOT NULL DEFAULT 'fixed_homeroom';

-- classes: add homeroom_id (FK to rooms)
ALTER TABLE "classes" ADD COLUMN "homeroom_id" UUID;

-- schedules: add rotation_week
ALTER TABLE "schedules" ADD COLUMN "rotation_week" SMALLINT;

-- ─── New Tables ───────────────────────────────────────────────────────────

CREATE TABLE "teacher_absences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "absence_date" DATE NOT NULL,
    "full_day" BOOLEAN NOT NULL DEFAULT true,
    "period_from" SMALLINT,
    "period_to" SMALLINT,
    "reason" TEXT,
    "reported_by_user_id" UUID NOT NULL,
    "reported_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "teacher_absences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "substitution_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "absence_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "substitute_staff_id" UUID NOT NULL,
    "status" "SubstitutionStatus" NOT NULL DEFAULT 'assigned',
    "assigned_by_user_id" UUID NOT NULL,
    "assigned_at" TIMESTAMPTZ NOT NULL,
    "confirmed_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "substitution_records_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "calendar_subscription_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "entity_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "calendar_subscription_tokens_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exam_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "ExamSessionStatus" NOT NULL DEFAULT 'planning',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exam_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "exam_session_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "year_group_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "room_id" UUID,
    "duration_minutes" INTEGER NOT NULL,
    "student_count" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "exam_slots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "exam_invigilation" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "exam_slot_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "exam_invigilation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scheduling_scenarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "academic_year_id" UUID NOT NULL,
    "base_run_id" UUID,
    "adjustments_json" JSONB NOT NULL,
    "solver_result_json" JSONB,
    "status" "ScenarioStatus" NOT NULL DEFAULT 'draft',
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "scheduling_scenarios_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rotation_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "cycle_length" SMALLINT NOT NULL,
    "week_labels_json" JSONB NOT NULL,
    "effective_start_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "rotation_configs_pkey" PRIMARY KEY ("id")
);

-- ─── Foreign Keys ─────────────────────────────────────────────────────────

-- classes.homeroom_id -> rooms
ALTER TABLE "classes" ADD CONSTRAINT "classes_homeroom_id_fkey"
    FOREIGN KEY ("homeroom_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- teacher_absences
ALTER TABLE "teacher_absences" ADD CONSTRAINT "teacher_absences_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_absences" ADD CONSTRAINT "teacher_absences_staff_profile_id_fkey"
    FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "teacher_absences" ADD CONSTRAINT "teacher_absences_reported_by_user_id_fkey"
    FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- substitution_records
ALTER TABLE "substitution_records" ADD CONSTRAINT "substitution_records_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "substitution_records" ADD CONSTRAINT "substitution_records_absence_id_fkey"
    FOREIGN KEY ("absence_id") REFERENCES "teacher_absences"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "substitution_records" ADD CONSTRAINT "substitution_records_schedule_id_fkey"
    FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "substitution_records" ADD CONSTRAINT "substitution_records_substitute_staff_id_fkey"
    FOREIGN KEY ("substitute_staff_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "substitution_records" ADD CONSTRAINT "substitution_records_assigned_by_user_id_fkey"
    FOREIGN KEY ("assigned_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- calendar_subscription_tokens
ALTER TABLE "calendar_subscription_tokens" ADD CONSTRAINT "calendar_subscription_tokens_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "calendar_subscription_tokens" ADD CONSTRAINT "calendar_subscription_tokens_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- exam_sessions
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_academic_period_id_fkey"
    FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- exam_slots
ALTER TABLE "exam_slots" ADD CONSTRAINT "exam_slots_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_slots" ADD CONSTRAINT "exam_slots_exam_session_id_fkey"
    FOREIGN KEY ("exam_session_id") REFERENCES "exam_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_slots" ADD CONSTRAINT "exam_slots_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_slots" ADD CONSTRAINT "exam_slots_year_group_id_fkey"
    FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_slots" ADD CONSTRAINT "exam_slots_room_id_fkey"
    FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- exam_invigilation
ALTER TABLE "exam_invigilation" ADD CONSTRAINT "exam_invigilation_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_invigilation" ADD CONSTRAINT "exam_invigilation_exam_slot_id_fkey"
    FOREIGN KEY ("exam_slot_id") REFERENCES "exam_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "exam_invigilation" ADD CONSTRAINT "exam_invigilation_staff_profile_id_fkey"
    FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- scheduling_scenarios
ALTER TABLE "scheduling_scenarios" ADD CONSTRAINT "scheduling_scenarios_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scheduling_scenarios" ADD CONSTRAINT "scheduling_scenarios_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scheduling_scenarios" ADD CONSTRAINT "scheduling_scenarios_base_run_id_fkey"
    FOREIGN KEY ("base_run_id") REFERENCES "scheduling_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "scheduling_scenarios" ADD CONSTRAINT "scheduling_scenarios_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- rotation_configs
ALTER TABLE "rotation_configs" ADD CONSTRAINT "rotation_configs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rotation_configs" ADD CONSTRAINT "rotation_configs_academic_year_id_fkey"
    FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Unique Constraints ───────────────────────────────────────────────────

CREATE UNIQUE INDEX "idx_teacher_absences_unique" ON "teacher_absences"("tenant_id", "staff_profile_id", "absence_date");
CREATE UNIQUE INDEX "calendar_subscription_tokens_token_key" ON "calendar_subscription_tokens"("token");
CREATE UNIQUE INDEX "idx_rotation_configs_tenant_year" ON "rotation_configs"("tenant_id", "academic_year_id");

-- ─── Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX "idx_teacher_absences_tenant_date" ON "teacher_absences"("tenant_id", "absence_date");
CREATE INDEX "idx_substitution_records_tenant_date" ON "substitution_records"("tenant_id", "created_at");
CREATE INDEX "idx_calendar_subscription_tokens_tenant_user" ON "calendar_subscription_tokens"("tenant_id", "user_id");
CREATE INDEX "idx_exam_sessions_tenant_period" ON "exam_sessions"("tenant_id", "academic_period_id");
CREATE INDEX "idx_exam_slots_tenant_session" ON "exam_slots"("tenant_id", "exam_session_id");
CREATE INDEX "idx_exam_invigilation_tenant_slot" ON "exam_invigilation"("tenant_id", "exam_slot_id");
CREATE INDEX "idx_scheduling_scenarios_tenant_year" ON "scheduling_scenarios"("tenant_id", "academic_year_id");

-- ─── RLS Policies ─────────────────────────────────────────────────────────

ALTER TABLE "teacher_absences" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_teacher_absences ON "teacher_absences"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "substitution_records" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_substitution_records ON "substitution_records"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "calendar_subscription_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_calendar_subscription_tokens ON "calendar_subscription_tokens"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "exam_sessions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_exam_sessions ON "exam_sessions"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "exam_slots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_exam_slots ON "exam_slots"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "exam_invigilation" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_exam_invigilation ON "exam_invigilation"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "scheduling_scenarios" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_scheduling_scenarios ON "scheduling_scenarios"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "rotation_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_rotation_configs ON "rotation_configs"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
