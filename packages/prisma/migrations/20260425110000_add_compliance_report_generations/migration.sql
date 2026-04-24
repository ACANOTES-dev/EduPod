-- ─────────────────────────────────────────────────────────────────────────────
-- Impl 07 (Reports rebuild — Wave 2) fix-forward migration.
--
-- Adds `compliance_report_generations` for the generation-audit trail
-- introduced by the compliance generation service. Each row records the
-- exact field payload returned to the caller at generation time so a
-- regulator can ask "what number did you submit on <date>" and the
-- tenant can answer from the DB rather than from memory.
--
-- RLS policy is in `post_migrate.sql` alongside this migration and
-- is mirrored into `packages/prisma/rls/policies.sql` for the canonical
-- snapshot.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE compliance_report_generations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  academic_year_id  UUID NOT NULL,
  generated_by      UUID NOT NULL REFERENCES users(id),
  fields_json       JSONB NOT NULL,
  catalogue_version VARCHAR(20) NOT NULL DEFAULT 'v1',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable + force RLS so tenant isolation holds even against table owners.
ALTER TABLE compliance_report_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE compliance_report_generations FORCE ROW LEVEL SECURITY;

CREATE INDEX idx_compliance_gen_tenant
  ON compliance_report_generations(tenant_id);
CREATE INDEX idx_compliance_gen_tenant_academic_year
  ON compliance_report_generations(tenant_id, academic_year_id);
