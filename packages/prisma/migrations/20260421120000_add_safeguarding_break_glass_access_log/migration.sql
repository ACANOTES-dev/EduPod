-- WB-C-19 — Append-only audit log for break-glass access. Every grant
-- creation, each resource read while a grant is active, each revocation,
-- and each after-action review submission writes a row here. Platform
-- admin queries this cross-tenant via the audit console.

CREATE TYPE "SafeguardingBreakGlassAccessAction" AS ENUM (
  'granted',
  'accessed',
  'revoked',
  'reviewed'
);

CREATE TABLE "safeguarding_break_glass_access_log" (
  "id"           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id"    UUID NOT NULL REFERENCES "tenants" ("id") ON DELETE CASCADE,
  "grant_id"     UUID NOT NULL REFERENCES "safeguarding_break_glass_grants" ("id") ON DELETE CASCADE,
  "actor_id"     UUID NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "action"       "SafeguardingBreakGlassAccessAction" NOT NULL,
  "entity_type"  VARCHAR(50),
  "entity_id"    UUID,
  "accessed_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  "ip_address"   VARCHAR(64),
  "user_agent"   VARCHAR(500)
);

CREATE INDEX "idx_sg_break_glass_access_log_tenant"
  ON "safeguarding_break_glass_access_log" ("tenant_id");

CREATE INDEX "idx_sg_break_glass_access_log_grant"
  ON "safeguarding_break_glass_access_log" ("tenant_id", "grant_id");

CREATE INDEX "idx_sg_break_glass_access_log_actor"
  ON "safeguarding_break_glass_access_log" ("tenant_id", "actor_id", "accessed_at" DESC);

-- RLS: tenant isolation per packages/prisma/rls/policies.sql conventions.
ALTER TABLE "safeguarding_break_glass_access_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "safeguarding_break_glass_access_log" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS safeguarding_break_glass_access_log_tenant_isolation
  ON "safeguarding_break_glass_access_log";

CREATE POLICY safeguarding_break_glass_access_log_tenant_isolation
  ON "safeguarding_break_glass_access_log"
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);
