-- ─── New Enums ─────────────────────────────────────────────────────────────

CREATE TYPE "ApprovalStepStatus" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "DeliveryChannel" AS ENUM ('email', 'whatsapp', 'in_app');
CREATE TYPE "DeliveryStatus" AS ENUM ('pending_delivery', 'sent', 'failed', 'viewed');
CREATE TYPE "BatchJobStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- ─── New Tables ───────────────────────────────────────────────────────────

CREATE TABLE "report_card_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "locale" VARCHAR(10) NOT NULL,
    "sections_json" JSONB NOT NULL,
    "branding_overrides_json" JSONB,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "report_card_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_card_approval_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "steps_json" JSONB NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "report_card_approval_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_card_approvals" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "report_card_id" UUID NOT NULL,
    "step_order" SMALLINT NOT NULL,
    "role_key" VARCHAR(50) NOT NULL,
    "status" "ApprovalStepStatus" NOT NULL DEFAULT 'pending',
    "actioned_by_user_id" UUID,
    "actioned_at" TIMESTAMPTZ,
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "report_card_approvals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_card_deliveries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "report_card_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending_delivery',
    "sent_at" TIMESTAMPTZ,
    "viewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "report_card_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_card_batch_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "class_id" UUID NOT NULL,
    "academic_period_id" UUID NOT NULL,
    "template_id" UUID,
    "status" "BatchJobStatus" NOT NULL DEFAULT 'queued',
    "total_count" SMALLINT NOT NULL,
    "completed_count" SMALLINT NOT NULL DEFAULT 0,
    "file_url" TEXT,
    "requested_by_user_id" UUID NOT NULL,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "report_card_batch_jobs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_card_custom_field_defs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "label" VARCHAR(200) NOT NULL,
    "label_ar" VARCHAR(200),
    "field_type" VARCHAR(20) NOT NULL,
    "options_json" JSONB,
    "section_type" VARCHAR(50) NOT NULL,
    "display_order" SMALLINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "report_card_custom_field_defs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_card_custom_field_values" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "report_card_id" UUID NOT NULL,
    "field_def_id" UUID NOT NULL,
    "value" TEXT NOT NULL,
    "entered_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "report_card_custom_field_values_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "grade_threshold_configs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "thresholds_json" JSONB NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "grade_threshold_configs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_card_acknowledgments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "report_card_id" UUID NOT NULL,
    "parent_id" UUID NOT NULL,
    "acknowledged_at" TIMESTAMPTZ NOT NULL,
    "ip_address" VARCHAR(45),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "report_card_acknowledgments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_card_verification_tokens" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "report_card_id" UUID NOT NULL,
    "token" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "report_card_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- ─── Foreign Keys ─────────────────────────────────────────────────────────

-- report_card_templates
ALTER TABLE "report_card_templates" ADD CONSTRAINT "report_card_templates_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_templates" ADD CONSTRAINT "report_card_templates_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- report_card_approval_configs
ALTER TABLE "report_card_approval_configs" ADD CONSTRAINT "report_card_approval_configs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- report_card_approvals
ALTER TABLE "report_card_approvals" ADD CONSTRAINT "report_card_approvals_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_approvals" ADD CONSTRAINT "report_card_approvals_report_card_id_fkey"
    FOREIGN KEY ("report_card_id") REFERENCES "report_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_approvals" ADD CONSTRAINT "report_card_approvals_actioned_by_user_id_fkey"
    FOREIGN KEY ("actioned_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- report_card_deliveries
ALTER TABLE "report_card_deliveries" ADD CONSTRAINT "report_card_deliveries_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_deliveries" ADD CONSTRAINT "report_card_deliveries_report_card_id_fkey"
    FOREIGN KEY ("report_card_id") REFERENCES "report_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_deliveries" ADD CONSTRAINT "report_card_deliveries_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- report_card_batch_jobs
ALTER TABLE "report_card_batch_jobs" ADD CONSTRAINT "report_card_batch_jobs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_batch_jobs" ADD CONSTRAINT "report_card_batch_jobs_class_id_fkey"
    FOREIGN KEY ("class_id") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_batch_jobs" ADD CONSTRAINT "report_card_batch_jobs_academic_period_id_fkey"
    FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_batch_jobs" ADD CONSTRAINT "report_card_batch_jobs_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "report_card_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_card_batch_jobs" ADD CONSTRAINT "report_card_batch_jobs_requested_by_user_id_fkey"
    FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- report_card_custom_field_defs
ALTER TABLE "report_card_custom_field_defs" ADD CONSTRAINT "report_card_custom_field_defs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- report_card_custom_field_values
ALTER TABLE "report_card_custom_field_values" ADD CONSTRAINT "report_card_custom_field_values_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_custom_field_values" ADD CONSTRAINT "report_card_custom_field_values_report_card_id_fkey"
    FOREIGN KEY ("report_card_id") REFERENCES "report_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_custom_field_values" ADD CONSTRAINT "report_card_custom_field_values_field_def_id_fkey"
    FOREIGN KEY ("field_def_id") REFERENCES "report_card_custom_field_defs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_custom_field_values" ADD CONSTRAINT "report_card_custom_field_values_entered_by_user_id_fkey"
    FOREIGN KEY ("entered_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- grade_threshold_configs
ALTER TABLE "grade_threshold_configs" ADD CONSTRAINT "grade_threshold_configs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- report_card_acknowledgments
ALTER TABLE "report_card_acknowledgments" ADD CONSTRAINT "report_card_acknowledgments_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_acknowledgments" ADD CONSTRAINT "report_card_acknowledgments_report_card_id_fkey"
    FOREIGN KEY ("report_card_id") REFERENCES "report_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_acknowledgments" ADD CONSTRAINT "report_card_acknowledgments_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "parents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- report_card_verification_tokens
ALTER TABLE "report_card_verification_tokens" ADD CONSTRAINT "report_card_verification_tokens_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_card_verification_tokens" ADD CONSTRAINT "report_card_verification_tokens_report_card_id_fkey"
    FOREIGN KEY ("report_card_id") REFERENCES "report_cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─── Unique Constraints ───────────────────────────────────────────────────

CREATE UNIQUE INDEX "idx_report_card_templates_unique" ON "report_card_templates"("tenant_id", "name", "locale");
CREATE UNIQUE INDEX "idx_report_card_approval_configs_unique" ON "report_card_approval_configs"("tenant_id", "name");
CREATE UNIQUE INDEX "idx_report_card_approvals_unique" ON "report_card_approvals"("tenant_id", "report_card_id", "step_order");
CREATE UNIQUE INDEX "idx_report_card_custom_field_defs_unique" ON "report_card_custom_field_defs"("tenant_id", "name");
CREATE UNIQUE INDEX "idx_report_card_custom_field_values_unique" ON "report_card_custom_field_values"("tenant_id", "report_card_id", "field_def_id");
CREATE UNIQUE INDEX "idx_grade_threshold_configs_unique" ON "grade_threshold_configs"("tenant_id", "name");
CREATE UNIQUE INDEX "idx_report_card_acknowledgments_unique" ON "report_card_acknowledgments"("tenant_id", "report_card_id", "parent_id");
CREATE UNIQUE INDEX "idx_report_card_verification_tokens_token" ON "report_card_verification_tokens"("token");

-- ─── Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX "idx_report_card_templates_tenant" ON "report_card_templates"("tenant_id");
CREATE INDEX "idx_report_card_approval_configs_tenant" ON "report_card_approval_configs"("tenant_id");
CREATE INDEX "idx_report_card_approvals_report" ON "report_card_approvals"("tenant_id", "report_card_id");
CREATE INDEX "idx_report_card_deliveries_report" ON "report_card_deliveries"("tenant_id", "report_card_id");
CREATE INDEX "idx_report_card_batch_jobs_status" ON "report_card_batch_jobs"("tenant_id", "status");
CREATE INDEX "idx_report_card_custom_field_defs_tenant" ON "report_card_custom_field_defs"("tenant_id");
CREATE INDEX "idx_report_card_custom_field_values_report" ON "report_card_custom_field_values"("tenant_id", "report_card_id");
CREATE INDEX "idx_grade_threshold_configs_tenant" ON "grade_threshold_configs"("tenant_id");
CREATE INDEX "idx_report_card_verification_tokens_report" ON "report_card_verification_tokens"("tenant_id", "report_card_id");

-- ─── RLS Policies ─────────────────────────────────────────────────────────

ALTER TABLE "report_card_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_report_card_templates ON "report_card_templates"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "report_card_approval_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_report_card_approval_configs ON "report_card_approval_configs"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "report_card_approvals" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_report_card_approvals ON "report_card_approvals"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "report_card_deliveries" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_report_card_deliveries ON "report_card_deliveries"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "report_card_batch_jobs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_report_card_batch_jobs ON "report_card_batch_jobs"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "report_card_custom_field_defs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_report_card_custom_field_defs ON "report_card_custom_field_defs"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "report_card_custom_field_values" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_report_card_custom_field_values ON "report_card_custom_field_values"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "grade_threshold_configs" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_grade_threshold_configs ON "grade_threshold_configs"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "report_card_acknowledgments" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_report_card_acknowledgments ON "report_card_acknowledgments"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "report_card_verification_tokens" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_report_card_verification_tokens ON "report_card_verification_tokens"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
