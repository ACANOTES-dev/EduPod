-- Reports tenant settings (impl 21)
--
-- One row per tenant. Stores the defaults that govern the Reports module
-- behaviour for that tenant: which export format the export menu opens to,
-- the timezone the scheduled-reports worker reports in, and the default
-- visibility a freshly-saved custom report receives.
--
-- A row is created lazily on first read (`GET /v1/reports/settings`) by
-- `ReportsSettingsService.getSettings()`; absence of a row means the tenant
-- has never opened the Reports Settings page and uses the model defaults.
--
-- AI feature toggles live in `tenant_ai_flags` (one row per AI module key,
-- seeded `enabled = false` by impl 01). KPI visibility lives in
-- `reports_kpi_tenant_preferences` (one row per tenant, also from impl 01).
-- This table is the third leg of the settings tripod and only carries the
-- non-AI / non-KPI defaults.
--
-- RLS: tenant-isolated. The `tenant_id` column is `UNIQUE` so a tenant can
-- have at most one settings row.

-- CreateTable
CREATE TABLE "reports_tenant_settings" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "default_export_format" TEXT NOT NULL DEFAULT 'pdf',
    "default_schedule_timezone" TEXT NOT NULL DEFAULT 'Europe/Dublin',
    "default_share_visibility" "SavedReportVisibility" NOT NULL DEFAULT 'private',
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" UUID,

    CONSTRAINT "reports_tenant_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reports_tenant_settings_tenant_id_key" ON "reports_tenant_settings"("tenant_id");

-- AddForeignKey
ALTER TABLE "reports_tenant_settings" ADD CONSTRAINT "reports_tenant_settings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enable RLS and create policy
ALTER TABLE "reports_tenant_settings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reports_tenant_settings" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reports_tenant_settings_tenant_isolation" ON "reports_tenant_settings";
CREATE POLICY "reports_tenant_settings_tenant_isolation" ON "reports_tenant_settings"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
