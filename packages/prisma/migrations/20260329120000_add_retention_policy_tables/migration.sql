-- Migration: 20260329120000_add_retention_policy_tables
-- GDPR Phase I: Retention Policy Engine

-- ─── retention_policies ───────────────────────────────────────────────────────

CREATE TABLE retention_policies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID REFERENCES tenants(id) ON DELETE CASCADE,  -- NULL = platform default
  data_category         VARCHAR(50) NOT NULL,
  retention_months      INT NOT NULL,
  action_on_expiry      VARCHAR(20) NOT NULL DEFAULT 'anonymise',
  is_overridable        BOOLEAN NOT NULL DEFAULT true,
  statutory_basis       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_retention_policies_tenant   ON retention_policies (tenant_id);
CREATE INDEX idx_retention_policies_category ON retention_policies (data_category);

-- Partial unique index for tenant overrides (one policy per category per tenant)
CREATE UNIQUE INDEX uq_retention_policies_tenant_category
  ON retention_policies (tenant_id, data_category)
  WHERE tenant_id IS NOT NULL;

-- Partial unique index for platform defaults (one default per category)
CREATE UNIQUE INDEX uq_retention_policies_platform_default_category
  ON retention_policies (data_category)
  WHERE tenant_id IS NULL;

-- RLS: tenant_id CAN be NULL (platform defaults), so USING allows NULL rows
ALTER TABLE retention_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_policies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retention_policies_tenant_isolation ON retention_policies;
CREATE POLICY retention_policies_tenant_isolation ON retention_policies
  USING (tenant_id IS NULL OR tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── retention_holds ─────────────────────────────────────────────────────────

CREATE TABLE retention_holds (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  subject_type      VARCHAR(20) NOT NULL,
  subject_id        UUID NOT NULL,
  reason            TEXT NOT NULL,
  held_by_user_id   UUID NOT NULL REFERENCES users(id),
  held_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_retention_holds_tenant  ON retention_holds (tenant_id);
CREATE INDEX idx_retention_holds_subject ON retention_holds (subject_type, subject_id);

-- RLS: tenant_id is always NOT NULL — standard isolation
ALTER TABLE retention_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE retention_holds FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS retention_holds_tenant_isolation ON retention_holds;
CREATE POLICY retention_holds_tenant_isolation ON retention_holds
  USING (tenant_id = current_setting('app.current_tenant_id')::uuid)
  WITH CHECK (tenant_id = current_setting('app.current_tenant_id')::uuid);

-- ─── Platform default retention policies (tenant_id = NULL) ──────────────────

INSERT INTO retention_policies (tenant_id, data_category, retention_months, action_on_expiry, is_overridable, statutory_basis) VALUES
(NULL, 'active_student_records',          84, 'anonymise', true,  'Educational + tax law — 7 years post-enrolment'),
(NULL, 'graduated_withdrawn_students',    84, 'anonymise', true,  'Statutory + reference obligations — 7 years post-departure'),
(NULL, 'rejected_admissions',             12, 'delete',    true,  'Appeals window — 12 months post-decision'),
(NULL, 'financial_records',               72, 'anonymise', false, 'Irish tax law (TCA 1997) — current year + 6 years'),
(NULL, 'payroll_records',                 72, 'anonymise', false, 'Revenue requirements — current year + 6 years'),
(NULL, 'staff_records_post_employment',   84, 'anonymise', true,  'Employment law — 7 years post-departure'),
(NULL, 'attendance_records',              24, 'anonymise', true,  'Educational records — enrolment + 24 months'),
(NULL, 'behaviour_records',               12, 'delete',    true,  'Legitimate interest — enrolment + 12 months'),
(NULL, 'child_protection_safeguarding',    0, 'anonymise', false, 'Child protection law — indefinite retention'),
(NULL, 'communications_notifications',    12, 'delete',    true,  'Operational — 12 months'),
(NULL, 'audit_logs',                      36, 'delete',    true,  'Accountability — 36 months'),
(NULL, 'contact_form_submissions',        12, 'delete',    true,  'Legitimate interest — 12 months'),
(NULL, 'parent_inquiry_messages',         24, 'delete',    true,  'Operational — 24 months'),
(NULL, 'nl_query_history',               12, 'delete',    true,  'Storage limitation — 12 months'),
(NULL, 'ai_processing_logs',             24, 'delete',    true,  'Accountability — 24 months'),
(NULL, 'tokenisation_usage_logs',        36, 'delete',    true,  'Accountability — 36 months'),
(NULL, 's3_compliance_exports',           3, 'delete',    true,  'Storage limitation — 3 months after download');
