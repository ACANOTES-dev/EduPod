-- Add enum value to existing per-module settings enum
ALTER TYPE "ModuleKey" ADD VALUE IF NOT EXISTS 'sen';

-- CreateEnum
CREATE TYPE "SenCategory" AS ENUM (
  'learning',
  'emotional_behavioural',
  'physical',
  'sensory',
  'asd',
  'speech_language',
  'multiple',
  'other'
);

-- CreateEnum
CREATE TYPE "SenSupportLevel" AS ENUM (
  'school_support',
  'school_support_plus'
);

-- CreateEnum
CREATE TYPE "SupportPlanStatus" AS ENUM (
  'draft',
  'active',
  'under_review',
  'closed',
  'archived'
);

-- CreateEnum
CREATE TYPE "SenGoalStatus" AS ENUM (
  'not_started',
  'in_progress',
  'partially_achieved',
  'achieved',
  'discontinued'
);

-- CreateEnum
CREATE TYPE "SenProfessionalType" AS ENUM (
  'educational_psychologist',
  'speech_therapist',
  'occupational_therapist',
  'camhs',
  'physiotherapist',
  'seno',
  'neps',
  'other'
);

-- CreateEnum
CREATE TYPE "SenReferralStatus" AS ENUM (
  'pending',
  'scheduled',
  'completed',
  'report_received'
);

-- CreateEnum
CREATE TYPE "AccommodationType" AS ENUM (
  'exam',
  'classroom',
  'assistive_technology'
);

-- CreateEnum
CREATE TYPE "SnaAssignmentStatus" AS ENUM (
  'active',
  'ended'
);

-- CreateEnum
CREATE TYPE "SenResourceSource" AS ENUM (
  'seno',
  'school'
);

-- CreateTable
CREATE TABLE "sen_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "sen_coordinator_user_id" UUID,
    "sen_categories" JSONB NOT NULL,
    "primary_category" "SenCategory" NOT NULL,
    "support_level" "SenSupportLevel" NOT NULL,
    "diagnosis" VARCHAR(255),
    "diagnosis_date" DATE,
    "diagnosis_source" VARCHAR(255),
    "assessment_notes" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "flagged_date" DATE,
    "unflagged_date" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sen_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sen_support_plans" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sen_profile_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "academic_period_id" UUID,
    "plan_number" VARCHAR(50) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "parent_version_id" UUID,
    "status" "SupportPlanStatus" NOT NULL DEFAULT 'draft',
    "review_date" DATE,
    "next_review_date" DATE,
    "reviewed_by_user_id" UUID,
    "review_notes" TEXT,
    "parent_input" TEXT,
    "student_voice" TEXT,
    "staff_notes" TEXT,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sen_support_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sen_goals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "support_plan_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "target" TEXT NOT NULL,
    "baseline" TEXT NOT NULL,
    "current_level" TEXT,
    "target_date" DATE NOT NULL,
    "status" "SenGoalStatus" NOT NULL DEFAULT 'not_started',
    "display_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sen_goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sen_goal_strategies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "responsible_user_id" UUID,
    "frequency" VARCHAR(100),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sen_goal_strategies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sen_goal_progress" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "goal_id" UUID NOT NULL,
    "note" TEXT NOT NULL,
    "current_level" TEXT,
    "recorded_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sen_goal_progress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sen_resource_allocations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "academic_year_id" UUID NOT NULL,
    "total_hours" DECIMAL(8,2) NOT NULL,
    "source" "SenResourceSource" NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sen_resource_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sen_student_hours" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "resource_allocation_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "sen_profile_id" UUID NOT NULL,
    "allocated_hours" DECIMAL(6,2) NOT NULL,
    "used_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sen_student_hours_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sen_sna_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sna_staff_profile_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "sen_profile_id" UUID NOT NULL,
    "schedule" JSONB NOT NULL,
    "status" "SnaAssignmentStatus" NOT NULL DEFAULT 'active',
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sen_sna_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sen_professional_involvements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sen_profile_id" UUID NOT NULL,
    "professional_type" "SenProfessionalType" NOT NULL,
    "professional_name" VARCHAR(255),
    "organisation" VARCHAR(255),
    "referral_date" DATE,
    "assessment_date" DATE,
    "report_received_date" DATE,
    "recommendations" TEXT,
    "status" "SenReferralStatus" NOT NULL DEFAULT 'pending',
    "pastoral_referral_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sen_professional_involvements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sen_accommodations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sen_profile_id" UUID NOT NULL,
    "accommodation_type" "AccommodationType" NOT NULL,
    "description" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "start_date" DATE,
    "end_date" DATE,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "approved_by_user_id" UUID,
    "approved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sen_accommodations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sen_transition_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "sen_profile_id" UUID NOT NULL,
    "note_type" VARCHAR(100) NOT NULL,
    "content" TEXT NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "sen_transition_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_sen_profiles_tenant_student"
  ON "sen_profiles"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_sen_profiles_tenant_active"
  ON "sen_profiles"("tenant_id", "is_active");

-- CreateIndex
CREATE INDEX "idx_sen_profiles_tenant_primary_category"
  ON "sen_profiles"("tenant_id", "primary_category");

-- CreateIndex
CREATE INDEX "idx_sen_profiles_tenant_support_level"
  ON "sen_profiles"("tenant_id", "support_level");

-- CreateIndex
CREATE INDEX "idx_sen_support_plans_tenant_profile"
  ON "sen_support_plans"("tenant_id", "sen_profile_id");

-- CreateIndex
CREATE INDEX "idx_sen_support_plans_tenant_status"
  ON "sen_support_plans"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_sen_support_plans_tenant_year"
  ON "sen_support_plans"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE INDEX "idx_sen_goals_tenant_plan"
  ON "sen_goals"("tenant_id", "support_plan_id");

-- CreateIndex
CREATE INDEX "idx_sen_goal_strategies_tenant_goal"
  ON "sen_goal_strategies"("tenant_id", "goal_id");

-- CreateIndex
CREATE INDEX "idx_sen_goal_progress_tenant_goal"
  ON "sen_goal_progress"("tenant_id", "goal_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_sen_resource_allocations_tenant_year_source"
  ON "sen_resource_allocations"("tenant_id", "academic_year_id", "source");

-- CreateIndex
CREATE INDEX "idx_sen_resource_allocations_tenant_year"
  ON "sen_resource_allocations"("tenant_id", "academic_year_id");

-- CreateIndex
CREATE UNIQUE INDEX "idx_sen_student_hours_tenant_allocation_student"
  ON "sen_student_hours"("tenant_id", "resource_allocation_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_sen_student_hours_tenant_profile"
  ON "sen_student_hours"("tenant_id", "sen_profile_id");

-- CreateIndex
CREATE INDEX "idx_sen_sna_assignments_tenant_status"
  ON "sen_sna_assignments"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_sen_sna_assignments_tenant_staff"
  ON "sen_sna_assignments"("tenant_id", "sna_staff_profile_id");

-- CreateIndex
CREATE INDEX "idx_sen_sna_assignments_tenant_student"
  ON "sen_sna_assignments"("tenant_id", "student_id");

-- CreateIndex
CREATE INDEX "idx_sen_professional_involvements_tenant_profile"
  ON "sen_professional_involvements"("tenant_id", "sen_profile_id");

-- CreateIndex
CREATE INDEX "idx_sen_professional_involvements_tenant_status"
  ON "sen_professional_involvements"("tenant_id", "status");

-- CreateIndex
CREATE INDEX "idx_sen_accommodations_tenant_profile"
  ON "sen_accommodations"("tenant_id", "sen_profile_id");

-- CreateIndex
CREATE INDEX "idx_sen_accommodations_tenant_type"
  ON "sen_accommodations"("tenant_id", "accommodation_type");

-- CreateIndex
CREATE INDEX "idx_sen_transition_notes_tenant_profile"
  ON "sen_transition_notes"("tenant_id", "sen_profile_id");

-- AddForeignKey
ALTER TABLE "sen_profiles"
  ADD CONSTRAINT "sen_profiles_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_profiles"
  ADD CONSTRAINT "sen_profiles_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sen_profiles"
  ADD CONSTRAINT "sen_profiles_sen_coordinator_user_id_fkey"
  FOREIGN KEY ("sen_coordinator_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sen_support_plans"
  ADD CONSTRAINT "sen_support_plans_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_support_plans"
  ADD CONSTRAINT "sen_support_plans_sen_profile_id_fkey"
  FOREIGN KEY ("sen_profile_id") REFERENCES "sen_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_support_plans"
  ADD CONSTRAINT "sen_support_plans_academic_year_id_fkey"
  FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sen_support_plans"
  ADD CONSTRAINT "sen_support_plans_academic_period_id_fkey"
  FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sen_support_plans"
  ADD CONSTRAINT "sen_support_plans_parent_version_id_fkey"
  FOREIGN KEY ("parent_version_id") REFERENCES "sen_support_plans"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sen_support_plans"
  ADD CONSTRAINT "sen_support_plans_reviewed_by_user_id_fkey"
  FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sen_support_plans"
  ADD CONSTRAINT "sen_support_plans_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sen_goals"
  ADD CONSTRAINT "sen_goals_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_goals"
  ADD CONSTRAINT "sen_goals_support_plan_id_fkey"
  FOREIGN KEY ("support_plan_id") REFERENCES "sen_support_plans"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_goal_strategies"
  ADD CONSTRAINT "sen_goal_strategies_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_goal_strategies"
  ADD CONSTRAINT "sen_goal_strategies_goal_id_fkey"
  FOREIGN KEY ("goal_id") REFERENCES "sen_goals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_goal_strategies"
  ADD CONSTRAINT "sen_goal_strategies_responsible_user_id_fkey"
  FOREIGN KEY ("responsible_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sen_goal_progress"
  ADD CONSTRAINT "sen_goal_progress_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_goal_progress"
  ADD CONSTRAINT "sen_goal_progress_goal_id_fkey"
  FOREIGN KEY ("goal_id") REFERENCES "sen_goals"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_goal_progress"
  ADD CONSTRAINT "sen_goal_progress_recorded_by_user_id_fkey"
  FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sen_resource_allocations"
  ADD CONSTRAINT "sen_resource_allocations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_resource_allocations"
  ADD CONSTRAINT "sen_resource_allocations_academic_year_id_fkey"
  FOREIGN KEY ("academic_year_id") REFERENCES "academic_years"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sen_student_hours"
  ADD CONSTRAINT "sen_student_hours_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_student_hours"
  ADD CONSTRAINT "sen_student_hours_resource_allocation_id_fkey"
  FOREIGN KEY ("resource_allocation_id") REFERENCES "sen_resource_allocations"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_student_hours"
  ADD CONSTRAINT "sen_student_hours_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sen_student_hours"
  ADD CONSTRAINT "sen_student_hours_sen_profile_id_fkey"
  FOREIGN KEY ("sen_profile_id") REFERENCES "sen_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sen_sna_assignments"
  ADD CONSTRAINT "sen_sna_assignments_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_sna_assignments"
  ADD CONSTRAINT "sen_sna_assignments_sna_staff_profile_id_fkey"
  FOREIGN KEY ("sna_staff_profile_id") REFERENCES "staff_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sen_sna_assignments"
  ADD CONSTRAINT "sen_sna_assignments_student_id_fkey"
  FOREIGN KEY ("student_id") REFERENCES "students"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sen_sna_assignments"
  ADD CONSTRAINT "sen_sna_assignments_sen_profile_id_fkey"
  FOREIGN KEY ("sen_profile_id") REFERENCES "sen_profiles"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "sen_professional_involvements"
  ADD CONSTRAINT "sen_professional_involvements_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_professional_involvements"
  ADD CONSTRAINT "sen_professional_involvements_sen_profile_id_fkey"
  FOREIGN KEY ("sen_profile_id") REFERENCES "sen_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_professional_involvements"
  ADD CONSTRAINT "sen_professional_involvements_pastoral_referral_id_fkey"
  FOREIGN KEY ("pastoral_referral_id") REFERENCES "pastoral_referrals"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sen_accommodations"
  ADD CONSTRAINT "sen_accommodations_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_accommodations"
  ADD CONSTRAINT "sen_accommodations_sen_profile_id_fkey"
  FOREIGN KEY ("sen_profile_id") REFERENCES "sen_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_accommodations"
  ADD CONSTRAINT "sen_accommodations_approved_by_user_id_fkey"
  FOREIGN KEY ("approved_by_user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "sen_transition_notes"
  ADD CONSTRAINT "sen_transition_notes_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_transition_notes"
  ADD CONSTRAINT "sen_transition_notes_sen_profile_id_fkey"
  FOREIGN KEY ("sen_profile_id") REFERENCES "sen_profiles"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "sen_transition_notes"
  ADD CONSTRAINT "sen_transition_notes_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
