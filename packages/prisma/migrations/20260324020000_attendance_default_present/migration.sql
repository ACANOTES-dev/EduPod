-- CreateEnum
CREATE TYPE "AttendanceAlertType" AS ENUM ('excessive_absences', 'recurring_day', 'chronic_tardiness');

-- CreateEnum
CREATE TYPE "AttendanceAlertStatus" AS ENUM ('active', 'acknowledged', 'resolved');

-- AlterTable: AttendanceSession — add default_present
ALTER TABLE "attendance_sessions" ADD COLUMN "default_present" BOOLEAN;

-- AlterTable: AttendanceRecord — add arrival_time
ALTER TABLE "attendance_records" ADD COLUMN "arrival_time" VARCHAR(5);

-- CreateTable: AttendancePatternAlert
CREATE TABLE "attendance_pattern_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "alert_type" "AttendanceAlertType" NOT NULL,
    "detected_date" DATE NOT NULL,
    "window_start" DATE NOT NULL,
    "window_end" DATE NOT NULL,
    "details_json" JSONB NOT NULL,
    "status" "AttendanceAlertStatus" NOT NULL DEFAULT 'active',
    "acknowledged_by" UUID,
    "acknowledged_at" TIMESTAMPTZ,
    "parent_notified" BOOLEAN NOT NULL DEFAULT false,
    "parent_notified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "attendance_pattern_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idx_pattern_alerts_unique" ON "attendance_pattern_alerts"("tenant_id", "student_id", "alert_type", "detected_date");

-- CreateIndex
CREATE INDEX "idx_pattern_alerts_tenant_student" ON "attendance_pattern_alerts"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_pattern_alerts_tenant_status" ON "attendance_pattern_alerts"("tenant_id", "status");

-- AddForeignKey
ALTER TABLE "attendance_pattern_alerts" ADD CONSTRAINT "attendance_pattern_alerts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_pattern_alerts" ADD CONSTRAINT "attendance_pattern_alerts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_pattern_alerts" ADD CONSTRAINT "attendance_pattern_alerts_acknowledged_by_fkey" FOREIGN KEY ("acknowledged_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS for attendance_pattern_alerts
ALTER TABLE attendance_pattern_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation_policy ON attendance_pattern_alerts
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
