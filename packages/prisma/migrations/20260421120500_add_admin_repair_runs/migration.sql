-- WB-C-20 — Track every preview + execute run on the behaviour-admin repair
-- console. Admins need to see a recent-activity feed so colleagues' actions
-- are visible, and the audit trail survives even if the operation rolled
-- back mid-run.

CREATE TYPE "AdminRepairRunStatus" AS ENUM (
  'preview',
  'executed',
  'failed',
  'rolled_back'
);

CREATE TABLE "admin_repair_runs" (
  "id"             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"      UUID NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "actor_id"       UUID NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "operation"      VARCHAR(100) NOT NULL,
  "scope"          JSONB NOT NULL DEFAULT '{}'::jsonb,
  "preview_data"   JSONB,
  "execute_data"   JSONB,
  "status"         "AdminRepairRunStatus" NOT NULL DEFAULT 'preview',
  "started_at"     TIMESTAMPTZ NOT NULL DEFAULT now(),
  "completed_at"   TIMESTAMPTZ,
  "error_detail"   TEXT
);

CREATE INDEX "idx_admin_repair_runs_tenant"
  ON "admin_repair_runs" ("tenant_id", "started_at" DESC);

CREATE INDEX "idx_admin_repair_runs_actor"
  ON "admin_repair_runs" ("tenant_id", "actor_id", "started_at" DESC);

CREATE INDEX "idx_admin_repair_runs_operation"
  ON "admin_repair_runs" ("tenant_id", "operation", "started_at" DESC);

-- RLS
ALTER TABLE "admin_repair_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_repair_runs" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS admin_repair_runs_tenant_isolation
  ON "admin_repair_runs";

CREATE POLICY admin_repair_runs_tenant_isolation
  ON "admin_repair_runs"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
