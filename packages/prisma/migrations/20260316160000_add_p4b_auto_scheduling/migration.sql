-- CreateEnum
CREATE TYPE "SchedulePeriodType" AS ENUM ('teaching', 'break_supervision', 'assembly', 'lunch_duty', 'free');

-- CreateEnum
CREATE TYPE "SpreadPreference" AS ENUM ('spread_evenly', 'cluster', 'no_preference');

-- CreateEnum
CREATE TYPE "SchedulingPreferenceType" AS ENUM ('subject', 'class_pref', 'time_slot');

-- CreateEnum
CREATE TYPE "SchedulingPreferencePriority" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "SchedulingRunMode" AS ENUM ('auto', 'hybrid');

-- CreateEnum
CREATE TYPE "SchedulingRunStatus" AS ENUM ('queued', 'running', 'completed', 'failed', 'applied', 'discarded');

-- CreateTable
CREATE TABLE "schedule_period_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "period_name" VARCHAR(50) NOT NULL,
    "period_name_ar" VARCHAR(50),
    "period_order" SMALLINT NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "schedule_period_type" "SchedulePeriodType" NOT NULL DEFAULT 'teaching',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedule_period_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "class_scheduling_requirements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "periods_per_week" SMALLINT NOT NULL,
    "required_room_type" "RoomType",
    "preferred_room_id" UUID,
    "max_consecutive_periods" SMALLINT NOT NULL DEFAULT 2,
    "min_consecutive_periods" SMALLINT NOT NULL DEFAULT 1,
    "spread_preference" "SpreadPreference" NOT NULL DEFAULT 'spread_evenly',
    "student_count" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "class_scheduling_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_availability" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "weekday" SMALLINT NOT NULL,
    "available_from" TIME NOT NULL,
    "available_to" TIME NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_availability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_scheduling_preferences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "staff_profile_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "preference_type" "SchedulingPreferenceType" NOT NULL,
    "preference_payload" JSONB NOT NULL,
    "priority" "SchedulingPreferencePriority" NOT NULL DEFAULT 'medium',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_scheduling_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduling_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "mode" "SchedulingRunMode" NOT NULL,
    "status" "SchedulingRunStatus" NOT NULL,
    "config_snapshot" JSONB,
    "result_json" JSONB,
    "proposed_adjustments" JSONB,
    "hard_constraint_violations" INTEGER NOT NULL DEFAULT 0,
    "soft_preference_score" DECIMAL(8,2),
    "soft_preference_max" DECIMAL(8,2),
    "entries_generated" INTEGER NOT NULL DEFAULT 0,
    "entries_pinned" INTEGER NOT NULL DEFAULT 0,
    "entries_unassigned" INTEGER NOT NULL DEFAULT 0,
    "solver_duration_ms" INTEGER,
    "solver_seed" BIGINT,
    "failure_reason" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "applied_by_user_id" UUID,
    "applied_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scheduling_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_schedule_period_templates_tenant_year" ON "schedule_period_templates"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_schedule_period_templates_order" ON "schedule_period_templates"("tenant_id", "academic_year_id", "weekday", "period_order");

-- CreateIndex
CREATE UNIQUE INDEX "idx_schedule_period_templates_time" ON "schedule_period_templates"("tenant_id", "academic_year_id", "weekday", "start_time");

-- CreateIndex
CREATE UNIQUE INDEX "idx_class_sched_req_unique" ON "class_scheduling_requirements"("tenant_id", "class_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "idx_class_sched_req_tenant_year" ON "class_scheduling_requirements"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_staff_availability_unique" ON "staff_availability"("tenant_id", "staff_profile_id", "academic_year_id", "weekday");

-- CreateIndex
CREATE INDEX "idx_staff_availability_tenant_year" ON "staff_availability"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "idx_staff_sched_prefs_tenant_staff" ON "staff_scheduling_preferences"("tenant_id", "staff_profile_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "idx_staff_sched_prefs_tenant_year" ON "staff_scheduling_preferences"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "idx_scheduling_runs_tenant_year" ON "scheduling_runs"("tenant_id", "academic_year_id", "status");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_schedule_period_template_id_fkey" FOREIGN KEY ("schedule_period_template_id") REFERENCES "schedule_period_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_scheduling_run_id_fkey" FOREIGN KEY ("scheduling_run_id") REFERENCES "scheduling_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_period_templates" ADD CONSTRAINT "schedule_period_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_period_templates" ADD CONSTRAINT "schedule_period_templates_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_scheduling_requirements" ADD CONSTRAINT "class_scheduling_requirements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_scheduling_requirements" ADD CONSTRAINT "class_scheduling_requirements_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_scheduling_requirements" ADD CONSTRAINT "class_scheduling_requirements_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "class_scheduling_requirements" ADD CONSTRAINT "class_scheduling_requirements_preferred_room_id_fkey" FOREIGN KEY ("preferred_room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_availability" ADD CONSTRAINT "staff_availability_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_scheduling_preferences" ADD CONSTRAINT "staff_scheduling_preferences_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_scheduling_preferences" ADD CONSTRAINT "staff_scheduling_preferences_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_scheduling_preferences" ADD CONSTRAINT "staff_scheduling_preferences_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_runs" ADD CONSTRAINT "scheduling_runs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_runs" ADD CONSTRAINT "scheduling_runs_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_runs" ADD CONSTRAINT "scheduling_runs_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduling_runs" ADD CONSTRAINT "scheduling_runs_applied_by_user_id_fkey" FOREIGN KEY ("applied_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
