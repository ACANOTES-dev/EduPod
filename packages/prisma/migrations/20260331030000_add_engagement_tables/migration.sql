-- CreateEnum
CREATE TYPE "EngagementFormType" AS ENUM ('consent_form', 'risk_assessment', 'survey', 'policy_signoff');
CREATE TYPE "ConsentType" AS ENUM ('one_time', 'annual', 'standing');
CREATE TYPE "EngagementFormStatus" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "FormSubmissionStatus" AS ENUM ('pending', 'submitted', 'acknowledged', 'expired', 'revoked');
CREATE TYPE "EngagementEventType" AS ENUM ('school_trip', 'overnight_trip', 'sports_event', 'cultural_event', 'in_school_event', 'after_school_activity', 'parent_conference', 'policy_signoff');
CREATE TYPE "EngagementEventStatus" AS ENUM ('draft', 'published', 'open', 'closed', 'in_progress', 'completed', 'cancelled', 'archived');
CREATE TYPE "EventTargetType" AS ENUM ('whole_school', 'year_group', 'class_group', 'custom');
CREATE TYPE "EventStaffRole" AS ENUM ('organiser', 'supervisor', 'trip_leader');
CREATE TYPE "ParticipantStatus" AS ENUM ('invited', 'registered', 'consent_pending', 'consent_granted', 'consent_declined', 'payment_pending', 'confirmed', 'attended', 'absent', 'withdrawn');
CREATE TYPE "ParticipantConsentStatus" AS ENUM ('pending', 'granted', 'declined');
CREATE TYPE "ParticipantPaymentStatus" AS ENUM ('not_required', 'pending', 'paid', 'waived', 'refunded');
CREATE TYPE "ConsentRecordStatus" AS ENUM ('active', 'expired', 'revoked');
CREATE TYPE "TimeSlotStatus" AS ENUM ('available', 'booked', 'blocked', 'completed', 'cancelled');
CREATE TYPE "ConferenceBookingStatus" AS ENUM ('confirmed', 'cancelled', 'completed', 'no_show');
CREATE TYPE "BookingType" AS ENUM ('parent_booked', 'admin_booked', 'walk_in');

-- CreateTable: engagement_form_templates
CREATE TABLE "engagement_form_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "form_type" "EngagementFormType" NOT NULL,
    "consent_type" "ConsentType",
    "fields_json" JSONB NOT NULL,
    "requires_signature" BOOLEAN NOT NULL DEFAULT false,
    "status" "EngagementFormStatus" NOT NULL DEFAULT 'draft',
    "academic_year_id" UUID,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "engagement_form_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable: engagement_form_submissions
CREATE TABLE "engagement_form_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "form_template_id" UUID NOT NULL,
    "event_id" UUID,
    "student_id" UUID NOT NULL,
    "submitted_by_user_id" UUID,
    "responses_json" JSONB NOT NULL,
    "signature_json" JSONB,
    "status" "FormSubmissionStatus" NOT NULL DEFAULT 'pending',
    "submitted_at" TIMESTAMPTZ,
    "acknowledged_at" TIMESTAMPTZ,
    "acknowledged_by_id" UUID,
    "expired_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "revocation_reason" TEXT,
    "academic_year_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "engagement_form_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: engagement_consent_records
CREATE TABLE "engagement_consent_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "consent_type" "ConsentType" NOT NULL,
    "form_template_id" UUID NOT NULL,
    "form_submission_id" UUID NOT NULL,
    "event_id" UUID,
    "status" "ConsentRecordStatus" NOT NULL DEFAULT 'active',
    "granted_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "academic_year_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "engagement_consent_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable: engagement_events
CREATE TABLE "engagement_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "title_ar" VARCHAR(255),
    "description" TEXT,
    "description_ar" TEXT,
    "event_type" "EngagementEventType" NOT NULL,
    "status" "EngagementEventStatus" NOT NULL DEFAULT 'draft',
    "start_date" DATE,
    "end_date" DATE,
    "start_time" TIME,
    "end_time" TIME,
    "location" VARCHAR(255),
    "location_ar" VARCHAR(255),
    "capacity" INTEGER,
    "target_type" "EventTargetType" NOT NULL DEFAULT 'whole_school',
    "target_config_json" JSONB,
    "consent_form_template_id" UUID,
    "risk_assessment_template_id" UUID,
    "fee_amount" DECIMAL(12,2),
    "fee_description" VARCHAR(255),
    "slot_duration_minutes" INTEGER,
    "buffer_minutes" INTEGER,
    "consent_deadline" DATE,
    "payment_deadline" DATE,
    "booking_deadline" DATE,
    "risk_assessment_required" BOOLEAN NOT NULL DEFAULT false,
    "risk_assessment_approved" BOOLEAN NOT NULL DEFAULT false,
    "risk_assessment_approved_by" UUID,
    "risk_assessment_approved_at" TIMESTAMPTZ,
    "academic_year_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "engagement_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable: engagement_event_staff
CREATE TABLE "engagement_event_staff" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "role" "EventStaffRole" NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "engagement_event_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable: engagement_event_participants
CREATE TABLE "engagement_event_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'invited',
    "consent_status" "ParticipantConsentStatus" DEFAULT 'pending',
    "payment_status" "ParticipantPaymentStatus" NOT NULL DEFAULT 'not_required',
    "invoice_id" UUID,
    "registered_at" TIMESTAMPTZ,
    "attendance_marked" BOOLEAN NOT NULL DEFAULT false,
    "attendance_marked_at" TIMESTAMPTZ,
    "attendance_marked_by" UUID,
    "withdrawn_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "engagement_event_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable: conference_time_slots
CREATE TABLE "conference_time_slots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "teacher_id" UUID NOT NULL,
    "start_time" TIMESTAMPTZ NOT NULL,
    "end_time" TIMESTAMPTZ NOT NULL,
    "status" "TimeSlotStatus" NOT NULL DEFAULT 'available',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "conference_time_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable: conference_bookings
CREATE TABLE "conference_bookings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "time_slot_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "booked_by_user_id" UUID NOT NULL,
    "booking_type" "BookingType" NOT NULL DEFAULT 'parent_booked',
    "status" "ConferenceBookingStatus" NOT NULL DEFAULT 'confirmed',
    "video_call_link" VARCHAR(500),
    "notes" TEXT,
    "booked_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "conference_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable: engagement_incident_reports
CREATE TABLE "engagement_incident_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT NOT NULL,
    "reported_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "engagement_incident_reports_pkey" PRIMARY KEY ("id")
);

-- Unique constraints
CREATE UNIQUE INDEX "engagement_consent_records_form_submission_id_key" ON "engagement_consent_records"("form_submission_id");
CREATE UNIQUE INDEX "uq_eng_event_staff" ON "engagement_event_staff"("tenant_id", "event_id", "staff_id");
CREATE UNIQUE INDEX "uq_eng_event_participant" ON "engagement_event_participants"("tenant_id", "event_id", "student_id");
CREATE UNIQUE INDEX "conference_bookings_time_slot_id_key" ON "conference_bookings"("time_slot_id");

-- Indexes
CREATE INDEX "idx_eng_form_templates_tenant_status" ON "engagement_form_templates"("tenant_id", "status");
CREATE INDEX "idx_eng_form_templates_tenant_type" ON "engagement_form_templates"("tenant_id", "form_type");
CREATE INDEX "idx_eng_submissions_template_status" ON "engagement_form_submissions"("tenant_id", "form_template_id", "status");
CREATE INDEX "idx_eng_submissions_student" ON "engagement_form_submissions"("tenant_id", "student_id");
CREATE INDEX "idx_eng_submissions_event_status" ON "engagement_form_submissions"("tenant_id", "event_id", "status");
CREATE INDEX "idx_eng_consent_student_status" ON "engagement_consent_records"("tenant_id", "student_id", "status");
CREATE INDEX "idx_eng_consent_type_status" ON "engagement_consent_records"("tenant_id", "consent_type", "status");
CREATE INDEX "idx_eng_consent_expires" ON "engagement_consent_records"("tenant_id", "expires_at");
CREATE INDEX "idx_eng_events_tenant_status" ON "engagement_events"("tenant_id", "status");
CREATE INDEX "idx_eng_events_type_status" ON "engagement_events"("tenant_id", "event_type", "status");
CREATE INDEX "idx_eng_events_academic_year" ON "engagement_events"("tenant_id", "academic_year_id");
CREATE INDEX "idx_eng_events_start_date" ON "engagement_events"("tenant_id", "start_date");
CREATE INDEX "idx_eng_participants_event_status" ON "engagement_event_participants"("tenant_id", "event_id", "status");
CREATE INDEX "idx_conf_slots_event_teacher" ON "conference_time_slots"("tenant_id", "event_id", "teacher_id");
CREATE INDEX "idx_conf_slots_event_status" ON "conference_time_slots"("tenant_id", "event_id", "status");
CREATE INDEX "idx_conf_bookings_student" ON "conference_bookings"("tenant_id", "student_id");
CREATE INDEX "idx_eng_incidents_event" ON "engagement_incident_reports"("tenant_id", "event_id");

-- Foreign keys
ALTER TABLE "engagement_form_templates" ADD CONSTRAINT "engagement_form_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_form_templates" ADD CONSTRAINT "engagement_form_templates_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE SET NULL;
ALTER TABLE "engagement_form_templates" ADD CONSTRAINT "engagement_form_templates_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;

ALTER TABLE "engagement_form_submissions" ADD CONSTRAINT "engagement_form_submissions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_form_submissions" ADD CONSTRAINT "engagement_form_submissions_form_template_id_fkey" FOREIGN KEY ("form_template_id") REFERENCES "engagement_form_templates"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_form_submissions" ADD CONSTRAINT "engagement_form_submissions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "engagement_events"("id") ON DELETE SET NULL;
ALTER TABLE "engagement_form_submissions" ADD CONSTRAINT "engagement_form_submissions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_form_submissions" ADD CONSTRAINT "engagement_form_submissions_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "engagement_form_submissions" ADD CONSTRAINT "engagement_form_submissions_acknowledged_by_id_fkey" FOREIGN KEY ("acknowledged_by_id") REFERENCES "users"("id") ON DELETE SET NULL;
ALTER TABLE "engagement_form_submissions" ADD CONSTRAINT "engagement_form_submissions_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT;

ALTER TABLE "engagement_consent_records" ADD CONSTRAINT "engagement_consent_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_consent_records" ADD CONSTRAINT "engagement_consent_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_consent_records" ADD CONSTRAINT "engagement_consent_records_form_template_id_fkey" FOREIGN KEY ("form_template_id") REFERENCES "engagement_form_templates"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_consent_records" ADD CONSTRAINT "engagement_consent_records_form_submission_id_fkey" FOREIGN KEY ("form_submission_id") REFERENCES "engagement_form_submissions"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_consent_records" ADD CONSTRAINT "engagement_consent_records_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "engagement_events"("id") ON DELETE SET NULL;
ALTER TABLE "engagement_consent_records" ADD CONSTRAINT "engagement_consent_records_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT;

ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_consent_form_template_id_fkey" FOREIGN KEY ("consent_form_template_id") REFERENCES "engagement_form_templates"("id") ON DELETE SET NULL;
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_risk_assessment_template_id_fkey" FOREIGN KEY ("risk_assessment_template_id") REFERENCES "engagement_form_templates"("id") ON DELETE SET NULL;
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT;
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
ALTER TABLE "engagement_events" ADD CONSTRAINT "engagement_events_risk_assessment_approved_by_fkey" FOREIGN KEY ("risk_assessment_approved_by") REFERENCES "users"("id") ON DELETE SET NULL;

ALTER TABLE "engagement_event_staff" ADD CONSTRAINT "engagement_event_staff_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_event_staff" ADD CONSTRAINT "engagement_event_staff_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "engagement_events"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_event_staff" ADD CONSTRAINT "engagement_event_staff_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE;

ALTER TABLE "engagement_event_participants" ADD CONSTRAINT "engagement_event_participants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_event_participants" ADD CONSTRAINT "engagement_event_participants_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "engagement_events"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_event_participants" ADD CONSTRAINT "engagement_event_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_event_participants" ADD CONSTRAINT "engagement_event_participants_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "invoices"("id") ON DELETE SET NULL;

ALTER TABLE "conference_time_slots" ADD CONSTRAINT "conference_time_slots_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
ALTER TABLE "conference_time_slots" ADD CONSTRAINT "conference_time_slots_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "engagement_events"("id") ON DELETE CASCADE;
ALTER TABLE "conference_time_slots" ADD CONSTRAINT "conference_time_slots_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "staff_profiles"("id") ON DELETE CASCADE;

ALTER TABLE "conference_bookings" ADD CONSTRAINT "conference_bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
ALTER TABLE "conference_bookings" ADD CONSTRAINT "conference_bookings_time_slot_id_fkey" FOREIGN KEY ("time_slot_id") REFERENCES "conference_time_slots"("id") ON DELETE CASCADE;
ALTER TABLE "conference_bookings" ADD CONSTRAINT "conference_bookings_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE;
ALTER TABLE "conference_bookings" ADD CONSTRAINT "conference_bookings_booked_by_user_id_fkey" FOREIGN KEY ("booked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;

ALTER TABLE "engagement_incident_reports" ADD CONSTRAINT "engagement_incident_reports_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_incident_reports" ADD CONSTRAINT "engagement_incident_reports_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "engagement_events"("id") ON DELETE CASCADE;
ALTER TABLE "engagement_incident_reports" ADD CONSTRAINT "engagement_incident_reports_reported_by_user_id_fkey" FOREIGN KEY ("reported_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT;
