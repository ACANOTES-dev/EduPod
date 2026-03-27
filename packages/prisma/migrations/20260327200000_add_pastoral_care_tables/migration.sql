-- CreateEnum
CREATE TYPE "PastoralConcernSeverity" AS ENUM ('routine', 'elevated', 'urgent', 'critical');

-- CreateEnum
CREATE TYPE "PastoralCaseStatus" AS ENUM ('open', 'active', 'monitoring', 'resolved', 'closed');

-- CreateEnum
CREATE TYPE "PastoralInterventionStatus" AS ENUM ('active', 'achieved', 'partially_achieved', 'not_achieved', 'escalated', 'withdrawn');

-- CreateEnum
CREATE TYPE "PastoralActionStatus" AS ENUM ('pending', 'in_progress', 'completed', 'overdue', 'cancelled');

-- CreateEnum
CREATE TYPE "PastoralReferralStatus" AS ENUM ('draft', 'submitted', 'acknowledged', 'assessment_scheduled', 'assessment_complete', 'report_received', 'recommendations_implemented');

-- CreateEnum
CREATE TYPE "PastoralReferralRecommendationStatus" AS ENUM ('pending', 'in_progress', 'implemented', 'not_applicable');

-- CreateEnum
CREATE TYPE "SstMeetingStatus" AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "CpRecordType" AS ENUM ('concern', 'mandated_report', 'tusla_correspondence', 'section_26', 'disclosure', 'retrospective_disclosure');

-- CreateEnum
CREATE TYPE "MandatedReportStatus" AS ENUM ('draft', 'submitted', 'acknowledged', 'outcome_received');

-- CreateEnum
CREATE TYPE "PastoralDsarDecision" AS ENUM ('include', 'redact', 'exclude');

-- CreateEnum
CREATE TYPE "CriticalIncidentType" AS ENUM ('bereavement', 'serious_accident', 'community_trauma', 'other');

-- CreateEnum
CREATE TYPE "CriticalIncidentScope" AS ENUM ('whole_school', 'year_group', 'class_group', 'individual');

-- CreateEnum
CREATE TYPE "CriticalIncidentStatus" AS ENUM ('active', 'monitoring', 'closed');

-- CreateEnum
CREATE TYPE "CriticalIncidentImpactLevel" AS ENUM ('direct', 'indirect');

-- CreateTable
CREATE TABLE "pastoral_concerns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "logged_by_user_id" UUID NOT NULL,
    "author_masked" BOOLEAN NOT NULL DEFAULT false,
    "category" VARCHAR(50) NOT NULL,
    "severity" "PastoralConcernSeverity" NOT NULL,
    "tier" SMALLINT NOT NULL DEFAULT 1,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "location" VARCHAR(255),
    "witnesses" JSONB,
    "actions_taken" TEXT,
    "follow_up_needed" BOOLEAN NOT NULL DEFAULT false,
    "follow_up_suggestion" TEXT,
    "case_id" UUID,
    "behaviour_incident_id" UUID,
    "parent_shareable" BOOLEAN NOT NULL DEFAULT false,
    "parent_share_level" VARCHAR(20) DEFAULT 'category_only',
    "shared_by_user_id" UUID,
    "shared_at" TIMESTAMPTZ,
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "imported" BOOLEAN NOT NULL DEFAULT false,
    "acknowledged_at" TIMESTAMPTZ,
    "acknowledged_by_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastoral_concerns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastoral_concern_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "concern_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "narrative" TEXT NOT NULL,
    "amended_by_user_id" UUID NOT NULL,
    "amendment_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastoral_concern_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "concern_id" UUID,
    "record_type" "CpRecordType" NOT NULL,
    "logged_by_user_id" UUID NOT NULL,
    "narrative" TEXT NOT NULL,
    "mandated_report_status" "MandatedReportStatus",
    "mandated_report_ref" VARCHAR(100),
    "tusla_contact_name" VARCHAR(255),
    "tusla_contact_date" TIMESTAMPTZ,
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cp_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cp_access_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "granted_by_user_id" UUID NOT NULL,
    "granted_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ,
    "revoked_by_user_id" UUID,
    "revocation_reason" TEXT,

    CONSTRAINT "cp_access_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastoral_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "case_number" VARCHAR(20) NOT NULL,
    "status" "PastoralCaseStatus" NOT NULL DEFAULT 'open',
    "owner_user_id" UUID NOT NULL,
    "opened_by_user_id" UUID NOT NULL,
    "opened_reason" TEXT NOT NULL,
    "next_review_date" DATE,
    "tier" SMALLINT NOT NULL DEFAULT 1,
    "legal_hold" BOOLEAN NOT NULL DEFAULT false,
    "resolved_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastoral_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastoral_case_students" (
    "case_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "added_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastoral_case_students_pkey" PRIMARY KEY ("case_id","student_id")
);

-- CreateTable
CREATE TABLE "pastoral_interventions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "case_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "intervention_type" VARCHAR(50) NOT NULL,
    "continuum_level" SMALLINT NOT NULL,
    "target_outcomes" JSONB NOT NULL,
    "review_cycle_weeks" INTEGER NOT NULL DEFAULT 6,
    "next_review_date" DATE NOT NULL,
    "parent_informed" BOOLEAN NOT NULL DEFAULT false,
    "parent_consented" BOOLEAN,
    "parent_input" TEXT,
    "student_voice" TEXT,
    "status" "PastoralInterventionStatus" NOT NULL DEFAULT 'active',
    "outcome_notes" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastoral_interventions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastoral_intervention_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "intervention_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "assigned_to_user_id" UUID NOT NULL,
    "frequency" VARCHAR(50),
    "start_date" DATE NOT NULL,
    "due_date" DATE,
    "completed_at" TIMESTAMPTZ,
    "completed_by_user_id" UUID,
    "status" "PastoralActionStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastoral_intervention_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastoral_intervention_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "intervention_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "recorded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastoral_intervention_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastoral_referrals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "case_id" UUID,
    "student_id" UUID NOT NULL,
    "referral_type" VARCHAR(50) NOT NULL,
    "referral_body_name" VARCHAR(255),
    "status" "PastoralReferralStatus" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ,
    "submitted_by_user_id" UUID,
    "pre_populated_data" JSONB,
    "manual_additions" JSONB,
    "external_reference" VARCHAR(100),
    "report_received_at" TIMESTAMPTZ,
    "report_summary" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastoral_referrals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastoral_referral_recommendations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "referral_id" UUID NOT NULL,
    "recommendation" TEXT NOT NULL,
    "assigned_to_user_id" UUID,
    "review_date" DATE,
    "status" "PastoralReferralRecommendationStatus" NOT NULL DEFAULT 'pending',
    "status_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastoral_referral_recommendations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sst_members" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role_description" VARCHAR(100),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sst_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sst_meetings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "scheduled_at" TIMESTAMPTZ NOT NULL,
    "status" "SstMeetingStatus" NOT NULL DEFAULT 'scheduled',
    "attendees" JSONB,
    "general_notes" TEXT,
    "agenda_precomputed_at" TIMESTAMPTZ,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sst_meetings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sst_meeting_agenda_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "source" VARCHAR(30) NOT NULL,
    "student_id" UUID,
    "case_id" UUID,
    "concern_id" UUID,
    "description" TEXT NOT NULL,
    "discussion_notes" TEXT,
    "decisions" TEXT,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sst_meeting_agenda_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sst_meeting_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "meeting_id" UUID NOT NULL,
    "agenda_item_id" UUID,
    "student_id" UUID,
    "case_id" UUID,
    "description" TEXT NOT NULL,
    "assigned_to_user_id" UUID NOT NULL,
    "due_date" DATE NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "completed_by_user_id" UUID,
    "status" "PastoralActionStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sst_meeting_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastoral_parent_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "concern_id" UUID,
    "case_id" UUID,
    "parent_id" UUID NOT NULL,
    "contacted_by_user_id" UUID NOT NULL,
    "contact_method" VARCHAR(30) NOT NULL,
    "contact_date" TIMESTAMPTZ NOT NULL,
    "outcome" TEXT NOT NULL,
    "parent_response" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastoral_parent_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastoral_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "event_type" VARCHAR(60) NOT NULL,
    "entity_type" VARCHAR(30) NOT NULL,
    "entity_id" UUID NOT NULL,
    "student_id" UUID,
    "actor_user_id" UUID NOT NULL,
    "tier" SMALLINT NOT NULL,
    "payload" JSONB NOT NULL,
    "ip_address" INET,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastoral_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pastoral_dsar_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "compliance_request_id" UUID NOT NULL,
    "entity_type" VARCHAR(30) NOT NULL,
    "entity_id" UUID NOT NULL,
    "tier" SMALLINT NOT NULL,
    "decision" "PastoralDsarDecision",
    "legal_basis" VARCHAR(100),
    "justification" TEXT,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pastoral_dsar_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "critical_incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "incident_type" "CriticalIncidentType" NOT NULL,
    "description" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "scope" "CriticalIncidentScope" NOT NULL,
    "scope_ids" JSONB,
    "declared_by_user_id" UUID NOT NULL,
    "status" "CriticalIncidentStatus" NOT NULL DEFAULT 'active',
    "response_plan" JSONB,
    "external_support_log" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "critical_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "critical_incident_affected" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "affected_type" VARCHAR(10) NOT NULL,
    "student_id" UUID,
    "staff_profile_id" UUID,
    "impact_level" "CriticalIncidentImpactLevel" NOT NULL,
    "notes" TEXT,
    "support_offered" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "critical_incident_affected_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_checkins" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "mood_score" SMALLINT NOT NULL,
    "freeform_text" TEXT,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flag_reason" VARCHAR(50),
    "auto_concern_id" UUID,
    "checkin_date" DATE NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_checkins_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_pastoral_concerns_tenant_student_created" ON "pastoral_concerns"("tenant_id", "student_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_pastoral_concerns_tenant_tier_created" ON "pastoral_concerns"("tenant_id", "tier", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_pastoral_concerns_tenant_case" ON "pastoral_concerns"("tenant_id", "case_id");

-- CreateIndex
CREATE INDEX "idx_pastoral_concerns_tenant_severity_ack" ON "pastoral_concerns"("tenant_id", "severity", "acknowledged_at");

-- CreateIndex
CREATE INDEX "idx_pastoral_concern_versions_tenant_concern_ver" ON "pastoral_concern_versions"("tenant_id", "concern_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "pastoral_concern_versions_concern_id_version_number_key" ON "pastoral_concern_versions"("concern_id", "version_number");

-- CreateIndex
CREATE INDEX "idx_cp_records_tenant_student_created" ON "cp_records"("tenant_id", "student_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_cp_records_tenant_type" ON "cp_records"("tenant_id", "record_type");

-- CreateIndex
CREATE INDEX "idx_cp_access_grants_tenant_user_revoked" ON "cp_access_grants"("tenant_id", "user_id", "revoked_at");

-- CreateIndex
CREATE UNIQUE INDEX "uq_cp_access_grants_tenant_user_active" ON "cp_access_grants"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_pastoral_cases_tenant_student_status" ON "pastoral_cases"("tenant_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "idx_pastoral_cases_tenant_owner_status" ON "pastoral_cases"("tenant_id", "owner_user_id", "status");

-- CreateIndex
CREATE INDEX "idx_pastoral_cases_tenant_review_date" ON "pastoral_cases"("tenant_id", "next_review_date");

-- CreateIndex
CREATE UNIQUE INDEX "pastoral_cases_tenant_id_case_number_key" ON "pastoral_cases"("tenant_id", "case_number");

-- CreateIndex
CREATE INDEX "idx_pastoral_interventions_tenant_case" ON "pastoral_interventions"("tenant_id", "case_id");

-- CreateIndex
CREATE INDEX "idx_pastoral_interventions_tenant_student_status" ON "pastoral_interventions"("tenant_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "idx_pastoral_interventions_tenant_review" ON "pastoral_interventions"("tenant_id", "next_review_date");

-- CreateIndex
CREATE INDEX "idx_pastoral_intervention_actions_tenant_intervention" ON "pastoral_intervention_actions"("tenant_id", "intervention_id");

-- CreateIndex
CREATE INDEX "idx_pastoral_intervention_actions_tenant_assignee_status" ON "pastoral_intervention_actions"("tenant_id", "assigned_to_user_id", "status");

-- CreateIndex
CREATE INDEX "idx_pastoral_intervention_progress_tenant_intervention" ON "pastoral_intervention_progress"("tenant_id", "intervention_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_pastoral_referrals_tenant_student_status" ON "pastoral_referrals"("tenant_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "idx_pastoral_referrals_tenant_type_status" ON "pastoral_referrals"("tenant_id", "referral_type", "status");

-- CreateIndex
CREATE INDEX "idx_pastoral_referral_recs_tenant_referral" ON "pastoral_referral_recommendations"("tenant_id", "referral_id");

-- CreateIndex
CREATE UNIQUE INDEX "sst_members_tenant_id_user_id_key" ON "sst_members"("tenant_id", "user_id");

-- CreateIndex
CREATE INDEX "idx_sst_meetings_tenant_scheduled" ON "sst_meetings"("tenant_id", "scheduled_at");

-- CreateIndex
CREATE INDEX "idx_sst_meetings_tenant_status" ON "sst_meetings"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_sst_agenda_items_tenant_meeting_order" ON "sst_meeting_agenda_items"("tenant_id", "meeting_id", "display_order");

-- CreateIndex
CREATE INDEX "idx_sst_meeting_actions_tenant_meeting" ON "sst_meeting_actions"("tenant_id", "meeting_id");

-- CreateIndex
CREATE INDEX "idx_sst_meeting_actions_tenant_assignee_status" ON "sst_meeting_actions"("tenant_id", "assigned_to_user_id", "status");

-- CreateIndex
CREATE INDEX "idx_sst_meeting_actions_tenant_due_status" ON "sst_meeting_actions"("tenant_id", "due_date", "status");

-- CreateIndex
CREATE INDEX "idx_pastoral_parent_contacts_tenant_student" ON "pastoral_parent_contacts"("tenant_id", "student_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_pastoral_events_tenant_student_created" ON "pastoral_events"("tenant_id", "student_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_pastoral_events_tenant_entity_created" ON "pastoral_events"("tenant_id", "entity_type", "entity_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_pastoral_events_tenant_type_created" ON "pastoral_events"("tenant_id", "event_type", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_pastoral_dsar_reviews_tenant_request" ON "pastoral_dsar_reviews"("tenant_id", "compliance_request_id");

-- CreateIndex
CREATE INDEX "idx_critical_incidents_tenant_status" ON "critical_incidents"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_critical_incident_affected_tenant_incident" ON "critical_incident_affected"("tenant_id", "incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "student_checkins_tenant_id_student_id_checkin_date_key" ON "student_checkins"("tenant_id", "student_id", "checkin_date");

-- AddForeignKey
ALTER TABLE "pastoral_concerns" ADD CONSTRAINT "pastoral_concerns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_concerns" ADD CONSTRAINT "pastoral_concerns_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_concerns" ADD CONSTRAINT "pastoral_concerns_logged_by_user_id_fkey" FOREIGN KEY ("logged_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_concerns" ADD CONSTRAINT "pastoral_concerns_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "pastoral_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_concerns" ADD CONSTRAINT "pastoral_concerns_behaviour_incident_id_fkey" FOREIGN KEY ("behaviour_incident_id") REFERENCES "behaviour_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_concerns" ADD CONSTRAINT "pastoral_concerns_shared_by_user_id_fkey" FOREIGN KEY ("shared_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_concerns" ADD CONSTRAINT "pastoral_concerns_acknowledged_by_user_id_fkey" FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_concern_versions" ADD CONSTRAINT "pastoral_concern_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_concern_versions" ADD CONSTRAINT "pastoral_concern_versions_concern_id_fkey" FOREIGN KEY ("concern_id") REFERENCES "pastoral_concerns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_concern_versions" ADD CONSTRAINT "pastoral_concern_versions_amended_by_user_id_fkey" FOREIGN KEY ("amended_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cp_records" ADD CONSTRAINT "cp_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cp_records" ADD CONSTRAINT "cp_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cp_records" ADD CONSTRAINT "cp_records_concern_id_fkey" FOREIGN KEY ("concern_id") REFERENCES "pastoral_concerns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cp_records" ADD CONSTRAINT "cp_records_logged_by_user_id_fkey" FOREIGN KEY ("logged_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cp_access_grants" ADD CONSTRAINT "cp_access_grants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cp_access_grants" ADD CONSTRAINT "cp_access_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cp_access_grants" ADD CONSTRAINT "cp_access_grants_granted_by_user_id_fkey" FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cp_access_grants" ADD CONSTRAINT "cp_access_grants_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_cases" ADD CONSTRAINT "pastoral_cases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_cases" ADD CONSTRAINT "pastoral_cases_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_cases" ADD CONSTRAINT "pastoral_cases_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_cases" ADD CONSTRAINT "pastoral_cases_opened_by_user_id_fkey" FOREIGN KEY ("opened_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_case_students" ADD CONSTRAINT "pastoral_case_students_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_case_students" ADD CONSTRAINT "pastoral_case_students_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "pastoral_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_case_students" ADD CONSTRAINT "pastoral_case_students_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_interventions" ADD CONSTRAINT "pastoral_interventions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_interventions" ADD CONSTRAINT "pastoral_interventions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "pastoral_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_interventions" ADD CONSTRAINT "pastoral_interventions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_interventions" ADD CONSTRAINT "pastoral_interventions_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_intervention_actions" ADD CONSTRAINT "pastoral_intervention_actions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_intervention_actions" ADD CONSTRAINT "pastoral_intervention_actions_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "pastoral_interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_intervention_actions" ADD CONSTRAINT "pastoral_intervention_actions_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_intervention_actions" ADD CONSTRAINT "pastoral_intervention_actions_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_intervention_progress" ADD CONSTRAINT "pastoral_intervention_progress_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_intervention_progress" ADD CONSTRAINT "pastoral_intervention_progress_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "pastoral_interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_intervention_progress" ADD CONSTRAINT "pastoral_intervention_progress_recorded_by_user_id_fkey" FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_referrals" ADD CONSTRAINT "pastoral_referrals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_referrals" ADD CONSTRAINT "pastoral_referrals_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "pastoral_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_referrals" ADD CONSTRAINT "pastoral_referrals_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_referrals" ADD CONSTRAINT "pastoral_referrals_submitted_by_user_id_fkey" FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_referral_recommendations" ADD CONSTRAINT "pastoral_referral_recommendations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_referral_recommendations" ADD CONSTRAINT "pastoral_referral_recommendations_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "pastoral_referrals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_referral_recommendations" ADD CONSTRAINT "pastoral_referral_recommendations_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_members" ADD CONSTRAINT "sst_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_members" ADD CONSTRAINT "sst_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meetings" ADD CONSTRAINT "sst_meetings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meetings" ADD CONSTRAINT "sst_meetings_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meeting_agenda_items" ADD CONSTRAINT "sst_meeting_agenda_items_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meeting_agenda_items" ADD CONSTRAINT "sst_meeting_agenda_items_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "sst_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meeting_agenda_items" ADD CONSTRAINT "sst_meeting_agenda_items_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meeting_agenda_items" ADD CONSTRAINT "sst_meeting_agenda_items_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "pastoral_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meeting_agenda_items" ADD CONSTRAINT "sst_meeting_agenda_items_concern_id_fkey" FOREIGN KEY ("concern_id") REFERENCES "pastoral_concerns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meeting_actions" ADD CONSTRAINT "sst_meeting_actions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meeting_actions" ADD CONSTRAINT "sst_meeting_actions_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "sst_meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meeting_actions" ADD CONSTRAINT "sst_meeting_actions_agenda_item_id_fkey" FOREIGN KEY ("agenda_item_id") REFERENCES "sst_meeting_agenda_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meeting_actions" ADD CONSTRAINT "sst_meeting_actions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meeting_actions" ADD CONSTRAINT "sst_meeting_actions_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "pastoral_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meeting_actions" ADD CONSTRAINT "sst_meeting_actions_assigned_to_user_id_fkey" FOREIGN KEY ("assigned_to_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sst_meeting_actions" ADD CONSTRAINT "sst_meeting_actions_completed_by_user_id_fkey" FOREIGN KEY ("completed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_parent_contacts" ADD CONSTRAINT "pastoral_parent_contacts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_parent_contacts" ADD CONSTRAINT "pastoral_parent_contacts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_parent_contacts" ADD CONSTRAINT "pastoral_parent_contacts_concern_id_fkey" FOREIGN KEY ("concern_id") REFERENCES "pastoral_concerns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_parent_contacts" ADD CONSTRAINT "pastoral_parent_contacts_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "pastoral_cases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_parent_contacts" ADD CONSTRAINT "pastoral_parent_contacts_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_parent_contacts" ADD CONSTRAINT "pastoral_parent_contacts_contacted_by_user_id_fkey" FOREIGN KEY ("contacted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_events" ADD CONSTRAINT "pastoral_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_events" ADD CONSTRAINT "pastoral_events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_events" ADD CONSTRAINT "pastoral_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_dsar_reviews" ADD CONSTRAINT "pastoral_dsar_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_dsar_reviews" ADD CONSTRAINT "pastoral_dsar_reviews_compliance_request_id_fkey" FOREIGN KEY ("compliance_request_id") REFERENCES "compliance_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pastoral_dsar_reviews" ADD CONSTRAINT "pastoral_dsar_reviews_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critical_incidents" ADD CONSTRAINT "critical_incidents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critical_incidents" ADD CONSTRAINT "critical_incidents_declared_by_user_id_fkey" FOREIGN KEY ("declared_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critical_incident_affected" ADD CONSTRAINT "critical_incident_affected_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critical_incident_affected" ADD CONSTRAINT "critical_incident_affected_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "critical_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critical_incident_affected" ADD CONSTRAINT "critical_incident_affected_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "critical_incident_affected" ADD CONSTRAINT "critical_incident_affected_staff_profile_id_fkey" FOREIGN KEY ("staff_profile_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_checkins" ADD CONSTRAINT "student_checkins_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_checkins" ADD CONSTRAINT "student_checkins_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_checkins" ADD CONSTRAINT "student_checkins_auto_concern_id_fkey" FOREIGN KEY ("auto_concern_id") REFERENCES "pastoral_concerns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

