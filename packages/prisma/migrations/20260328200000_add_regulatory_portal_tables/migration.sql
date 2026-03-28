-- CreateEnum
CREATE TYPE "RegulatoryDomain" AS ENUM ('tusla_attendance', 'des_september_returns', 'des_october_census', 'ppod_sync', 'pod_sync', 'child_safeguarding', 'anti_bullying', 'fssu_financial', 'inspectorate_wse', 'sen_provision', 'gdpr_compliance', 'seai_energy', 'admissions_compliance', 'board_governance');

CREATE TYPE "RegulatorySubmissionStatus" AS ENUM ('not_started', 'in_progress', 'ready_for_review', 'submitted', 'accepted', 'rejected', 'overdue');

CREATE TYPE "CalendarEventType" AS ENUM ('hard_deadline', 'soft_deadline', 'preparation', 'reminder');

CREATE TYPE "TuslaAbsenceCategory" AS ENUM ('illness', 'urgent_family_reason', 'holiday', 'suspension', 'expulsion', 'other', 'unexplained');

CREATE TYPE "ReducedSchoolDayReason" AS ENUM ('behaviour_management', 'medical_needs', 'phased_return', 'assessment_pending', 'other');

CREATE TYPE "PodDatabaseType" AS ENUM ('ppod', 'pod');

CREATE TYPE "PodSyncStatus" AS ENUM ('pending', 'synced', 'changed', 'error', 'not_applicable');

CREATE TYPE "PodSyncType" AS ENUM ('full', 'incremental', 'manual');

CREATE TYPE "PodSyncLogStatus" AS ENUM ('in_progress', 'completed', 'completed_with_errors', 'failed');

CREATE TYPE "TransferDirection" AS ENUM ('inbound', 'outbound');

CREATE TYPE "TransferStatus" AS ENUM ('pending', 'accepted', 'rejected', 'completed', 'cancelled');

CREATE TYPE "CbaSyncStatus" AS ENUM ('pending', 'synced', 'error');

-- CreateTable
CREATE TABLE "regulatory_calendar_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "domain" "RegulatoryDomain" NOT NULL,
    "event_type" "CalendarEventType" NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "due_date" DATE NOT NULL,
    "academic_year" VARCHAR(20),
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrence_rule" VARCHAR(100),
    "reminder_days" SMALLINT[],
    "status" "RegulatorySubmissionStatus" NOT NULL DEFAULT 'not_started',
    "completed_at" TIMESTAMPTZ,
    "completed_by_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "regulatory_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regulatory_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "domain" "RegulatoryDomain" NOT NULL,
    "submission_type" VARCHAR(100) NOT NULL,
    "academic_year" VARCHAR(20) NOT NULL,
    "period_label" VARCHAR(50),
    "status" "RegulatorySubmissionStatus" NOT NULL,
    "generated_at" TIMESTAMPTZ,
    "generated_by_id" UUID,
    "submitted_at" TIMESTAMPTZ,
    "submitted_by_id" UUID,
    "file_key" VARCHAR(500),
    "file_hash" VARCHAR(64),
    "record_count" INTEGER,
    "validation_errors" JSONB,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "regulatory_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tusla_absence_code_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "attendance_status" "AttendanceRecordStatus" NOT NULL,
    "reason_pattern" VARCHAR(255),
    "tusla_category" "TuslaAbsenceCategory" NOT NULL,
    "display_label" VARCHAR(100) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "tusla_absence_code_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reduced_school_days" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "hours_per_day" DECIMAL(4,2) NOT NULL,
    "reason" "ReducedSchoolDayReason" NOT NULL,
    "reason_detail" TEXT,
    "approved_by_id" UUID NOT NULL,
    "parent_consent_date" DATE,
    "review_date" DATE,
    "tusla_notified" BOOLEAN NOT NULL DEFAULT false,
    "tusla_notified_at" TIMESTAMPTZ,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "reduced_school_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "des_subject_code_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "des_code" VARCHAR(10) NOT NULL,
    "des_name" VARCHAR(150) NOT NULL,
    "des_level" VARCHAR(50),
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "des_subject_code_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppod_student_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "database_type" "PodDatabaseType" NOT NULL,
    "external_id" VARCHAR(50),
    "sync_status" "PodSyncStatus" NOT NULL DEFAULT 'pending',
    "last_synced_at" TIMESTAMPTZ,
    "last_sync_hash" VARCHAR(64),
    "last_sync_error" TEXT,
    "data_snapshot" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "ppod_student_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppod_sync_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "database_type" "PodDatabaseType" NOT NULL,
    "sync_type" "PodSyncType" NOT NULL,
    "triggered_by_id" UUID,
    "started_at" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "status" "PodSyncLogStatus" NOT NULL,
    "records_pushed" INTEGER NOT NULL DEFAULT 0,
    "records_created" INTEGER NOT NULL DEFAULT 0,
    "records_updated" INTEGER NOT NULL DEFAULT 0,
    "records_failed" INTEGER NOT NULL DEFAULT 0,
    "error_details" JSONB,
    "transport_used" VARCHAR(50) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "ppod_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ppod_cba_sync_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "academic_year" VARCHAR(20) NOT NULL,
    "cba_type" VARCHAR(20) NOT NULL,
    "grade" VARCHAR(50) NOT NULL,
    "sync_status" "CbaSyncStatus" NOT NULL DEFAULT 'pending',
    "synced_at" TIMESTAMPTZ,
    "sync_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "ppod_cba_sync_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inter_school_transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "direction" "TransferDirection" NOT NULL,
    "other_school_roll_no" VARCHAR(20) NOT NULL,
    "other_school_name" VARCHAR(255),
    "transfer_date" DATE NOT NULL,
    "leaving_reason" VARCHAR(100),
    "status" "TransferStatus" NOT NULL DEFAULT 'pending',
    "ppod_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "ppod_confirmed_at" TIMESTAMPTZ,
    "notes" TEXT,
    "initiated_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "inter_school_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_reg_calendar_tenant_domain" ON "regulatory_calendar_events"("tenant_id", "domain");
CREATE INDEX "idx_reg_calendar_tenant_date" ON "regulatory_calendar_events"("tenant_id", "due_date");
CREATE INDEX "idx_reg_calendar_tenant_status_date" ON "regulatory_calendar_events"("tenant_id", "status", "due_date");

CREATE INDEX "idx_reg_submissions_tenant_domain_year" ON "regulatory_submissions"("tenant_id", "domain", "academic_year");
CREATE INDEX "idx_reg_submissions_tenant_status" ON "regulatory_submissions"("tenant_id", "status");

CREATE INDEX "idx_tusla_mapping_tenant" ON "tusla_absence_code_mappings"("tenant_id");

CREATE INDEX "idx_reduced_school_days_student" ON "reduced_school_days"("tenant_id", "student_id");
CREATE INDEX "idx_reduced_school_days_active" ON "reduced_school_days"("tenant_id", "is_active");

CREATE UNIQUE INDEX "idx_des_subject_mapping_unique" ON "des_subject_code_mappings"("tenant_id", "subject_id");
CREATE INDEX "idx_des_subject_mapping_tenant" ON "des_subject_code_mappings"("tenant_id");

CREATE UNIQUE INDEX "idx_ppod_mapping_unique" ON "ppod_student_mappings"("tenant_id", "student_id", "database_type");
CREATE INDEX "idx_ppod_mapping_status" ON "ppod_student_mappings"("tenant_id", "sync_status");

CREATE INDEX "idx_ppod_sync_log_tenant" ON "ppod_sync_logs"("tenant_id", "database_type", "started_at" DESC);

CREATE UNIQUE INDEX "idx_cba_sync_unique" ON "ppod_cba_sync_records"("tenant_id", "student_id", "subject_id", "assessment_id");
CREATE INDEX "idx_cba_sync_status" ON "ppod_cba_sync_records"("tenant_id", "sync_status");

CREATE INDEX "idx_transfer_student" ON "inter_school_transfers"("tenant_id", "student_id");
CREATE INDEX "idx_transfer_status" ON "inter_school_transfers"("tenant_id", "status");
CREATE INDEX "idx_transfer_direction_status" ON "inter_school_transfers"("tenant_id", "direction", "status");

-- AddForeignKey
ALTER TABLE "regulatory_calendar_events" ADD CONSTRAINT "regulatory_calendar_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "regulatory_calendar_events" ADD CONSTRAINT "regulatory_calendar_events_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "regulatory_submissions" ADD CONSTRAINT "regulatory_submissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "regulatory_submissions" ADD CONSTRAINT "regulatory_submissions_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "regulatory_submissions" ADD CONSTRAINT "regulatory_submissions_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "tusla_absence_code_mappings" ADD CONSTRAINT "tusla_absence_code_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "reduced_school_days" ADD CONSTRAINT "reduced_school_days_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reduced_school_days" ADD CONSTRAINT "reduced_school_days_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reduced_school_days" ADD CONSTRAINT "reduced_school_days_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "des_subject_code_mappings" ADD CONSTRAINT "des_subject_code_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "des_subject_code_mappings" ADD CONSTRAINT "des_subject_code_mappings_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ppod_student_mappings" ADD CONSTRAINT "ppod_student_mappings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ppod_student_mappings" ADD CONSTRAINT "ppod_student_mappings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ppod_sync_logs" ADD CONSTRAINT "ppod_sync_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ppod_sync_logs" ADD CONSTRAINT "ppod_sync_logs_triggered_by_id_fkey" FOREIGN KEY ("triggered_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ppod_cba_sync_records" ADD CONSTRAINT "ppod_cba_sync_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ppod_cba_sync_records" ADD CONSTRAINT "ppod_cba_sync_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inter_school_transfers" ADD CONSTRAINT "inter_school_transfers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inter_school_transfers" ADD CONSTRAINT "inter_school_transfers_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "inter_school_transfers" ADD CONSTRAINT "inter_school_transfers_initiated_by_id_fkey" FOREIGN KEY ("initiated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
