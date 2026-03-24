-- ─── New Enums ─────────────────────────────────────────────────────────────

CREATE TYPE "AssessmentType" AS ENUM ('formative', 'summative');
CREATE TYPE "CurveMethod" AS ENUM ('none', 'linear_shift', 'linear_scale', 'sqrt', 'bell', 'custom');
CREATE TYPE "AiGradingInstructionStatus" AS ENUM ('draft', 'pending_approval', 'active', 'rejected');
CREATE TYPE "AcademicRiskLevel" AS ENUM ('low', 'medium', 'high');
CREATE TYPE "AcademicAlertType" AS ENUM ('at_risk_low', 'at_risk_medium', 'at_risk_high', 'score_anomaly', 'class_anomaly', 'grading_pattern_anomaly', 'teacher_variance');
CREATE TYPE "AcademicAlertStatus" AS ENUM ('active', 'acknowledged', 'resolved');
CREATE TYPE "ProgressReportStatus" AS ENUM ('draft', 'sent');
CREATE TYPE "TrendDirection" AS ENUM ('improving', 'declining', 'stable');

-- ─── Modify Existing Tables ───────────────────────────────────────────────

-- AssessmentCategory: add assessment_type
ALTER TABLE "assessment_categories" ADD COLUMN "assessment_type" "AssessmentType" NOT NULL DEFAULT 'summative';

-- ClassSubjectGradeConfig: add credit_hours
ALTER TABLE "class_subject_grade_configs" ADD COLUMN "credit_hours" DECIMAL(5,2);

-- Assessment: add rubric, curve, and publishing fields
ALTER TABLE "assessments" ADD COLUMN "rubric_template_id" UUID;
ALTER TABLE "assessments" ADD COLUMN "curve_applied" "CurveMethod" NOT NULL DEFAULT 'none';
ALTER TABLE "assessments" ADD COLUMN "curve_params_json" JSONB;
ALTER TABLE "assessments" ADD COLUMN "grades_published_at" TIMESTAMPTZ;
ALTER TABLE "assessments" ADD COLUMN "grades_published_by_user_id" UUID;

-- Grade: add ai_assisted
ALTER TABLE "grades" ADD COLUMN "ai_assisted" BOOLEAN NOT NULL DEFAULT false;

-- ─── New Tables ───────────────────────────────────────────────────────────

CREATE TABLE "rubric_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "subject_id" UUID,
    "criteria_json" JSONB NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "rubric_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "rubric_grades" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "grade_id" UUID NOT NULL,
    "rubric_template_id" UUID NOT NULL,
    "criterion_id" VARCHAR(50) NOT NULL,
    "level_index" SMALLINT NOT NULL,
    "points_awarded" DECIMAL(10,2) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "rubric_grades_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "curriculum_standards" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "year_group_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "curriculum_standards_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_standard_mappings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "standard_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "assessment_standard_mappings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "competency_scales" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "levels_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "competency_scales_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_competency_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "standard_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "competency_level" VARCHAR(50) NOT NULL,
    "score_average" DECIMAL(10,4) NOT NULL,
    "computed_from_count" SMALLINT NOT NULL,
    "last_updated" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "student_competency_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "gpa_snapshots" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "gpa_value" DECIMAL(4,3) NOT NULL,
    "credit_hours_total" DECIMAL(10,2) NOT NULL,
    "snapshot_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "gpa_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "grade_curve_audit" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "applied_by_user_id" UUID NOT NULL,
    "applied_at" TIMESTAMPTZ NOT NULL,
    "method" "CurveMethod" NOT NULL,
    "params_json" JSONB,
    "before_scores" JSONB NOT NULL,
    "after_scores" JSONB NOT NULL,
    "can_undo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "grade_curve_audit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "assessment_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "subject_id" UUID,
    "category_id" UUID NOT NULL,
    "max_score" DECIMAL(10,2) NOT NULL,
    "rubric_template_id" UUID,
    "standard_ids_json" JSONB,
    "counts_toward_report_card" BOOLEAN NOT NULL DEFAULT true,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "assessment_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_grading_instructions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "instruction_text" TEXT NOT NULL,
    "status" "AiGradingInstructionStatus" NOT NULL DEFAULT 'draft',
    "submitted_by_user_id" UUID NOT NULL,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "ai_grading_instructions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ai_grading_references" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "assessment_id" UUID NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_type" VARCHAR(50) NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "status" "AiGradingInstructionStatus" NOT NULL DEFAULT 'active',
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "ai_grading_references_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "student_academic_risk_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "risk_level" "AcademicRiskLevel" NOT NULL,
    "alert_type" "AcademicAlertType" NOT NULL,
    "subject_id" UUID,
    "trigger_reason" TEXT NOT NULL,
    "details_json" JSONB NOT NULL,
    "detected_date" DATE NOT NULL,
    "status" "AcademicAlertStatus" NOT NULL DEFAULT 'active',
    "acknowledged_by_user_id" UUID,
    "resolved_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "student_academic_risk_alerts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "progress_reports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "student_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "generated_by_user_id" UUID NOT NULL,
    "status" "ProgressReportStatus" NOT NULL DEFAULT 'draft',
    "sent_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "progress_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "progress_report_entries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "progress_report_id" UUID NOT NULL,
    "subject_id" UUID NOT NULL,
    "current_average" DECIMAL(10,4) NOT NULL,
    "trend" "TrendDirection" NOT NULL,
    "teacher_note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "progress_report_entries_pkey" PRIMARY KEY ("id")
);

-- ─── Foreign Keys ─────────────────────────────────────────────────────────

-- Assessment FK to rubric_template and grades_published_by
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_rubric_template_id_fkey"
    FOREIGN KEY ("rubric_template_id") REFERENCES "rubric_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessments" ADD CONSTRAINT "assessments_grades_published_by_user_id_fkey"
    FOREIGN KEY ("grades_published_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- rubric_templates
ALTER TABLE "rubric_templates" ADD CONSTRAINT "rubric_templates_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rubric_templates" ADD CONSTRAINT "rubric_templates_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rubric_templates" ADD CONSTRAINT "rubric_templates_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- rubric_grades
ALTER TABLE "rubric_grades" ADD CONSTRAINT "rubric_grades_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rubric_grades" ADD CONSTRAINT "rubric_grades_grade_id_fkey"
    FOREIGN KEY ("grade_id") REFERENCES "grades"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rubric_grades" ADD CONSTRAINT "rubric_grades_rubric_template_id_fkey"
    FOREIGN KEY ("rubric_template_id") REFERENCES "rubric_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- curriculum_standards
ALTER TABLE "curriculum_standards" ADD CONSTRAINT "curriculum_standards_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curriculum_standards" ADD CONSTRAINT "curriculum_standards_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "curriculum_standards" ADD CONSTRAINT "curriculum_standards_year_group_id_fkey"
    FOREIGN KEY ("year_group_id") REFERENCES "year_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- assessment_standard_mappings
ALTER TABLE "assessment_standard_mappings" ADD CONSTRAINT "assessment_standard_mappings_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_standard_mappings" ADD CONSTRAINT "assessment_standard_mappings_assessment_id_fkey"
    FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_standard_mappings" ADD CONSTRAINT "assessment_standard_mappings_standard_id_fkey"
    FOREIGN KEY ("standard_id") REFERENCES "curriculum_standards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- competency_scales
ALTER TABLE "competency_scales" ADD CONSTRAINT "competency_scales_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- student_competency_snapshots
ALTER TABLE "student_competency_snapshots" ADD CONSTRAINT "student_competency_snapshots_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_competency_snapshots" ADD CONSTRAINT "student_competency_snapshots_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_competency_snapshots" ADD CONSTRAINT "student_competency_snapshots_standard_id_fkey"
    FOREIGN KEY ("standard_id") REFERENCES "curriculum_standards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_competency_snapshots" ADD CONSTRAINT "student_competency_snapshots_academic_period_id_fkey"
    FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- gpa_snapshots
ALTER TABLE "gpa_snapshots" ADD CONSTRAINT "gpa_snapshots_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gpa_snapshots" ADD CONSTRAINT "gpa_snapshots_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gpa_snapshots" ADD CONSTRAINT "gpa_snapshots_academic_period_id_fkey"
    FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- grade_curve_audit
ALTER TABLE "grade_curve_audit" ADD CONSTRAINT "grade_curve_audit_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_curve_audit" ADD CONSTRAINT "grade_curve_audit_assessment_id_fkey"
    FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "grade_curve_audit" ADD CONSTRAINT "grade_curve_audit_applied_by_user_id_fkey"
    FOREIGN KEY ("applied_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- assessment_templates
ALTER TABLE "assessment_templates" ADD CONSTRAINT "assessment_templates_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_templates" ADD CONSTRAINT "assessment_templates_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_templates" ADD CONSTRAINT "assessment_templates_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "assessment_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "assessment_templates" ADD CONSTRAINT "assessment_templates_rubric_template_id_fkey"
    FOREIGN KEY ("rubric_template_id") REFERENCES "rubric_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "assessment_templates" ADD CONSTRAINT "assessment_templates_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ai_grading_instructions
ALTER TABLE "ai_grading_instructions" ADD CONSTRAINT "ai_grading_instructions_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_grading_instructions" ADD CONSTRAINT "ai_grading_instructions_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_grading_instructions" ADD CONSTRAINT "ai_grading_instructions_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_grading_instructions" ADD CONSTRAINT "ai_grading_instructions_submitted_by_user_id_fkey"
    FOREIGN KEY ("submitted_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_grading_instructions" ADD CONSTRAINT "ai_grading_instructions_reviewed_by_user_id_fkey"
    FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ai_grading_references
ALTER TABLE "ai_grading_references" ADD CONSTRAINT "ai_grading_references_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_grading_references" ADD CONSTRAINT "ai_grading_references_assessment_id_fkey"
    FOREIGN KEY ("assessment_id") REFERENCES "assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_grading_references" ADD CONSTRAINT "ai_grading_references_uploaded_by_user_id_fkey"
    FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ai_grading_references" ADD CONSTRAINT "ai_grading_references_reviewed_by_user_id_fkey"
    FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- student_academic_risk_alerts
ALTER TABLE "student_academic_risk_alerts" ADD CONSTRAINT "student_academic_risk_alerts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_academic_risk_alerts" ADD CONSTRAINT "student_academic_risk_alerts_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "student_academic_risk_alerts" ADD CONSTRAINT "student_academic_risk_alerts_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "student_academic_risk_alerts" ADD CONSTRAINT "student_academic_risk_alerts_acknowledged_by_user_id_fkey"
    FOREIGN KEY ("acknowledged_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- progress_reports
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_academic_period_id_fkey"
    FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "progress_reports" ADD CONSTRAINT "progress_reports_generated_by_user_id_fkey"
    FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- progress_report_entries
ALTER TABLE "progress_report_entries" ADD CONSTRAINT "progress_report_entries_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "progress_report_entries" ADD CONSTRAINT "progress_report_entries_progress_report_id_fkey"
    FOREIGN KEY ("progress_report_id") REFERENCES "progress_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "progress_report_entries" ADD CONSTRAINT "progress_report_entries_subject_id_fkey"
    FOREIGN KEY ("subject_id") REFERENCES "subjects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Unique Constraints ───────────────────────────────────────────────────

CREATE UNIQUE INDEX "idx_rubric_templates_tenant_name" ON "rubric_templates"("tenant_id", "name");
CREATE UNIQUE INDEX "idx_rubric_grades_unique" ON "rubric_grades"("tenant_id", "grade_id", "criterion_id");
CREATE UNIQUE INDEX "idx_curriculum_standards_unique" ON "curriculum_standards"("tenant_id", "subject_id", "code");
CREATE UNIQUE INDEX "idx_assessment_standard_mapping_unique" ON "assessment_standard_mappings"("tenant_id", "assessment_id", "standard_id");
CREATE UNIQUE INDEX "idx_competency_scales_tenant_name" ON "competency_scales"("tenant_id", "name");
CREATE UNIQUE INDEX "idx_competency_snapshots_unique" ON "student_competency_snapshots"("tenant_id", "student_id", "standard_id", "academic_period_id");
CREATE UNIQUE INDEX "idx_gpa_snapshots_unique" ON "gpa_snapshots"("tenant_id", "student_id", "academic_period_id");
CREATE UNIQUE INDEX "idx_ai_grading_instructions_unique" ON "ai_grading_instructions"("tenant_id", "class_id", "subject_id");

-- ─── Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX "idx_rubric_templates_tenant" ON "rubric_templates"("tenant_id");
CREATE INDEX "idx_rubric_grades_tenant_grade" ON "rubric_grades"("tenant_id", "grade_id");
CREATE INDEX "idx_curriculum_standards_tenant_subject" ON "curriculum_standards"("tenant_id", "subject_id");
CREATE INDEX "idx_asm_tenant_assessment" ON "assessment_standard_mappings"("tenant_id", "assessment_id");
CREATE INDEX "idx_competency_scales_tenant" ON "competency_scales"("tenant_id");
CREATE INDEX "idx_competency_snapshots_student" ON "student_competency_snapshots"("tenant_id", "student_id");
CREATE INDEX "idx_gpa_snapshots_student" ON "gpa_snapshots"("tenant_id", "student_id");
CREATE INDEX "idx_grade_curve_audit_tenant_assessment" ON "grade_curve_audit"("tenant_id", "assessment_id");
CREATE INDEX "idx_assessment_templates_tenant" ON "assessment_templates"("tenant_id");
CREATE INDEX "idx_ai_grading_instructions_tenant" ON "ai_grading_instructions"("tenant_id");
CREATE INDEX "idx_ai_grading_references_tenant_assessment" ON "ai_grading_references"("tenant_id", "assessment_id");
CREATE INDEX "idx_academic_risk_alerts_tenant_status" ON "student_academic_risk_alerts"("tenant_id", "status");
CREATE INDEX "idx_academic_risk_alerts_tenant_student" ON "student_academic_risk_alerts"("tenant_id", "student_id");
CREATE INDEX "idx_progress_reports_tenant_period" ON "progress_reports"("tenant_id", "academic_period_id");
CREATE INDEX "idx_progress_reports_tenant_student" ON "progress_reports"("tenant_id", "student_id");
CREATE INDEX "idx_progress_report_entries_report" ON "progress_report_entries"("tenant_id", "progress_report_id");

-- ─── RLS Policies ─────────────────────────────────────────────────────────

ALTER TABLE "rubric_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_rubric_templates ON "rubric_templates"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "rubric_grades" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_rubric_grades ON "rubric_grades"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "curriculum_standards" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_curriculum_standards ON "curriculum_standards"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "assessment_standard_mappings" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_assessment_standard_mappings ON "assessment_standard_mappings"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "competency_scales" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_competency_scales ON "competency_scales"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "student_competency_snapshots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_student_competency_snapshots ON "student_competency_snapshots"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "gpa_snapshots" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_gpa_snapshots ON "gpa_snapshots"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "grade_curve_audit" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_grade_curve_audit ON "grade_curve_audit"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "assessment_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_assessment_templates ON "assessment_templates"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "ai_grading_instructions" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_ai_grading_instructions ON "ai_grading_instructions"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "ai_grading_references" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_ai_grading_references ON "ai_grading_references"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "student_academic_risk_alerts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_student_academic_risk_alerts ON "student_academic_risk_alerts"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "progress_reports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_progress_reports ON "progress_reports"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "progress_report_entries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_progress_report_entries ON "progress_report_entries"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
