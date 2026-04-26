-- Budgeting & Analysis ("Modeling") Rebuild — Implementation 01: Schema Foundation
--
-- Lands every DB, permission, and seed change the Modeling rebuild needs in
-- a single coordinated migration so Wave 2+ can code against stable types.
-- Zero business logic.
--
-- Introduces:
--   1. Enums: FinancialModelStatus, FinancialModelLineItemSource,
--             FinancialModelLineItemCategory, EventBudgetType,
--             EventBudgetStatus, EventBudgetPaymentPlan,
--             VarianceCachePeriodType.
--   2. Tables (all tenant-scoped, FORCE ROW LEVEL SECURITY):
--        financial_models
--        scenarios
--        financial_model_line_items
--        financial_model_snapshots
--        event_budgets
--        event_budget_scenarios
--        variance_cache
--        shareable_links
--        budgeting_tenant_preferences
--   3. Permissions:
--        budgeting.view, budgeting.manage, budgeting.publish,
--        budgeting.share, budgeting.generate_fees, budgeting.archive.
--   4. Idempotent backfills for every existing tenant:
--        - role_permissions grants for the six new budgeting.* permissions
--          (defaults documented in modeling/PLAN.md §12.5).
--        - tenant_modules row for module_key='budgeting', is_enabled=true.
--
-- RLS policies for the nine new tenant-scoped tables live in
-- post_migrate.sql alongside this migration and are mirrored in
-- packages/prisma/rls/policies.sql.
--
-- See modeling/implementations/01-schema-foundation.md for the per-column
-- spec and modeling/PLAN.md for the architectural rationale.

-- ─── Enums ──────────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE "FinancialModelStatus" AS ENUM ('draft', 'published', 'archived'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "FinancialModelLineItemSource" AS ENUM ('driver_derived', 'custom', 'override'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "FinancialModelLineItemCategory" AS ENUM ('income', 'staff_costs', 'operations', 'capital', 'reserves_and_adjustments'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EventBudgetType" AS ENUM ('trip', 'fundraiser', 'sports_day', 'performance', 'capital_purchase', 'other'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EventBudgetStatus" AS ENUM ('draft', 'confirmed', 'fees_generated', 'completed', 'cancelled'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "EventBudgetPaymentPlan" AS ENUM ('one_off', 'two_payments', 'three_payments', 'four_payments'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "VarianceCachePeriodType" AS ENUM ('month', 'term', 'year'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── financial_models ──────────────────────────────────────────────────────

CREATE TABLE "financial_models" (
    "id"                   UUID                   NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"            UUID                   NOT NULL,
    "name"                 VARCHAR(255)           NOT NULL,
    "description"          TEXT,
    "fiscal_year_start"    DATE                   NOT NULL,
    "fiscal_year_end"      DATE                   NOT NULL,
    "horizon_years"        SMALLINT               NOT NULL DEFAULT 1,
    "drivers"              JSONB                  NOT NULL,
    "source_snapshot_json" JSONB                  NOT NULL,
    "status"               "FinancialModelStatus" NOT NULL DEFAULT 'draft',
    "current_snapshot_id"  UUID,
    "created_by"           UUID                   NOT NULL,
    "created_at"           TIMESTAMPTZ            NOT NULL DEFAULT now(),
    "updated_at"           TIMESTAMPTZ            NOT NULL DEFAULT now(),
    "archived_at"          TIMESTAMPTZ,

    CONSTRAINT "financial_models_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_financial_models_tenant_fy"
    ON "financial_models"("tenant_id", "fiscal_year_start" DESC);

CREATE INDEX "idx_financial_models_tenant_status"
    ON "financial_models"("tenant_id", "status");

ALTER TABLE "financial_models"
    ADD CONSTRAINT "financial_models_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "financial_models"
    ADD CONSTRAINT "financial_models_created_by_fkey"
    FOREIGN KEY ("created_by")
    REFERENCES "users"("id")
    ON DELETE NO ACTION
    ON UPDATE CASCADE;

-- ─── scenarios ─────────────────────────────────────────────────────────────

CREATE TABLE "scenarios" (
    "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"        UUID         NOT NULL,
    "parent_model_id"  UUID         NOT NULL,
    "name"             VARCHAR(64)  NOT NULL,
    "position"         SMALLINT     NOT NULL DEFAULT 0,
    "driver_overrides" JSONB        NOT NULL,
    "notes"            TEXT,
    "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_scenarios_parent_position"
    ON "scenarios"("parent_model_id", "position");

CREATE INDEX "idx_scenarios_tenant_parent"
    ON "scenarios"("tenant_id", "parent_model_id");

ALTER TABLE "scenarios"
    ADD CONSTRAINT "scenarios_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "scenarios"
    ADD CONSTRAINT "scenarios_parent_model_id_fkey"
    FOREIGN KEY ("parent_model_id")
    REFERENCES "financial_models"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ─── financial_model_line_items ───────────────────────────────────────────

CREATE TABLE "financial_model_line_items" (
    "id"                         UUID                             NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"                  UUID                             NOT NULL,
    "parent_model_id"            UUID                             NOT NULL,
    "scenario_id"                UUID,
    "category"                   "FinancialModelLineItemCategory" NOT NULL,
    "subcategory"                VARCHAR(128)                     NOT NULL,
    "name"                       VARCHAR(255)                     NOT NULL,
    "fiscal_year"                SMALLINT                         NOT NULL,
    "source"                     "FinancialModelLineItemSource"   NOT NULL,
    "amount"                     DECIMAL(12, 2)                   NOT NULL,
    "is_locked"                  BOOLEAN                          NOT NULL DEFAULT false,
    "notes"                      TEXT,
    "references_event_budget_id" UUID,
    "created_at"                 TIMESTAMPTZ                      NOT NULL DEFAULT now(),
    "updated_at"                 TIMESTAMPTZ                      NOT NULL DEFAULT now(),

    CONSTRAINT "financial_model_line_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_fmli_tenant_parent_scenario_year"
    ON "financial_model_line_items"("tenant_id", "parent_model_id", "scenario_id", "fiscal_year");

CREATE INDEX "idx_fmli_category"
    ON "financial_model_line_items"("tenant_id", "parent_model_id", "category", "subcategory");

ALTER TABLE "financial_model_line_items"
    ADD CONSTRAINT "financial_model_line_items_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "financial_model_line_items"
    ADD CONSTRAINT "financial_model_line_items_parent_model_id_fkey"
    FOREIGN KEY ("parent_model_id")
    REFERENCES "financial_models"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "financial_model_line_items"
    ADD CONSTRAINT "financial_model_line_items_scenario_id_fkey"
    FOREIGN KEY ("scenario_id")
    REFERENCES "scenarios"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- references_event_budget_id FK is added below after event_budgets is created.

-- ─── financial_model_snapshots ────────────────────────────────────────────

CREATE TABLE "financial_model_snapshots" (
    "id"                UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"         UUID         NOT NULL,
    "parent_model_id"   UUID         NOT NULL,
    "version_number"    SMALLINT     NOT NULL,
    "payload"           JSONB        NOT NULL,
    "executive_summary" TEXT,
    "published_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "published_by"      UUID         NOT NULL,
    "pdf_object_key"    VARCHAR(512),
    "excel_object_key"  VARCHAR(512),
    "rendered_at"       TIMESTAMPTZ,

    CONSTRAINT "financial_model_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_snapshot_parent_version"
    ON "financial_model_snapshots"("parent_model_id", "version_number");

CREATE INDEX "idx_snapshots_tenant_recent"
    ON "financial_model_snapshots"("tenant_id", "published_at" DESC);

ALTER TABLE "financial_model_snapshots"
    ADD CONSTRAINT "financial_model_snapshots_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "financial_model_snapshots"
    ADD CONSTRAINT "financial_model_snapshots_parent_model_id_fkey"
    FOREIGN KEY ("parent_model_id")
    REFERENCES "financial_models"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "financial_model_snapshots"
    ADD CONSTRAINT "financial_model_snapshots_published_by_fkey"
    FOREIGN KEY ("published_by")
    REFERENCES "users"("id")
    ON DELETE NO ACTION
    ON UPDATE CASCADE;

-- ─── event_budgets ────────────────────────────────────────────────────────

CREATE TABLE "event_budgets" (
    "id"                    UUID                     NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"             UUID                     NOT NULL,
    "name"                  VARCHAR(255)             NOT NULL,
    "event_type"            "EventBudgetType"        NOT NULL,
    "event_date"            DATE,
    "event_end_date"        DATE,
    "class_id"              UUID,
    "year_group_id"         UUID,
    "participant_count"     INTEGER                  NOT NULL,
    "drivers"               JSONB                    NOT NULL,
    "status"                "EventBudgetStatus"      NOT NULL DEFAULT 'draft',
    "household_share_pct"   DECIMAL(5, 2)            NOT NULL DEFAULT 100,
    "payment_plan"          "EventBudgetPaymentPlan" NOT NULL DEFAULT 'one_off',
    "fee_generation_run_id" UUID,
    "fee_structure_id"      UUID,
    "notes"                 TEXT,
    "created_by"            UUID                     NOT NULL,
    "created_at"            TIMESTAMPTZ              NOT NULL DEFAULT now(),
    "updated_at"            TIMESTAMPTZ              NOT NULL DEFAULT now(),

    CONSTRAINT "event_budgets_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_event_budgets_tenant_date"
    ON "event_budgets"("tenant_id", "event_date" DESC);

CREATE INDEX "idx_event_budgets_tenant_status"
    ON "event_budgets"("tenant_id", "status");

ALTER TABLE "event_budgets"
    ADD CONSTRAINT "event_budgets_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "event_budgets"
    ADD CONSTRAINT "event_budgets_created_by_fkey"
    FOREIGN KEY ("created_by")
    REFERENCES "users"("id")
    ON DELETE NO ACTION
    ON UPDATE CASCADE;

ALTER TABLE "event_budgets"
    ADD CONSTRAINT "event_budgets_class_id_fkey"
    FOREIGN KEY ("class_id")
    REFERENCES "classes"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;

ALTER TABLE "event_budgets"
    ADD CONSTRAINT "event_budgets_year_group_id_fkey"
    FOREIGN KEY ("year_group_id")
    REFERENCES "year_groups"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;

-- Now that event_budgets exists, wire the
-- financial_model_line_items.references_event_budget_id FK.
ALTER TABLE "financial_model_line_items"
    ADD CONSTRAINT "financial_model_line_items_references_event_budget_id_fkey"
    FOREIGN KEY ("references_event_budget_id")
    REFERENCES "event_budgets"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;

-- ─── event_budget_scenarios ───────────────────────────────────────────────

CREATE TABLE "event_budget_scenarios" (
    "id"                     UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"              UUID         NOT NULL,
    "parent_event_budget_id" UUID         NOT NULL,
    "name"                   VARCHAR(64)  NOT NULL,
    "position"               SMALLINT     NOT NULL DEFAULT 0,
    "driver_overrides"       JSONB        NOT NULL,
    "notes"                  TEXT,
    "created_at"             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"             TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "event_budget_scenarios_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_event_budget_scenarios_parent_position"
    ON "event_budget_scenarios"("parent_event_budget_id", "position");

CREATE INDEX "idx_event_budget_scenarios_tenant_parent"
    ON "event_budget_scenarios"("tenant_id", "parent_event_budget_id");

ALTER TABLE "event_budget_scenarios"
    ADD CONSTRAINT "event_budget_scenarios_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "event_budget_scenarios"
    ADD CONSTRAINT "event_budget_scenarios_parent_event_budget_id_fkey"
    FOREIGN KEY ("parent_event_budget_id")
    REFERENCES "event_budgets"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ─── variance_cache ───────────────────────────────────────────────────────

CREATE TABLE "variance_cache" (
    "id"              UUID                       NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"       UUID                       NOT NULL,
    "parent_model_id" UUID                       NOT NULL,
    "snapshot_id"     UUID,
    "period_type"     "VarianceCachePeriodType"  NOT NULL,
    "period_label"    VARCHAR(32)                NOT NULL,
    "line_item_key"   VARCHAR(128)               NOT NULL,
    "planned"         DECIMAL(12, 2)             NOT NULL,
    "actual"          DECIMAL(12, 2)             NOT NULL,
    "variance"        DECIMAL(12, 2)             NOT NULL,
    "variance_pct"    DECIMAL(7, 2)              NOT NULL,
    "drivers_json"    JSONB,
    "refreshed_at"    TIMESTAMPTZ                NOT NULL DEFAULT now(),

    CONSTRAINT "variance_cache_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "uq_variance_cache_unique_row"
    ON "variance_cache"("parent_model_id", "period_type", "period_label", "line_item_key");

CREATE INDEX "idx_variance_cache_lookup"
    ON "variance_cache"("tenant_id", "parent_model_id", "period_type", "period_label");

ALTER TABLE "variance_cache"
    ADD CONSTRAINT "variance_cache_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "variance_cache"
    ADD CONSTRAINT "variance_cache_parent_model_id_fkey"
    FOREIGN KEY ("parent_model_id")
    REFERENCES "financial_models"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ─── shareable_links ──────────────────────────────────────────────────────

CREATE TABLE "shareable_links" (
    "id"                 UUID         NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"          UUID         NOT NULL,
    "token"              UUID         NOT NULL,
    "parent_model_id"    UUID         NOT NULL,
    "parent_snapshot_id" UUID         NOT NULL,
    "expires_at"         TIMESTAMPTZ  NOT NULL,
    "password_hash"      VARCHAR(255),
    "scenarios_visible"  JSONB        NOT NULL,
    "view_count"         INTEGER      NOT NULL DEFAULT 0,
    "last_viewed_at"     TIMESTAMPTZ,
    "revoked_at"         TIMESTAMPTZ,
    "created_by"         UUID         NOT NULL,
    "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
    "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "shareable_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shareable_links_token_key"
    ON "shareable_links"("token");

CREATE INDEX "idx_shareable_links_tenant_expiry"
    ON "shareable_links"("tenant_id", "expires_at");

ALTER TABLE "shareable_links"
    ADD CONSTRAINT "shareable_links_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "shareable_links"
    ADD CONSTRAINT "shareable_links_parent_model_id_fkey"
    FOREIGN KEY ("parent_model_id")
    REFERENCES "financial_models"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "shareable_links"
    ADD CONSTRAINT "shareable_links_parent_snapshot_id_fkey"
    FOREIGN KEY ("parent_snapshot_id")
    REFERENCES "financial_model_snapshots"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

ALTER TABLE "shareable_links"
    ADD CONSTRAINT "shareable_links_created_by_fkey"
    FOREIGN KEY ("created_by")
    REFERENCES "users"("id")
    ON DELETE NO ACTION
    ON UPDATE CASCADE;

-- ─── budgeting_tenant_preferences ─────────────────────────────────────────

CREATE TABLE "budgeting_tenant_preferences" (
    "id"                          UUID            NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id"                   UUID            NOT NULL,
    "default_horizon_years"       SMALLINT        NOT NULL DEFAULT 1,
    "default_household_share_pct" DECIMAL(5, 2)   NOT NULL DEFAULT 100,
    "default_contingency_pct"     DECIMAL(5, 2)   NOT NULL DEFAULT 5,
    "hidden_kpi_keys"             TEXT[]          NOT NULL DEFAULT ARRAY[]::TEXT[],
    "default_export_format"       VARCHAR(16)     NOT NULL DEFAULT 'pdf',
    "shareable_link_max_days"     SMALLINT        NOT NULL DEFAULT 30,
    "updated_at"                  TIMESTAMPTZ     NOT NULL DEFAULT now(),
    "updated_by"                  UUID,

    CONSTRAINT "budgeting_tenant_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "budgeting_tenant_preferences_tenant_id_key"
    ON "budgeting_tenant_preferences"("tenant_id");

ALTER TABLE "budgeting_tenant_preferences"
    ADD CONSTRAINT "budgeting_tenant_preferences_tenant_id_fkey"
    FOREIGN KEY ("tenant_id")
    REFERENCES "tenants"("id")
    ON DELETE CASCADE
    ON UPDATE CASCADE;

-- ─── New budgeting.* permissions ──────────────────────────────────────────

INSERT INTO "permissions" ("id", "permission_key", "description", "permission_tier")
VALUES
    (gen_random_uuid(), 'budgeting.view',          'View financial models and event budgets',                                         'admin'),
    (gen_random_uuid(), 'budgeting.manage',        'Create and edit financial models, scenarios, line items, and event budgets',     'admin'),
    (gen_random_uuid(), 'budgeting.publish',       'Publish a financial model snapshot (immutable versioned record)',                'admin'),
    (gen_random_uuid(), 'budgeting.share',         'Issue and revoke read-only shareable links for published snapshots',             'admin'),
    (gen_random_uuid(), 'budgeting.generate_fees', 'Push trip costs end-to-end into the Finance module as fee assignments',          'admin'),
    (gen_random_uuid(), 'budgeting.archive',       'Archive financial models and event budgets',                                     'admin')
ON CONFLICT ("permission_key") DO NOTHING;

-- ─── Backfill role_permissions for existing tenants' system roles ─────────
--
-- Defaults from modeling/PLAN.md §12.5:
--   school_owner / school_principal / school_vice_principal → all six
--   accounting → budgeting.view, budgeting.manage, budgeting.generate_fees
--   front_office → budgeting.view
--   teacher / parent / student / attendance_officer → unchanged
--
-- The is_system_role + tenant_id NOT NULL guards mirror the wellbeing /
-- reports foundation backfill pattern. NEW tenants created after this
-- migration receive the same grants via SYSTEM_ROLES.default_permissions
-- in packages/prisma/seed/system-roles.ts.

-- All six → school_owner + school_principal + school_vice_principal
INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id")
SELECT r.id, p.id, r.tenant_id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system_role = true
  AND r.tenant_id IS NOT NULL
  AND r.role_key IN ('school_owner', 'school_principal', 'school_vice_principal')
  AND p.permission_key IN (
      'budgeting.view', 'budgeting.manage', 'budgeting.publish',
      'budgeting.share', 'budgeting.generate_fees', 'budgeting.archive'
  )
  AND NOT EXISTS (
      SELECT 1 FROM "role_permissions" rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- budgeting.view + budgeting.manage + budgeting.generate_fees → accounting
INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id")
SELECT r.id, p.id, r.tenant_id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system_role = true
  AND r.tenant_id IS NOT NULL
  AND r.role_key = 'accounting'
  AND p.permission_key IN ('budgeting.view', 'budgeting.manage', 'budgeting.generate_fees')
  AND NOT EXISTS (
      SELECT 1 FROM "role_permissions" rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- budgeting.view → front_office
INSERT INTO "role_permissions" ("role_id", "permission_id", "tenant_id")
SELECT r.id, p.id, r.tenant_id
FROM "roles" r
CROSS JOIN "permissions" p
WHERE r.is_system_role = true
  AND r.tenant_id IS NOT NULL
  AND r.role_key = 'front_office'
  AND p.permission_key = 'budgeting.view'
  AND NOT EXISTS (
      SELECT 1 FROM "role_permissions" rp
      WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- ─── Register the budgeting module key for every existing tenant ─────────

INSERT INTO "tenant_modules" ("id", "tenant_id", "module_key", "is_enabled")
SELECT gen_random_uuid(), t.id, 'budgeting', true
FROM "tenants" t
WHERE NOT EXISTS (
    SELECT 1 FROM "tenant_modules" tm
    WHERE tm.tenant_id = t.id AND tm.module_key = 'budgeting'
);
