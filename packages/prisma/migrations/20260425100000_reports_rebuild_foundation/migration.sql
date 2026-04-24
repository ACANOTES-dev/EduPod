-- Reports Rebuild — Implementation 01: Schema Foundation
--
-- Lands every DB, permission, and seed change the Reports rebuild needs in a
-- single coordinated migration so Wave 2+ can code against stable types.
-- Zero business logic.
--
-- Introduces:
--   1. Enums: SavedReportVisibility, ScheduledReportRunStatus,
--             ReportAlertRunOutcome, ReportShareFormat.
--   2. saved_reports extensions: description, visibility, is_favorite,
--      last_executed_at, last_executed_by + tenant+visibility index.
--   3. saved_report_drafts            (in-progress builder state)
--   4. scheduled_report_runs          (cron-run log)
--   5. report_alert_runs              (evaluation log)
--   6. report_share_log               (share audit)
--   7. reports_kpi_tenant_preferences (KPI visibility toggles)
--   8. Permissions: reports.builder, reports.share, reports.settings,
--      reports.ai.narration, reports.ai.ask_ai, reports.ai.predictions.
--   9. Idempotent backfills for every existing tenant:
--        - three new tenant_ai_flags rows (reports_narration, reports_ask_ai,
--          reports_predictions), all enabled=false.
--        - role_permissions grants for the six new reports.* permissions.
--
-- RLS policies for the five new tenant-scoped tables live in
-- post_migrate.sql alongside this migration.
--
-- See reports-rebuild/implementations/01-schema-foundation.md for rationale.

-- ─── Enums ──────────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE "SavedReportVisibility" AS ENUM ('private', 'shared'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ScheduledReportRunStatus" AS ENUM ('pending', 'running', 'succeeded', 'failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReportAlertRunOutcome" AS ENUM ('ok', 'threshold_crossed', 'error'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ReportShareFormat" AS ENUM ('pdf', 'excel', 'word', 'all'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── saved_reports — new columns + tenant+visibility index ─────────────────

ALTER TABLE "saved_reports"
    ADD COLUMN "description"      TEXT,
    ADD COLUMN "visibility"       "SavedReportVisibility" NOT NULL DEFAULT 'private',
    ADD COLUMN "is_favorite"      BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "last_executed_at" TIMESTAMPTZ,
    ADD COLUMN "last_executed_by" UUID;

ALTER TABLE "saved_reports"
    ADD CONSTRAINT "saved_reports_last_executed_by_fkey"
    FOREIGN KEY ("last_executed_by")
    REFERENCES "users"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;

CREATE INDEX "idx_saved_reports_tenant_visibility"
    ON "saved_reports"("tenant_id", "visibility");

-- ─── saved_report_drafts ───────────────────────────────────────────────────

CREATE TABLE "saved_report_drafts" (
    "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"         UUID NOT NULL,
    "user_id"           UUID NOT NULL,
    "subject_key"       VARCHAR(64) NOT NULL,
    "columns_json"      JSONB NOT NULL,
    "filters_json"      JSONB NOT NULL DEFAULT '{}',
    "group_by_json"     JSONB,
    "chart_type"        VARCHAR(32),
    "chart_config_json" JSONB,
    "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "saved_report_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_saved_report_drafts_tenant_user"
    ON "saved_report_drafts"("tenant_id", "user_id");

ALTER TABLE "saved_report_drafts"
    ADD CONSTRAINT "saved_report_drafts_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "saved_report_drafts"
    ADD CONSTRAINT "saved_report_drafts_user_id_fkey"
    FOREIGN KEY ("user_id")
    REFERENCES "users"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ─── scheduled_report_runs ─────────────────────────────────────────────────

CREATE TABLE "scheduled_report_runs" (
    "id"                  UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"           UUID NOT NULL,
    "scheduled_report_id" UUID NOT NULL,
    "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
    "finished_at"         TIMESTAMPTZ,
    "status"              "ScheduledReportRunStatus" NOT NULL,
    "row_count"           INTEGER,
    "error_message"       TEXT,
    "artifact_object_key" VARCHAR(512),
    "delivered_via"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "scheduled_report_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_scheduled_report_runs_recent"
    ON "scheduled_report_runs"("tenant_id", "scheduled_report_id", "started_at" DESC);

CREATE INDEX "idx_scheduled_report_runs_status"
    ON "scheduled_report_runs"("tenant_id", "status");

ALTER TABLE "scheduled_report_runs"
    ADD CONSTRAINT "scheduled_report_runs_scheduled_report_id_fkey"
    FOREIGN KEY ("scheduled_report_id")
    REFERENCES "scheduled_reports"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ─── report_alert_runs ─────────────────────────────────────────────────────

CREATE TABLE "report_alert_runs" (
    "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"         UUID NOT NULL,
    "report_alert_id"   UUID NOT NULL,
    "evaluated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    "outcome"           "ReportAlertRunOutcome" NOT NULL,
    "measured_value"    DECIMAL(12, 2),
    "threshold_value"   DECIMAL(12, 2),
    "notified_user_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "error_message"     TEXT,

    CONSTRAINT "report_alert_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_report_alert_runs_recent"
    ON "report_alert_runs"("tenant_id", "report_alert_id", "evaluated_at" DESC);

ALTER TABLE "report_alert_runs"
    ADD CONSTRAINT "report_alert_runs_report_alert_id_fkey"
    FOREIGN KEY ("report_alert_id")
    REFERENCES "report_alerts"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ─── report_share_log ──────────────────────────────────────────────────────

CREATE TABLE "report_share_log" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"       UUID NOT NULL,
    "saved_report_id" UUID NOT NULL,
    "shared_by"       UUID NOT NULL,
    "shared_at"       TIMESTAMPTZ NOT NULL DEFAULT now(),
    "format"          "ReportShareFormat" NOT NULL,
    "conversation_id" UUID,
    "recipients_json" JSONB NOT NULL,
    "message_body"    TEXT,

    CONSTRAINT "report_share_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_report_share_log_tenant_recent"
    ON "report_share_log"("tenant_id", "shared_at" DESC);

CREATE INDEX "idx_report_share_log_report"
    ON "report_share_log"("tenant_id", "saved_report_id", "shared_at" DESC);

ALTER TABLE "report_share_log"
    ADD CONSTRAINT "report_share_log_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "report_share_log"
    ADD CONSTRAINT "report_share_log_saved_report_id_fkey"
    FOREIGN KEY ("saved_report_id")
    REFERENCES "saved_reports"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "report_share_log"
    ADD CONSTRAINT "report_share_log_shared_by_fkey"
    FOREIGN KEY ("shared_by")
    REFERENCES "users"("id")
    ON DELETE NO ACTION
    ON UPDATE CASCADE;

-- ─── reports_kpi_tenant_preferences ────────────────────────────────────────

CREATE TABLE "reports_kpi_tenant_preferences" (
    "id"              UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"       UUID NOT NULL,
    "hidden_kpi_keys" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "updated_at"      TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_by"      UUID,

    CONSTRAINT "reports_kpi_tenant_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reports_kpi_tenant_preferences_tenant_id_key"
    ON "reports_kpi_tenant_preferences"("tenant_id");

ALTER TABLE "reports_kpi_tenant_preferences"
    ADD CONSTRAINT "reports_kpi_tenant_preferences_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ─── New reports.* permissions ─────────────────────────────────────────────
--
-- reports.view is intentionally NOT created here — the existing
-- analytics.view permission still guards the dashboard endpoints until a
-- later rebuild wave renames the namespace.

INSERT INTO "permissions" ("id", "permission_key", "description", "permission_tier")
VALUES
    (gen_random_uuid(), 'reports.builder',        'View and use the custom report builder', 'admin'),
    (gen_random_uuid(), 'reports.share',          'Share saved reports into the inbox',     'admin'),
    (gen_random_uuid(), 'reports.settings',       'Change tenant reports settings (AI flags, KPI visibility)', 'admin'),
    (gen_random_uuid(), 'reports.ai.narration',   'See and regenerate AI-written report narrations', 'admin'),
    (gen_random_uuid(), 'reports.ai.ask_ai',      'Use the Ask-AI natural-language report builder',  'admin'),
    (gen_random_uuid(), 'reports.ai.predictions', 'See AI-generated predictive analytics panels',    'admin')
ON CONFLICT ("permission_key") DO NOTHING;

-- ─── Backfill tenant_ai_flags for every existing tenant ────────────────────

INSERT INTO "tenant_ai_flags" ("id", "tenant_id", "module_key", "enabled", "updated_at")
SELECT gen_random_uuid(), t.id, m.module_key, false, now()
FROM "tenants" t
CROSS JOIN (
    VALUES ('reports_narration'), ('reports_ask_ai'), ('reports_predictions')
) AS m(module_key)
ON CONFLICT ("tenant_id", "module_key") DO NOTHING;

-- ─── Backfill role_permissions for existing tenants' system roles ──────────
--
-- Grants mirror the defaults documented in
-- reports-rebuild/PLAN.md §10.3:
--   Owner / Principal / Vice Principal / school-admin → all six.
--   Accounting → reports.builder + reports.share.
--   Front Office → reports.builder.
--   Teacher → unchanged (already has analytics.view from earlier seeds).
--
-- The tenant_id NOT NULL + is_system_role guards match the wellbeing
-- foundation pattern. NEW tenants created after this migration will pick
-- up the same grants via the seedReportsDefaultsForTenant call wired
-- into tenants.service.ts.

-- All six → school_owner + school_principal + school_vice_principal + school_admin
INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id")
SELECT r.id, p.id, r.tenant_id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system_role = true
  AND r.tenant_id IS NOT NULL
  AND r.role_key IN ('school_owner', 'school_principal', 'school_vice_principal', 'school_admin', 'admin')
  AND p.permission_key IN (
      'reports.builder', 'reports.share', 'reports.settings',
      'reports.ai.narration', 'reports.ai.ask_ai', 'reports.ai.predictions'
  )
  AND NOT EXISTS (
      SELECT 1 FROM "role_permissions" rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- reports.builder + reports.share → accounting
INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id")
SELECT r.id, p.id, r.tenant_id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system_role = true
  AND r.tenant_id IS NOT NULL
  AND r.role_key = 'accounting'
  AND p.permission_key IN ('reports.builder', 'reports.share')
  AND NOT EXISTS (
      SELECT 1 FROM "role_permissions" rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- reports.builder → front_office
INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id")
SELECT r.id, p.id, r.tenant_id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system_role = true
  AND r.tenant_id IS NOT NULL
  AND r.role_key = 'front_office'
  AND p.permission_key = 'reports.builder'
  AND NOT EXISTS (
      SELECT 1 FROM "role_permissions" rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );
