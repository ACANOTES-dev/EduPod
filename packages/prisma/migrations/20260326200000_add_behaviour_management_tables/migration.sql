-- CreateEnum
CREATE TYPE "BehaviourPolarity" AS ENUM ('positive', 'negative', 'neutral');

-- CreateEnum
CREATE TYPE "BenchmarkCategory" AS ENUM ('praise', 'merit', 'minor_positive', 'major_positive', 'verbal_warning', 'written_warning', 'detention', 'internal_suspension', 'external_suspension', 'expulsion', 'note', 'observation', 'other');

-- CreateEnum
CREATE TYPE "IncidentStatus" AS ENUM ('draft', 'active', 'investigating', 'under_review', 'awaiting_approval', 'awaiting_parent_meeting', 'escalated', 'resolved', 'withdrawn', 'closed_after_appeal', 'superseded', 'converted_to_safeguarding');

-- CreateEnum
CREATE TYPE "IncidentApprovalStatus" AS ENUM ('not_required', 'pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ParentNotifStatus" AS ENUM ('not_required', 'pending', 'sent', 'delivered', 'failed', 'acknowledged');

-- CreateEnum
CREATE TYPE "ContextType" AS ENUM ('class', 'break', 'before_school', 'after_school', 'lunch', 'transport', 'extra_curricular', 'off_site', 'online', 'other');

-- CreateEnum
CREATE TYPE "ParticipantType" AS ENUM ('student', 'staff', 'parent', 'visitor', 'unknown');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('subject', 'witness', 'bystander', 'reporter', 'victim', 'instigator', 'mediator');

-- CreateEnum
CREATE TYPE "BehaviourEntityType" AS ENUM ('incident', 'sanction', 'intervention', 'appeal', 'task', 'exclusion_case', 'publication_approval', 'break_glass_grant', 'guardian_restriction');

-- CreateEnum
CREATE TYPE "BehaviourTaskType" AS ENUM ('follow_up', 'intervention_review', 'parent_meeting', 'parent_acknowledgement', 'approval_action', 'sanction_supervision', 'return_check_in', 'safeguarding_action', 'document_requested', 'appeal_review', 'break_glass_review', 'guardian_restriction_review', 'custom');

-- CreateEnum
CREATE TYPE "BehaviourTaskEntityType" AS ENUM ('incident', 'sanction', 'intervention', 'safeguarding_concern', 'appeal', 'break_glass_grant', 'exclusion_case', 'guardian_restriction');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "BehaviourTaskStatus" AS ENUM ('pending', 'in_progress', 'completed', 'cancelled', 'overdue');

-- CreateEnum
CREATE TYPE "RetentionStatus" AS ENUM ('active', 'archived', 'anonymised');

-- CreateEnum
CREATE TYPE "SanctionType" AS ENUM ('detention', 'suspension_internal', 'suspension_external', 'expulsion', 'community_service', 'loss_of_privilege', 'restorative_meeting', 'other');

-- CreateEnum
CREATE TYPE "SanctionStatus" AS ENUM ('pending_approval', 'scheduled', 'served', 'partially_served', 'no_show', 'excused', 'cancelled', 'rescheduled', 'not_served_absent', 'appealed', 'replaced');

-- CreateEnum
CREATE TYPE "AppealStatus" AS ENUM ('submitted', 'under_review', 'hearing_scheduled', 'decided', 'withdrawn');

-- CreateEnum
CREATE TYPE "AppealDecision" AS ENUM ('upheld_original', 'modified', 'overturned');

-- CreateEnum
CREATE TYPE "AppealOutcome" AS ENUM ('upheld', 'modified', 'overturned');

-- CreateEnum
CREATE TYPE "GroundsCategory" AS ENUM ('factual_inaccuracy', 'disproportionate_consequence', 'procedural_error', 'mitigating_circumstances', 'mistaken_identity', 'other');

-- CreateEnum
CREATE TYPE "AmendmentType" AS ENUM ('correction', 'supersession', 'retraction');

-- CreateEnum
CREATE TYPE "AcknowledgementChannel" AS ENUM ('email', 'whatsapp', 'in_app');

-- CreateEnum
CREATE TYPE "AcknowledgementMethod" AS ENUM ('in_app_button', 'email_link', 'whatsapp_reply');

-- CreateEnum
CREATE TYPE "ExclusionType" AS ENUM ('suspension_extended', 'expulsion', 'managed_move', 'permanent_exclusion');

-- CreateEnum
CREATE TYPE "ExclusionStatus" AS ENUM ('initiated', 'notice_issued', 'hearing_scheduled', 'hearing_held', 'decision_made', 'appeal_window', 'finalised', 'overturned');

-- CreateEnum
CREATE TYPE "ExclusionDecision" AS ENUM ('exclusion_confirmed', 'exclusion_modified', 'exclusion_reversed', 'alternative_consequence');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('detention_notice', 'suspension_letter', 'return_meeting_letter', 'behaviour_contract', 'intervention_summary', 'appeal_hearing_invite', 'appeal_decision_letter', 'exclusion_notice', 'exclusion_decision_letter', 'board_pack', 'custom_document');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('draft', 'finalised', 'sent', 'superseded');

-- CreateEnum
CREATE TYPE "InterventionType" AS ENUM ('behaviour_plan', 'mentoring', 'counselling_referral', 'restorative', 'academic_support', 'parent_engagement', 'external_agency', 'other');

-- CreateEnum
CREATE TYPE "InterventionStatus" AS ENUM ('planned', 'active', 'monitoring', 'completed', 'abandoned');

-- CreateEnum
CREATE TYPE "InterventionProgress" AS ENUM ('on_track', 'some_progress', 'no_progress', 'regression');

-- CreateEnum
CREATE TYPE "InterventionOutcome" AS ENUM ('improved', 'no_change', 'deteriorated', 'inconclusive');

-- CreateEnum
CREATE TYPE "PublicationType" AS ENUM ('recognition_wall_website', 'house_leaderboard_website', 'individual_achievement_website');

-- CreateEnum
CREATE TYPE "PublicationEntityType" AS ENUM ('incident', 'award');

-- CreateEnum
CREATE TYPE "ParentConsentStatus" AS ENUM ('not_requested', 'pending', 'granted', 'denied');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('escalating_student', 'disengaging_student', 'hotspot', 'logging_gap', 'overdue_review', 'suspension_return', 'policy_threshold_breach');

-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('info', 'warning', 'critical');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('active', 'resolved');

-- CreateEnum
CREATE TYPE "AlertRecipientStatus" AS ENUM ('unseen', 'seen', 'acknowledged', 'snoozed', 'resolved', 'dismissed');

-- CreateEnum
CREATE TYPE "RestrictionType" AS ENUM ('no_behaviour_visibility', 'no_behaviour_notifications', 'no_portal_access', 'no_communications');

-- CreateEnum
CREATE TYPE "RestrictionStatus" AS ENUM ('active', 'expired', 'revoked', 'superseded');

-- CreateEnum
CREATE TYPE "LegalHoldEntityType" AS ENUM ('incident', 'sanction', 'intervention', 'appeal', 'exclusion_case', 'task', 'attachment');

-- CreateEnum
CREATE TYPE "LegalHoldStatus" AS ENUM ('active', 'released');

-- CreateEnum
CREATE TYPE "SafeguardingConcernType" AS ENUM ('physical_abuse', 'emotional_abuse', 'sexual_abuse', 'neglect', 'self_harm', 'bullying', 'online_safety', 'domestic_violence', 'substance_abuse', 'mental_health', 'radicalisation', 'other');

-- CreateEnum
CREATE TYPE "SafeguardingSeverity" AS ENUM ('low', 'medium', 'high', 'critical');

-- CreateEnum
CREATE TYPE "SafeguardingStatus" AS ENUM ('reported', 'acknowledged', 'under_investigation', 'referred', 'monitoring', 'resolved', 'sealed');

-- CreateEnum
CREATE TYPE "SafeguardingActionType" AS ENUM ('note_added', 'status_changed', 'assigned', 'meeting_held', 'parent_contacted', 'agency_contacted', 'tusla_referred', 'garda_referred', 'document_uploaded', 'document_downloaded', 'review_completed');

-- CreateEnum
CREATE TYPE "BreakGlassScope" AS ENUM ('all_concerns', 'specific_concerns');

-- CreateEnum
CREATE TYPE "AttachmentClassification" AS ENUM ('staff_statement', 'student_statement', 'parent_letter', 'meeting_minutes', 'screenshot', 'photo', 'scanned_document', 'referral_form', 'return_agreement', 'behaviour_contract', 'medical_report', 'agency_correspondence', 'other');

-- CreateEnum
CREATE TYPE "AttachmentVisibility" AS ENUM ('staff_all', 'pastoral_only', 'management_only', 'safeguarding_only');

-- CreateEnum
CREATE TYPE "ScanStatus" AS ENUM ('pending', 'clean', 'infected', 'scan_failed');

-- CreateEnum
CREATE TYPE "PolicyStage" AS ENUM ('consequence', 'approval', 'notification', 'support', 'alerting');

-- CreateEnum
CREATE TYPE "PolicyMatchStrategy" AS ENUM ('first_match', 'all_matching');

-- CreateEnum
CREATE TYPE "PolicyEvaluationResult" AS ENUM ('matched', 'no_match', 'skipped_inactive', 'evaluation_error');

-- CreateEnum
CREATE TYPE "PolicyActionType" AS ENUM ('auto_escalate', 'create_sanction', 'require_approval', 'require_parent_meeting', 'require_parent_notification', 'create_task', 'create_intervention', 'notify_roles', 'notify_users', 'flag_for_review', 'block_without_approval');

-- CreateEnum
CREATE TYPE "PolicyActionExecutionStatus" AS ENUM ('success', 'failed', 'skipped_duplicate', 'skipped_condition');

-- CreateEnum
CREATE TYPE "AppellantType" AS ENUM ('parent', 'student', 'staff');

-- CreateEnum
CREATE TYPE "ReporterAckStatus" AS ENUM ('received', 'assigned', 'under_review');

-- CreateTable
CREATE TABLE "behaviour_categories" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_ar" VARCHAR(100),
    "polarity" "BehaviourPolarity" NOT NULL,
    "severity" INTEGER NOT NULL,
    "point_value" INTEGER NOT NULL DEFAULT 0,
    "color" VARCHAR(7),
    "icon" VARCHAR(50),
    "requires_follow_up" BOOLEAN NOT NULL DEFAULT false,
    "requires_parent_notification" BOOLEAN NOT NULL DEFAULT false,
    "parent_visible" BOOLEAN NOT NULL DEFAULT true,
    "benchmark_category" "BenchmarkCategory" NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "incident_number" VARCHAR(20) NOT NULL,
    "idempotency_key" VARCHAR(36),
    "category_id" UUID NOT NULL,
    "polarity" "BehaviourPolarity" NOT NULL,
    "severity" INTEGER NOT NULL,
    "reported_by_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "parent_description" TEXT,
    "parent_description_ar" TEXT,
    "parent_description_locked" BOOLEAN NOT NULL DEFAULT false,
    "parent_description_set_by_id" UUID,
    "parent_description_set_at" TIMESTAMPTZ,
    "context_notes" TEXT,
    "location" VARCHAR(100),
    "context_type" "ContextType" NOT NULL DEFAULT 'class',
    "occurred_at" TIMESTAMPTZ NOT NULL,
    "logged_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "academic_year_id" UUID NOT NULL,
    "academic_period_id" UUID,
    "schedule_entry_id" UUID,
    "subject_id" UUID,
    "room_id" UUID,
    "period_order" INTEGER,
    "weekday" INTEGER,
    "status" "IncidentStatus" NOT NULL DEFAULT 'draft',
    "approval_status" "IncidentApprovalStatus" NOT NULL DEFAULT 'not_required',
    "approval_request_id" UUID,
    "parent_notification_status" "ParentNotifStatus" NOT NULL DEFAULT 'not_required',
    "follow_up_required" BOOLEAN NOT NULL DEFAULT false,
    "escalated_from_id" UUID,
    "policy_evaluation_id" UUID,
    "context_snapshot" JSONB NOT NULL DEFAULT '{}',
    "retention_status" "RetentionStatus" NOT NULL DEFAULT 'active',
    "archived_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_incident_participants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "participant_type" "ParticipantType" NOT NULL,
    "student_id" UUID,
    "staff_id" UUID,
    "parent_id" UUID,
    "external_name" VARCHAR(200),
    "role" "ParticipantRole" NOT NULL DEFAULT 'subject',
    "points_awarded" INTEGER NOT NULL DEFAULT 0,
    "parent_visible" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "student_snapshot" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_incident_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_description_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
    "text" VARCHAR(500) NOT NULL,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_description_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_entity_history" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "entity_type" "BehaviourEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "change_type" VARCHAR(50) NOT NULL,
    "previous_values" JSONB,
    "new_values" JSONB NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_entity_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "task_type" "BehaviourTaskType" NOT NULL,
    "entity_type" "BehaviourTaskEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "assigned_to_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "priority" "TaskPriority" NOT NULL DEFAULT 'medium',
    "status" "BehaviourTaskStatus" NOT NULL DEFAULT 'pending',
    "due_date" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ,
    "completed_by_id" UUID,
    "completion_notes" TEXT,
    "reminder_sent_at" TIMESTAMPTZ,
    "overdue_notified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_parent_acknowledgements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "incident_id" UUID,
    "sanction_id" UUID,
    "amendment_notice_id" UUID,
    "parent_id" UUID NOT NULL,
    "notification_id" UUID,
    "channel" "AcknowledgementChannel",
    "sent_at" TIMESTAMPTZ NOT NULL,
    "delivered_at" TIMESTAMPTZ,
    "read_at" TIMESTAMPTZ,
    "acknowledged_at" TIMESTAMPTZ,
    "acknowledgement_method" "AcknowledgementMethod",
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_parent_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_sanctions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sanction_number" VARCHAR(20) NOT NULL,
    "incident_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "SanctionType" NOT NULL,
    "status" "SanctionStatus" NOT NULL,
    "approval_status" "IncidentApprovalStatus" NOT NULL DEFAULT 'not_required',
    "approval_request_id" UUID,
    "scheduled_date" DATE NOT NULL,
    "scheduled_start_time" TIME,
    "scheduled_end_time" TIME,
    "scheduled_room_id" UUID,
    "supervised_by_id" UUID,
    "suspension_start_date" DATE,
    "suspension_end_date" DATE,
    "suspension_days" INTEGER,
    "return_conditions" TEXT,
    "parent_meeting_required" BOOLEAN NOT NULL DEFAULT false,
    "parent_meeting_date" TIMESTAMPTZ,
    "parent_meeting_notes" TEXT,
    "served_at" TIMESTAMPTZ,
    "served_by_id" UUID,
    "replaced_by_id" UUID,
    "appeal_notes" TEXT,
    "appeal_outcome" "AppealOutcome",
    "notes" TEXT,
    "retention_status" "RetentionStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_sanctions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_appeals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "appeal_number" VARCHAR(20) NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "incident_id" UUID NOT NULL,
    "sanction_id" UUID,
    "student_id" UUID NOT NULL,
    "appellant_type" "AppellantType" NOT NULL,
    "appellant_parent_id" UUID,
    "appellant_staff_id" UUID,
    "status" "AppealStatus" NOT NULL,
    "grounds" TEXT NOT NULL,
    "grounds_category" "GroundsCategory" NOT NULL,
    "submitted_at" TIMESTAMPTZ NOT NULL,
    "reviewer_id" UUID,
    "hearing_date" TIMESTAMPTZ,
    "hearing_attendees" JSONB,
    "hearing_notes" TEXT,
    "decision" "AppealDecision",
    "decision_reasoning" TEXT,
    "decided_by_id" UUID,
    "decided_at" TIMESTAMPTZ,
    "resulting_amendments" JSONB,
    "retention_status" "RetentionStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_appeals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_amendment_notices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "entity_type" VARCHAR(20) NOT NULL,
    "entity_id" UUID NOT NULL,
    "amendment_type" "AmendmentType" NOT NULL,
    "original_notification_id" UUID,
    "original_export_id" UUID,
    "what_changed" JSONB NOT NULL,
    "change_reason" TEXT NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "authorised_by_id" UUID,
    "correction_notification_sent" BOOLEAN NOT NULL DEFAULT false,
    "correction_notification_id" UUID,
    "correction_notification_sent_at" TIMESTAMPTZ,
    "requires_parent_reacknowledgement" BOOLEAN NOT NULL DEFAULT false,
    "parent_reacknowledged_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_amendment_notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_exclusion_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "case_number" VARCHAR(20) NOT NULL,
    "sanction_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "type" "ExclusionType" NOT NULL,
    "status" "ExclusionStatus" NOT NULL,
    "formal_notice_issued_at" TIMESTAMPTZ,
    "formal_notice_document_id" UUID,
    "hearing_date" TIMESTAMPTZ,
    "hearing_attendees" JSONB,
    "hearing_minutes_document_id" UUID,
    "student_representation" TEXT,
    "board_pack_generated_at" TIMESTAMPTZ,
    "board_pack_document_id" UUID,
    "decision" "ExclusionDecision",
    "decision_date" TIMESTAMPTZ,
    "decision_letter_document_id" UUID,
    "decision_reasoning" TEXT,
    "decided_by_id" UUID,
    "conditions_for_return" TEXT,
    "conditions_for_transfer" TEXT,
    "appeal_deadline" DATE,
    "appeal_id" UUID,
    "statutory_timeline" JSONB,
    "linked_evidence_ids" UUID[],
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_exclusion_cases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "file_name" VARCHAR(255) NOT NULL,
    "file_key" VARCHAR(500) NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "sha256_hash" VARCHAR(64) NOT NULL,
    "classification" "AttachmentClassification" NOT NULL,
    "description" VARCHAR(500),
    "visibility" "AttachmentVisibility" NOT NULL DEFAULT 'staff_all',
    "is_redactable" BOOLEAN NOT NULL DEFAULT false,
    "retention_status" "RetentionStatus" NOT NULL DEFAULT 'active',
    "retained_until" DATE,
    "scan_status" "ScanStatus" NOT NULL DEFAULT 'pending',
    "scanned_at" TIMESTAMPTZ,
    "version" INTEGER NOT NULL DEFAULT 1,
    "replaced_by_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_interventions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "intervention_number" VARCHAR(20) NOT NULL,
    "student_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "type" "InterventionType" NOT NULL,
    "status" "InterventionStatus" NOT NULL,
    "trigger_description" TEXT NOT NULL,
    "goals" JSONB NOT NULL DEFAULT '[]',
    "strategies" JSONB NOT NULL DEFAULT '[]',
    "assigned_to_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "target_end_date" DATE,
    "actual_end_date" DATE,
    "review_frequency_days" INTEGER NOT NULL DEFAULT 14,
    "next_review_date" DATE,
    "outcome" "InterventionOutcome",
    "outcome_notes" TEXT,
    "send_aware" BOOLEAN NOT NULL DEFAULT false,
    "send_notes" TEXT,
    "retention_status" "RetentionStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_interventions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_intervention_incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "intervention_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_intervention_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_intervention_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "intervention_id" UUID NOT NULL,
    "reviewed_by_id" UUID NOT NULL,
    "review_date" DATE NOT NULL,
    "progress" "InterventionProgress" NOT NULL,
    "goal_updates" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL,
    "next_review_date" DATE,
    "behaviour_points_since_last" INTEGER,
    "attendance_rate_since_last" DECIMAL(5,2),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_intervention_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_recognition_awards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "award_type_id" UUID NOT NULL,
    "points_at_award" INTEGER NOT NULL,
    "awarded_by_id" UUID NOT NULL,
    "awarded_at" TIMESTAMPTZ NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "triggered_by_incident_id" UUID,
    "superseded_by_id" UUID,
    "notes" TEXT,
    "parent_notified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_recognition_awards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_award_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_ar" VARCHAR(100),
    "description" TEXT,
    "points_threshold" INTEGER,
    "repeat_mode" VARCHAR(30) NOT NULL,
    "repeat_max_per_year" INTEGER,
    "tier_group" VARCHAR(50),
    "tier_level" INTEGER,
    "supersedes_lower_tiers" BOOLEAN NOT NULL DEFAULT false,
    "icon" VARCHAR(50),
    "color" VARCHAR(7),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_award_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_house_teams" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "name_ar" VARCHAR(100),
    "color" VARCHAR(7) NOT NULL,
    "icon" VARCHAR(50),
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_house_teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_house_memberships" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_house_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_policy_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "stage" "PolicyStage" NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "match_strategy" "PolicyMatchStrategy" NOT NULL DEFAULT 'first_match',
    "stop_processing_stage" BOOLEAN NOT NULL DEFAULT false,
    "conditions" JSONB NOT NULL,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    "last_published_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_policy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_policy_rule_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "action_type" "PolicyActionType" NOT NULL,
    "action_config" JSONB NOT NULL,
    "execution_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_policy_rule_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_policy_rule_versions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "conditions" JSONB NOT NULL,
    "actions" JSONB NOT NULL,
    "stage" "PolicyStage" NOT NULL,
    "match_strategy" "PolicyMatchStrategy" NOT NULL,
    "priority" INTEGER NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "change_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_policy_rule_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_policy_evaluations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "stage" "PolicyStage" NOT NULL,
    "rule_version_id" UUID,
    "evaluation_result" "PolicyEvaluationResult" NOT NULL,
    "evaluated_input" JSONB NOT NULL,
    "matched_conditions" JSONB,
    "unmatched_conditions" JSONB,
    "rules_evaluated_count" INTEGER NOT NULL,
    "evaluation_duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_policy_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_policy_action_executions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "action_type" "PolicyActionType" NOT NULL,
    "action_config" JSONB NOT NULL,
    "execution_status" "PolicyActionExecutionStatus" NOT NULL,
    "created_entity_type" VARCHAR(50),
    "created_entity_id" UUID,
    "failure_reason" TEXT,
    "executed_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_policy_action_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "alert_type" "AlertType" NOT NULL,
    "severity" "AlertSeverity" NOT NULL,
    "student_id" UUID,
    "subject_id" UUID,
    "staff_id" UUID,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT NOT NULL,
    "data_snapshot" JSONB NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'active',
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_alert_recipients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "alert_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "recipient_role" VARCHAR(50),
    "status" "AlertRecipientStatus" NOT NULL DEFAULT 'unseen',
    "seen_at" TIMESTAMPTZ,
    "acknowledged_at" TIMESTAMPTZ,
    "snoozed_until" TIMESTAMPTZ,
    "resolved_at" TIMESTAMPTZ,
    "dismissed_at" TIMESTAMPTZ,
    "dismissed_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_alert_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "template_id" UUID,
    "entity_type" VARCHAR(30) NOT NULL,
    "entity_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "generated_by_id" UUID NOT NULL,
    "generated_at" TIMESTAMPTZ NOT NULL,
    "file_key" VARCHAR(500) NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "sha256_hash" VARCHAR(64) NOT NULL,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
    "data_snapshot" JSONB NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'draft',
    "sent_at" TIMESTAMPTZ,
    "sent_via" "AcknowledgementChannel",
    "superseded_by_id" UUID,
    "superseded_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_document_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "document_type" "DocumentType" NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "locale" VARCHAR(5) NOT NULL DEFAULT 'en',
    "template_body" TEXT NOT NULL,
    "merge_fields" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "is_system" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_document_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_guardian_restrictions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "restriction_type" "RestrictionType" NOT NULL,
    "legal_basis" VARCHAR(200),
    "reason" TEXT NOT NULL,
    "set_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "effective_from" DATE NOT NULL,
    "effective_until" DATE,
    "review_date" DATE,
    "status" "RestrictionStatus" NOT NULL DEFAULT 'active',
    "revoked_at" TIMESTAMPTZ,
    "revoked_by_id" UUID,
    "revoke_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_guardian_restrictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_publication_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "publication_type" "PublicationType" NOT NULL,
    "entity_type" "PublicationEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "requires_parent_consent" BOOLEAN NOT NULL DEFAULT true,
    "parent_consent_status" "ParentConsentStatus" NOT NULL DEFAULT 'not_requested',
    "parent_consent_at" TIMESTAMPTZ,
    "admin_approved" BOOLEAN NOT NULL DEFAULT false,
    "admin_approved_by_id" UUID,
    "published_at" TIMESTAMPTZ,
    "unpublished_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_publication_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "behaviour_legal_holds" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "entity_type" "LegalHoldEntityType" NOT NULL,
    "entity_id" UUID NOT NULL,
    "hold_reason" TEXT NOT NULL,
    "legal_basis" VARCHAR(300),
    "set_by_id" UUID NOT NULL,
    "set_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "LegalHoldStatus" NOT NULL DEFAULT 'active',
    "released_by_id" UUID,
    "released_at" TIMESTAMPTZ,
    "release_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "behaviour_legal_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safeguarding_concerns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "concern_number" VARCHAR(20) NOT NULL,
    "student_id" UUID NOT NULL,
    "reported_by_id" UUID NOT NULL,
    "concern_type" "SafeguardingConcernType" NOT NULL,
    "severity" "SafeguardingSeverity" NOT NULL,
    "status" "SafeguardingStatus" NOT NULL,
    "description" TEXT NOT NULL,
    "immediate_actions_taken" TEXT,
    "designated_liaison_id" UUID,
    "assigned_to_id" UUID,
    "is_tusla_referral" BOOLEAN NOT NULL DEFAULT false,
    "tusla_reference_number" VARCHAR(50),
    "tusla_referred_at" TIMESTAMPTZ,
    "tusla_outcome" TEXT,
    "is_garda_referral" BOOLEAN NOT NULL DEFAULT false,
    "garda_reference_number" VARCHAR(50),
    "garda_referred_at" TIMESTAMPTZ,
    "resolution_notes" TEXT,
    "resolved_at" TIMESTAMPTZ,
    "reporter_acknowledgement_sent_at" TIMESTAMPTZ,
    "reporter_acknowledgement_status" "ReporterAckStatus",
    "sla_first_response_due" TIMESTAMPTZ,
    "sla_first_response_met_at" TIMESTAMPTZ,
    "sealed_at" TIMESTAMPTZ,
    "sealed_by_id" UUID,
    "sealed_reason" TEXT,
    "seal_approved_by_id" UUID,
    "retention_until" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safeguarding_concerns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safeguarding_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "concern_id" UUID NOT NULL,
    "action_by_id" UUID NOT NULL,
    "action_type" "SafeguardingActionType" NOT NULL,
    "description" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "due_date" TIMESTAMPTZ,
    "is_overdue" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safeguarding_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safeguarding_concern_incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "concern_id" UUID NOT NULL,
    "incident_id" UUID NOT NULL,
    "linked_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safeguarding_concern_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "safeguarding_break_glass_grants" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "granted_to_id" UUID NOT NULL,
    "granted_by_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "scope" "BreakGlassScope" NOT NULL DEFAULT 'all_concerns',
    "scoped_concern_ids" UUID[],
    "granted_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "revoked_at" TIMESTAMPTZ,
    "after_action_review_required" BOOLEAN NOT NULL DEFAULT true,
    "after_action_review_completed_at" TIMESTAMPTZ,
    "after_action_review_by_id" UUID,
    "after_action_review_notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "safeguarding_break_glass_grants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "idx_behaviour_categories_tenant_name" ON "behaviour_categories"("tenant_id", "name");

-- CreateIndex
CREATE INDEX "idx_behaviour_categories_tenant" ON "behaviour_categories"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_behaviour_incidents_number" ON "behaviour_incidents"("tenant_id", "incident_number");

-- CreateIndex
CREATE UNIQUE INDEX "idx_behaviour_incidents_idempotency" ON "behaviour_incidents"("tenant_id", "idempotency_key");

-- CreateIndex
CREATE INDEX "idx_behaviour_incidents_occurred" ON "behaviour_incidents"("tenant_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "idx_behaviour_incidents_polarity" ON "behaviour_incidents"("tenant_id", "polarity", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "idx_behaviour_incidents_status" ON "behaviour_incidents"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_behaviour_incidents_followup" ON "behaviour_incidents"("tenant_id", "status", "follow_up_required");

-- CreateIndex
CREATE INDEX "idx_behaviour_incidents_category" ON "behaviour_incidents"("tenant_id", "category_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "idx_behaviour_incidents_reporter" ON "behaviour_incidents"("tenant_id", "reported_by_id", "occurred_at" DESC);

-- CreateIndex
CREATE INDEX "idx_behaviour_incidents_subject_time" ON "behaviour_incidents"("tenant_id", "subject_id", "weekday", "period_order");

-- CreateIndex
CREATE INDEX "idx_behaviour_incidents_context_time" ON "behaviour_incidents"("tenant_id", "context_type", "weekday", "period_order");

-- CreateIndex
CREATE INDEX "idx_behaviour_incidents_year" ON "behaviour_incidents"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_participants_incident" ON "behaviour_incident_participants"("tenant_id", "incident_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_participants_student" ON "behaviour_incident_participants"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_desc_templates_category" ON "behaviour_description_templates"("tenant_id", "category_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_entity_history_entity" ON "behaviour_entity_history"("tenant_id", "entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "idx_behaviour_entity_history_type" ON "behaviour_entity_history"("tenant_id", "entity_type", "created_at");

-- CreateIndex
CREATE INDEX "idx_behaviour_tasks_assignee" ON "behaviour_tasks"("tenant_id", "assigned_to_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "idx_behaviour_tasks_entity" ON "behaviour_tasks"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_tasks_status" ON "behaviour_tasks"("tenant_id", "status", "due_date");

-- CreateIndex
CREATE INDEX "idx_behaviour_parent_ack_incident" ON "behaviour_parent_acknowledgements"("tenant_id", "incident_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_parent_ack_parent" ON "behaviour_parent_acknowledgements"("tenant_id", "parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_behaviour_sanctions_number" ON "behaviour_sanctions"("tenant_id", "sanction_number");

-- CreateIndex
CREATE INDEX "idx_behaviour_sanctions_student" ON "behaviour_sanctions"("tenant_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "idx_behaviour_sanctions_incident" ON "behaviour_sanctions"("tenant_id", "incident_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_behaviour_appeals_number" ON "behaviour_appeals"("tenant_id", "appeal_number");

-- CreateIndex
CREATE INDEX "idx_behaviour_appeals_student" ON "behaviour_appeals"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_appeals_status" ON "behaviour_appeals"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_behaviour_amendments_entity" ON "behaviour_amendment_notices"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_behaviour_exclusions_number" ON "behaviour_exclusion_cases"("tenant_id", "case_number");

-- CreateIndex
CREATE INDEX "idx_behaviour_exclusions_student" ON "behaviour_exclusion_cases"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_exclusions_status" ON "behaviour_exclusion_cases"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_behaviour_attachments_entity" ON "behaviour_attachments"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_behaviour_interventions_number" ON "behaviour_interventions"("tenant_id", "intervention_number");

-- CreateIndex
CREATE INDEX "idx_behaviour_interventions_student" ON "behaviour_interventions"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_interventions_status" ON "behaviour_interventions"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "idx_behaviour_intervention_incidents_pair" ON "behaviour_intervention_incidents"("intervention_id", "incident_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_intervention_reviews_intervention" ON "behaviour_intervention_reviews"("tenant_id", "intervention_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_awards_student" ON "behaviour_recognition_awards"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_awards_year" ON "behaviour_recognition_awards"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_award_types_tenant" ON "behaviour_award_types"("tenant_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_house_teams_tenant" ON "behaviour_house_teams"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_behaviour_house_memberships_student_year" ON "behaviour_house_memberships"("tenant_id", "student_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_policy_rules_active" ON "behaviour_policy_rules"("tenant_id", "is_active", "stage", "priority");

-- CreateIndex
CREATE INDEX "idx_behaviour_policy_rule_actions_rule" ON "behaviour_policy_rule_actions"("tenant_id", "rule_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_behaviour_policy_rule_versions_unique" ON "behaviour_policy_rule_versions"("rule_id", "version");

-- CreateIndex
CREATE INDEX "idx_behaviour_policy_evaluations_incident" ON "behaviour_policy_evaluations"("tenant_id", "incident_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_policy_action_exec_eval" ON "behaviour_policy_action_executions"("tenant_id", "evaluation_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_alerts_status" ON "behaviour_alerts"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_behaviour_alerts_student" ON "behaviour_alerts"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_alert_recipients_alert" ON "behaviour_alert_recipients"("tenant_id", "alert_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_alert_recipients_user" ON "behaviour_alert_recipients"("tenant_id", "recipient_id", "status");

-- CreateIndex
CREATE INDEX "idx_behaviour_documents_entity" ON "behaviour_documents"("tenant_id", "entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_documents_student" ON "behaviour_documents"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_doc_templates_type" ON "behaviour_document_templates"("tenant_id", "document_type");

-- CreateIndex
CREATE INDEX "idx_behaviour_guardian_restrictions_student" ON "behaviour_guardian_restrictions"("tenant_id", "student_id", "status");

-- CreateIndex
CREATE INDEX "idx_behaviour_guardian_restrictions_parent" ON "behaviour_guardian_restrictions"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_publication_approvals_student" ON "behaviour_publication_approvals"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_behaviour_legal_holds_entity" ON "behaviour_legal_holds"("tenant_id", "entity_type", "entity_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "idx_safeguarding_concerns_number" ON "safeguarding_concerns"("tenant_id", "concern_number");

-- CreateIndex
CREATE INDEX "idx_safeguarding_concerns_student" ON "safeguarding_concerns"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_safeguarding_concerns_status" ON "safeguarding_concerns"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_safeguarding_actions_concern" ON "safeguarding_actions"("tenant_id", "concern_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_safeguarding_concern_incidents_pair" ON "safeguarding_concern_incidents"("concern_id", "incident_id");

-- CreateIndex
CREATE INDEX "idx_safeguarding_break_glass_grantee" ON "safeguarding_break_glass_grants"("tenant_id", "granted_to_id");

-- AddForeignKey
ALTER TABLE "behaviour_categories" ADD CONSTRAINT "behaviour_categories_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incidents" ADD CONSTRAINT "behaviour_incidents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incidents" ADD CONSTRAINT "behaviour_incidents_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "behaviour_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incidents" ADD CONSTRAINT "behaviour_incidents_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incidents" ADD CONSTRAINT "behaviour_incidents_parent_description_set_by_id_fkey" FOREIGN KEY ("parent_description_set_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incidents" ADD CONSTRAINT "behaviour_incidents_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incidents" ADD CONSTRAINT "behaviour_incidents_academic_period_id_fkey" FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incidents" ADD CONSTRAINT "behaviour_incidents_schedule_entry_id_fkey" FOREIGN KEY ("schedule_entry_id") REFERENCES "schedules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incidents" ADD CONSTRAINT "behaviour_incidents_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incidents" ADD CONSTRAINT "behaviour_incidents_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incidents" ADD CONSTRAINT "behaviour_incidents_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incidents" ADD CONSTRAINT "behaviour_incidents_escalated_from_id_fkey" FOREIGN KEY ("escalated_from_id") REFERENCES "behaviour_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incident_participants" ADD CONSTRAINT "behaviour_incident_participants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incident_participants" ADD CONSTRAINT "behaviour_incident_participants_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "behaviour_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incident_participants" ADD CONSTRAINT "behaviour_incident_participants_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incident_participants" ADD CONSTRAINT "behaviour_incident_participants_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_incident_participants" ADD CONSTRAINT "behaviour_incident_participants_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_description_templates" ADD CONSTRAINT "behaviour_description_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_description_templates" ADD CONSTRAINT "behaviour_description_templates_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "behaviour_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_entity_history" ADD CONSTRAINT "behaviour_entity_history_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_entity_history" ADD CONSTRAINT "behaviour_entity_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_tasks" ADD CONSTRAINT "behaviour_tasks_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_tasks" ADD CONSTRAINT "behaviour_tasks_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_tasks" ADD CONSTRAINT "behaviour_tasks_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_tasks" ADD CONSTRAINT "behaviour_tasks_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_parent_acknowledgements" ADD CONSTRAINT "behaviour_parent_acknowledgements_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_parent_acknowledgements" ADD CONSTRAINT "behaviour_parent_acknowledgements_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "behaviour_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_parent_acknowledgements" ADD CONSTRAINT "behaviour_parent_acknowledgements_sanction_id_fkey" FOREIGN KEY ("sanction_id") REFERENCES "behaviour_sanctions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_parent_acknowledgements" ADD CONSTRAINT "behaviour_parent_acknowledgements_amendment_notice_id_fkey" FOREIGN KEY ("amendment_notice_id") REFERENCES "behaviour_amendment_notices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_parent_acknowledgements" ADD CONSTRAINT "behaviour_parent_acknowledgements_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_parent_acknowledgements" ADD CONSTRAINT "behaviour_parent_acknowledgements_notification_id_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_sanctions" ADD CONSTRAINT "behaviour_sanctions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_sanctions" ADD CONSTRAINT "behaviour_sanctions_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "behaviour_incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_sanctions" ADD CONSTRAINT "behaviour_sanctions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_sanctions" ADD CONSTRAINT "behaviour_sanctions_approval_request_id_fkey" FOREIGN KEY ("approval_request_id") REFERENCES "approval_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_sanctions" ADD CONSTRAINT "behaviour_sanctions_scheduled_room_id_fkey" FOREIGN KEY ("scheduled_room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_sanctions" ADD CONSTRAINT "behaviour_sanctions_supervised_by_id_fkey" FOREIGN KEY ("supervised_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_sanctions" ADD CONSTRAINT "behaviour_sanctions_served_by_id_fkey" FOREIGN KEY ("served_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_sanctions" ADD CONSTRAINT "behaviour_sanctions_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "behaviour_sanctions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_appeals" ADD CONSTRAINT "behaviour_appeals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_appeals" ADD CONSTRAINT "behaviour_appeals_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "behaviour_incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_appeals" ADD CONSTRAINT "behaviour_appeals_sanction_id_fkey" FOREIGN KEY ("sanction_id") REFERENCES "behaviour_sanctions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_appeals" ADD CONSTRAINT "behaviour_appeals_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_appeals" ADD CONSTRAINT "behaviour_appeals_appellant_parent_id_fkey" FOREIGN KEY ("appellant_parent_id") REFERENCES "parents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_appeals" ADD CONSTRAINT "behaviour_appeals_appellant_staff_id_fkey" FOREIGN KEY ("appellant_staff_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_appeals" ADD CONSTRAINT "behaviour_appeals_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_appeals" ADD CONSTRAINT "behaviour_appeals_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_amendment_notices" ADD CONSTRAINT "behaviour_amendment_notices_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_amendment_notices" ADD CONSTRAINT "behaviour_amendment_notices_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_amendment_notices" ADD CONSTRAINT "behaviour_amendment_notices_authorised_by_id_fkey" FOREIGN KEY ("authorised_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_amendment_notices" ADD CONSTRAINT "behaviour_amendment_notices_original_notification_id_fkey" FOREIGN KEY ("original_notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_amendment_notices" ADD CONSTRAINT "behaviour_amendment_notices_correction_notification_id_fkey" FOREIGN KEY ("correction_notification_id") REFERENCES "notifications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_exclusion_cases" ADD CONSTRAINT "behaviour_exclusion_cases_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_exclusion_cases" ADD CONSTRAINT "behaviour_exclusion_cases_sanction_id_fkey" FOREIGN KEY ("sanction_id") REFERENCES "behaviour_sanctions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_exclusion_cases" ADD CONSTRAINT "behaviour_exclusion_cases_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "behaviour_incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_exclusion_cases" ADD CONSTRAINT "behaviour_exclusion_cases_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_exclusion_cases" ADD CONSTRAINT "behaviour_exclusion_cases_decided_by_id_fkey" FOREIGN KEY ("decided_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_exclusion_cases" ADD CONSTRAINT "behaviour_exclusion_cases_appeal_id_fkey" FOREIGN KEY ("appeal_id") REFERENCES "behaviour_appeals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_attachments" ADD CONSTRAINT "behaviour_attachments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_attachments" ADD CONSTRAINT "behaviour_attachments_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_attachments" ADD CONSTRAINT "behaviour_attachments_replaced_by_id_fkey" FOREIGN KEY ("replaced_by_id") REFERENCES "behaviour_attachments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_interventions" ADD CONSTRAINT "behaviour_interventions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_interventions" ADD CONSTRAINT "behaviour_interventions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_interventions" ADD CONSTRAINT "behaviour_interventions_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_intervention_incidents" ADD CONSTRAINT "behaviour_intervention_incidents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_intervention_incidents" ADD CONSTRAINT "behaviour_intervention_incidents_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "behaviour_interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_intervention_incidents" ADD CONSTRAINT "behaviour_intervention_incidents_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "behaviour_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_intervention_reviews" ADD CONSTRAINT "behaviour_intervention_reviews_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_intervention_reviews" ADD CONSTRAINT "behaviour_intervention_reviews_intervention_id_fkey" FOREIGN KEY ("intervention_id") REFERENCES "behaviour_interventions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_intervention_reviews" ADD CONSTRAINT "behaviour_intervention_reviews_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_recognition_awards" ADD CONSTRAINT "behaviour_recognition_awards_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_recognition_awards" ADD CONSTRAINT "behaviour_recognition_awards_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_recognition_awards" ADD CONSTRAINT "behaviour_recognition_awards_award_type_id_fkey" FOREIGN KEY ("award_type_id") REFERENCES "behaviour_award_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_recognition_awards" ADD CONSTRAINT "behaviour_recognition_awards_awarded_by_id_fkey" FOREIGN KEY ("awarded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_recognition_awards" ADD CONSTRAINT "behaviour_recognition_awards_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_recognition_awards" ADD CONSTRAINT "behaviour_recognition_awards_triggered_by_incident_id_fkey" FOREIGN KEY ("triggered_by_incident_id") REFERENCES "behaviour_incidents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_recognition_awards" ADD CONSTRAINT "behaviour_recognition_awards_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "behaviour_recognition_awards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_award_types" ADD CONSTRAINT "behaviour_award_types_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_house_teams" ADD CONSTRAINT "behaviour_house_teams_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_house_memberships" ADD CONSTRAINT "behaviour_house_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_house_memberships" ADD CONSTRAINT "behaviour_house_memberships_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_house_memberships" ADD CONSTRAINT "behaviour_house_memberships_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "behaviour_house_teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_house_memberships" ADD CONSTRAINT "behaviour_house_memberships_academic_year_id_fkey" FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_policy_rules" ADD CONSTRAINT "behaviour_policy_rules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_policy_rule_actions" ADD CONSTRAINT "behaviour_policy_rule_actions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_policy_rule_actions" ADD CONSTRAINT "behaviour_policy_rule_actions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "behaviour_policy_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_policy_rule_versions" ADD CONSTRAINT "behaviour_policy_rule_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_policy_rule_versions" ADD CONSTRAINT "behaviour_policy_rule_versions_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "behaviour_policy_rules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_policy_rule_versions" ADD CONSTRAINT "behaviour_policy_rule_versions_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_policy_evaluations" ADD CONSTRAINT "behaviour_policy_evaluations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_policy_evaluations" ADD CONSTRAINT "behaviour_policy_evaluations_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "behaviour_incidents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_policy_evaluations" ADD CONSTRAINT "behaviour_policy_evaluations_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_policy_evaluations" ADD CONSTRAINT "behaviour_policy_evaluations_rule_version_id_fkey" FOREIGN KEY ("rule_version_id") REFERENCES "behaviour_policy_rule_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_policy_action_executions" ADD CONSTRAINT "behaviour_policy_action_executions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_policy_action_executions" ADD CONSTRAINT "behaviour_policy_action_executions_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "behaviour_policy_evaluations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_alerts" ADD CONSTRAINT "behaviour_alerts_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_alerts" ADD CONSTRAINT "behaviour_alerts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_alerts" ADD CONSTRAINT "behaviour_alerts_subject_id_fkey" FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_alerts" ADD CONSTRAINT "behaviour_alerts_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_alert_recipients" ADD CONSTRAINT "behaviour_alert_recipients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_alert_recipients" ADD CONSTRAINT "behaviour_alert_recipients_alert_id_fkey" FOREIGN KEY ("alert_id") REFERENCES "behaviour_alerts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_alert_recipients" ADD CONSTRAINT "behaviour_alert_recipients_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_documents" ADD CONSTRAINT "behaviour_documents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_documents" ADD CONSTRAINT "behaviour_documents_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "behaviour_document_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_documents" ADD CONSTRAINT "behaviour_documents_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_documents" ADD CONSTRAINT "behaviour_documents_generated_by_id_fkey" FOREIGN KEY ("generated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_documents" ADD CONSTRAINT "behaviour_documents_superseded_by_id_fkey" FOREIGN KEY ("superseded_by_id") REFERENCES "behaviour_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_document_templates" ADD CONSTRAINT "behaviour_document_templates_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_guardian_restrictions" ADD CONSTRAINT "behaviour_guardian_restrictions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_guardian_restrictions" ADD CONSTRAINT "behaviour_guardian_restrictions_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_guardian_restrictions" ADD CONSTRAINT "behaviour_guardian_restrictions_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_guardian_restrictions" ADD CONSTRAINT "behaviour_guardian_restrictions_set_by_id_fkey" FOREIGN KEY ("set_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_guardian_restrictions" ADD CONSTRAINT "behaviour_guardian_restrictions_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_guardian_restrictions" ADD CONSTRAINT "behaviour_guardian_restrictions_revoked_by_id_fkey" FOREIGN KEY ("revoked_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_publication_approvals" ADD CONSTRAINT "behaviour_publication_approvals_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_publication_approvals" ADD CONSTRAINT "behaviour_publication_approvals_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_publication_approvals" ADD CONSTRAINT "behaviour_publication_approvals_admin_approved_by_id_fkey" FOREIGN KEY ("admin_approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_legal_holds" ADD CONSTRAINT "behaviour_legal_holds_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_legal_holds" ADD CONSTRAINT "behaviour_legal_holds_set_by_id_fkey" FOREIGN KEY ("set_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "behaviour_legal_holds" ADD CONSTRAINT "behaviour_legal_holds_released_by_id_fkey" FOREIGN KEY ("released_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_concerns" ADD CONSTRAINT "safeguarding_concerns_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_concerns" ADD CONSTRAINT "safeguarding_concerns_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_concerns" ADD CONSTRAINT "safeguarding_concerns_reported_by_id_fkey" FOREIGN KEY ("reported_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_concerns" ADD CONSTRAINT "safeguarding_concerns_designated_liaison_id_fkey" FOREIGN KEY ("designated_liaison_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_concerns" ADD CONSTRAINT "safeguarding_concerns_assigned_to_id_fkey" FOREIGN KEY ("assigned_to_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_concerns" ADD CONSTRAINT "safeguarding_concerns_sealed_by_id_fkey" FOREIGN KEY ("sealed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_concerns" ADD CONSTRAINT "safeguarding_concerns_seal_approved_by_id_fkey" FOREIGN KEY ("seal_approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_actions" ADD CONSTRAINT "safeguarding_actions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_actions" ADD CONSTRAINT "safeguarding_actions_concern_id_fkey" FOREIGN KEY ("concern_id") REFERENCES "safeguarding_concerns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_actions" ADD CONSTRAINT "safeguarding_actions_action_by_id_fkey" FOREIGN KEY ("action_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_concern_incidents" ADD CONSTRAINT "safeguarding_concern_incidents_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_concern_incidents" ADD CONSTRAINT "safeguarding_concern_incidents_concern_id_fkey" FOREIGN KEY ("concern_id") REFERENCES "safeguarding_concerns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_concern_incidents" ADD CONSTRAINT "safeguarding_concern_incidents_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "behaviour_incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_concern_incidents" ADD CONSTRAINT "safeguarding_concern_incidents_linked_by_id_fkey" FOREIGN KEY ("linked_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_break_glass_grants" ADD CONSTRAINT "safeguarding_break_glass_grants_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_break_glass_grants" ADD CONSTRAINT "safeguarding_break_glass_grants_granted_to_id_fkey" FOREIGN KEY ("granted_to_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_break_glass_grants" ADD CONSTRAINT "safeguarding_break_glass_grants_granted_by_id_fkey" FOREIGN KEY ("granted_by_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "safeguarding_break_glass_grants" ADD CONSTRAINT "safeguarding_break_glass_grants_after_action_review_by_id_fkey" FOREIGN KEY ("after_action_review_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Enable RLS on all new behaviour tables
ALTER TABLE "behaviour_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_incident_participants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_description_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_entity_history" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_parent_acknowledgements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_sanctions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_appeals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_amendment_notices" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_exclusion_cases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_attachments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_interventions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_intervention_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_intervention_reviews" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_recognition_awards" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_award_types" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_house_teams" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_house_memberships" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_policy_rules" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_policy_rule_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_policy_rule_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_policy_evaluations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_policy_action_executions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_alerts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_alert_recipients" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_document_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_guardian_restrictions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_publication_approvals" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "behaviour_legal_holds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safeguarding_concerns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safeguarding_actions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safeguarding_concern_incidents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safeguarding_break_glass_grants" ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for all new tenant-scoped tables
CREATE POLICY "tenant_isolation" ON "behaviour_categories" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_incidents" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_incident_participants" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_description_templates" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_entity_history" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_tasks" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_parent_acknowledgements" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_sanctions" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_appeals" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_amendment_notices" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_exclusion_cases" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_attachments" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_interventions" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_intervention_incidents" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_intervention_reviews" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_recognition_awards" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_award_types" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_house_teams" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_house_memberships" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_policy_rules" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_policy_rule_actions" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_policy_rule_versions" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_policy_evaluations" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_policy_action_executions" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_alerts" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_alert_recipients" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_documents" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_document_templates" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_guardian_restrictions" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_publication_approvals" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "behaviour_legal_holds" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "safeguarding_concerns" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "safeguarding_actions" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "safeguarding_concern_incidents" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
CREATE POLICY "tenant_isolation" ON "safeguarding_break_glass_grants" USING ("tenant_id" = current_setting('app.current_tenant_id')::UUID);
