-- ─── New Tables ─────────────────────────────────────────────────────────────

CREATE TABLE "saved_reports" (
    "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"          UUID NOT NULL,
    "name"               VARCHAR(255) NOT NULL,
    "data_source"        VARCHAR(50) NOT NULL,
    "dimensions_json"    JSONB NOT NULL,
    "measures_json"      JSONB NOT NULL,
    "filters_json"       JSONB NOT NULL,
    "chart_type"         VARCHAR(50),
    "is_shared"          BOOLEAN NOT NULL DEFAULT false,
    "created_by_user_id" UUID NOT NULL,
    "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "saved_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "board_reports" (
    "id"                   UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"            UUID NOT NULL,
    "title"                VARCHAR(255) NOT NULL,
    "academic_period_id"   UUID,
    "report_type"          VARCHAR(50) NOT NULL,
    "sections_json"        JSONB NOT NULL,
    "generated_at"         TIMESTAMPTZ NOT NULL,
    "generated_by_user_id" UUID NOT NULL,
    "file_url"             TEXT,
    "created_at"           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "board_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "compliance_report_templates" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"    UUID NOT NULL,
    "name"         VARCHAR(255) NOT NULL,
    "country_code" VARCHAR(2) NOT NULL,
    "fields_json"  JSONB NOT NULL,
    "created_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "compliance_report_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "scheduled_reports" (
    "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"           UUID NOT NULL,
    "name"                VARCHAR(255) NOT NULL,
    "report_type"         VARCHAR(100) NOT NULL,
    "parameters_json"     JSONB NOT NULL,
    "schedule_cron"       VARCHAR(100) NOT NULL,
    "recipient_emails"    JSONB NOT NULL,
    "format"              VARCHAR(10) NOT NULL,
    "active"              BOOLEAN NOT NULL DEFAULT true,
    "last_sent_at"        TIMESTAMPTZ,
    "created_by_user_id"  UUID NOT NULL,
    "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_alerts" (
    "id"                           UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"                    UUID NOT NULL,
    "name"                         VARCHAR(255) NOT NULL,
    "metric"                       VARCHAR(100) NOT NULL,
    "operator"                     VARCHAR(10) NOT NULL,
    "threshold"                    NUMERIC(12, 2) NOT NULL,
    "check_frequency"              VARCHAR(20) NOT NULL,
    "notification_recipients_json" JSONB NOT NULL,
    "active"                       BOOLEAN NOT NULL DEFAULT true,
    "last_triggered_at"            TIMESTAMPTZ,
    "created_by_user_id"           UUID NOT NULL,
    "created_at"                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at"                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "report_alerts_pkey" PRIMARY KEY ("id")
);

-- ─── Foreign Keys ──────────────────────────────────────────────────────────

-- saved_reports
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_reports" ADD CONSTRAINT "saved_reports_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- board_reports
ALTER TABLE "board_reports" ADD CONSTRAINT "board_reports_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "board_reports" ADD CONSTRAINT "board_reports_generated_by_user_id_fkey"
    FOREIGN KEY ("generated_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "board_reports" ADD CONSTRAINT "board_reports_academic_period_id_fkey"
    FOREIGN KEY ("academic_period_id") REFERENCES "academic_periods"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- compliance_report_templates
ALTER TABLE "compliance_report_templates" ADD CONSTRAINT "compliance_report_templates_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- scheduled_reports
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- report_alerts
ALTER TABLE "report_alerts" ADD CONSTRAINT "report_alerts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "report_alerts" ADD CONSTRAINT "report_alerts_created_by_user_id_fkey"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Unique Constraints ────────────────────────────────────────────────────

CREATE UNIQUE INDEX "idx_saved_reports_tenant_name" ON "saved_reports"("tenant_id", "name");

-- ─── Indexes ───────────────────────────────────────────────────────────────

CREATE INDEX "idx_saved_reports_tenant" ON "saved_reports"("tenant_id");
CREATE INDEX "idx_board_reports_tenant" ON "board_reports"("tenant_id");
CREATE INDEX "idx_compliance_report_templates_tenant" ON "compliance_report_templates"("tenant_id");
CREATE INDEX "idx_scheduled_reports_tenant_active" ON "scheduled_reports"("tenant_id", "active");
CREATE INDEX "idx_report_alerts_tenant_active" ON "report_alerts"("tenant_id", "active");

-- ─── RLS Policies ─────────────────────────────────────────────────────────

ALTER TABLE "saved_reports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_saved_reports ON "saved_reports"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "board_reports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_board_reports ON "board_reports"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "compliance_report_templates" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_compliance_report_templates ON "compliance_report_templates"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "scheduled_reports" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_scheduled_reports ON "scheduled_reports"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

ALTER TABLE "report_alerts" ENABLE ROW LEVEL SECURITY;
CREATE POLICY rls_report_alerts ON "report_alerts"
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));
