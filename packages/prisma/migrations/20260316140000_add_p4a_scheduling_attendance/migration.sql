-- CreateEnum
CREATE TYPE "RoomType" AS ENUM ('classroom', 'lab', 'gym', 'auditorium', 'library', 'computer_lab', 'art_room', 'music_room', 'outdoor', 'other');

-- CreateEnum
CREATE TYPE "ScheduleSource" AS ENUM ('manual', 'auto_generated', 'pinned');

-- CreateEnum
CREATE TYPE "ClosureScope" AS ENUM ('all', 'year_group', 'class');

-- CreateEnum
CREATE TYPE "AttendanceSessionStatus" AS ENUM ('open', 'submitted', 'locked', 'cancelled');

-- CreateEnum
CREATE TYPE "AttendanceRecordStatus" AS ENUM ('present', 'absent_unexcused', 'absent_excused', 'late', 'left_early');

-- CreateEnum
CREATE TYPE "DailyAttendanceStatus" AS ENUM ('present', 'partially_absent', 'absent', 'late', 'excused');

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "room_type" "RoomType" NOT NULL DEFAULT 'classroom',
    "capacity" INTEGER,
    "is_exclusive" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "room_id" UUID,
    "teacher_staff_id" UUID,
    "schedule_period_template_id" UUID,
    "period_order" SMALLINT,
    "weekday" SMALLINT NOT NULL,
    "start_time" TIME NOT NULL,
    "end_time" TIME NOT NULL,
    "effective_start_date" DATE NOT NULL,
    "effective_end_date" DATE,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "pin_reason" TEXT,
    "source" "ScheduleSource" NOT NULL DEFAULT 'manual',
    "scheduling_run_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "school_closures" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "closure_date" DATE NOT NULL,
    "reason" VARCHAR(255) NOT NULL,
    "affects_scope" "ClosureScope" NOT NULL DEFAULT 'all',
    "scope_entity_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "school_closures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_sessions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "schedule_id" UUID,
    "session_date" DATE NOT NULL,
    "status" "AttendanceSessionStatus" NOT NULL,
    "override_reason" TEXT,
    "submitted_by_user_id" UUID,
    "submitted_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "attendance_session_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "AttendanceRecordStatus" NOT NULL,
    "reason" TEXT,
    "marked_by_user_id" UUID NOT NULL,
    "marked_at" TIMESTAMPTZ NOT NULL,
    "amended_from_status" VARCHAR(50),
    "amendment_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_attendance_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "summary_date" DATE NOT NULL,
    "derived_status" "DailyAttendanceStatus" NOT NULL,
    "derived_payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "daily_attendance_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_rooms_tenant" ON "rooms"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_rooms_tenant_name" ON "rooms"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "idx_rooms_tenant_active" ON "rooms"("tenant_id") WHERE active = true;

-- CreateIndex
CREATE INDEX "idx_schedules_tenant_class" ON "schedules"("tenant_id", "class_id", "weekday");

-- CreateIndex
CREATE INDEX "idx_schedules_tenant_room" ON "schedules"("tenant_id", "room_id", "weekday");

-- CreateIndex
CREATE INDEX "idx_schedules_tenant_teacher" ON "schedules"("tenant_id", "teacher_staff_id", "weekday");

-- CreateIndex
CREATE INDEX "idx_schedules_tenant_weekday" ON "schedules"("tenant_id", "weekday", "effective_start_date", "effective_end_date");

-- CreateIndex
CREATE INDEX "idx_schedules_tenant_year" ON "schedules"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "idx_schedules_pinned" ON "schedules"("tenant_id", "academic_year_id", "is_pinned") WHERE is_pinned = true;

-- CreateIndex
CREATE INDEX "idx_schedules_auto_generated" ON "schedules"("tenant_id", "academic_year_id", "source") WHERE source = 'auto_generated';

-- CreateIndex
CREATE INDEX "idx_schedules_run" ON "schedules"("scheduling_run_id") WHERE scheduling_run_id IS NOT NULL;

-- CreateIndex
CREATE INDEX "idx_school_closures_tenant_date" ON "school_closures"("tenant_id", "closure_date");

-- CreateIndex
CREATE INDEX "idx_attendance_sessions_tenant_date" ON "attendance_sessions"("tenant_id", "session_date");

-- CreateIndex
CREATE INDEX "idx_attendance_sessions_tenant_date_status" ON "attendance_sessions"("tenant_id", "session_date", "status");

-- CreateIndex
CREATE INDEX "idx_attendance_sessions_tenant_class_status" ON "attendance_sessions"("tenant_id", "class_id", "status");

-- CreateIndex
CREATE INDEX "idx_attendance_records_session" ON "attendance_records"("tenant_id", "attendance_session_id");

-- CreateIndex
CREATE INDEX "idx_attendance_records_student" ON "attendance_records"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_daily_summaries_tenant_student" ON "daily_attendance_summaries"("tenant_id", "student_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_daily_summary_unique" ON "daily_attendance_summaries"("tenant_id", "student_id", "summary_date");

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_teacher_staff_id_fkey" FOREIGN KEY ("teacher_staff_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_closures" ADD CONSTRAINT "school_closures_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "school_closures" ADD CONSTRAINT "school_closures_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_sessions" ADD CONSTRAINT "attendance_sessions_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_attendance_session_id_fkey" FOREIGN KEY ("attendance_session_id") REFERENCES "attendance_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_marked_by_user_id_fkey" FOREIGN KEY ("marked_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_attendance_summaries" ADD CONSTRAINT "daily_attendance_summaries_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_attendance_summaries" ADD CONSTRAINT "daily_attendance_summaries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
