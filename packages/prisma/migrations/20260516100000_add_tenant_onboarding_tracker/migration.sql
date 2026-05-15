-- Session 1D: Platform admin onboarding tracker

CREATE TYPE billing_status AS ENUM ('active', 'past_due', 'cancelled');
CREATE TYPE onboarding_phase AS ENUM ('infrastructure', 'data', 'configuration', 'go_live');
CREATE TYPE onboarding_step_status AS ENUM (
  'pending',
  'in_progress',
  'completed',
  'skipped',
  'blocked'
);

ALTER TABLE tenants
  ADD COLUMN billing_status billing_status NOT NULL DEFAULT 'active';

CREATE TABLE tenant_onboarding_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phase onboarding_phase NOT NULL,
  step_key VARCHAR(100) NOT NULL,
  label VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  status onboarding_step_status NOT NULL DEFAULT 'pending',
  is_auto BOOLEAN NOT NULL DEFAULT false,
  blocked_by TEXT[] NOT NULL DEFAULT '{}',
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES users(id),
  metadata JSONB,
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_tenant_onboarding_step UNIQUE (tenant_id, step_key)
);

CREATE INDEX idx_tenant_onboarding_steps_tenant
  ON tenant_onboarding_steps (tenant_id);

CREATE TRIGGER set_updated_at_tenant_onboarding_steps
  BEFORE UPDATE ON tenant_onboarding_steps
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

INSERT INTO tenant_onboarding_steps (
  tenant_id,
  phase,
  step_key,
  label,
  description,
  is_auto,
  blocked_by,
  sort_order
)
SELECT
  tenants.id,
  defaults.phase::onboarding_phase,
  defaults.step_key,
  defaults.label,
  defaults.description,
  defaults.is_auto,
  defaults.blocked_by,
  defaults.sort_order
FROM tenants
CROSS JOIN (
  VALUES
    (
      'infrastructure',
      'domain_configured',
      'Custom domain added',
      'A custom domain has been configured for this tenant.',
      true,
      ARRAY[]::TEXT[],
      1
    ),
    (
      'infrastructure',
      'ssl_verified',
      'SSL certificate active',
      'SSL certificate has been provisioned and is active for the custom domain.',
      true,
      ARRAY['domain_configured']::TEXT[],
      2
    ),
    (
      'infrastructure',
      'modules_configured',
      'Module toggle rows complete',
      'All 20 gateable modules from the Module Gating canonical registry have explicit toggle rows for this tenant. Auto-completes via TenantModuleService.assertCompleteness() - provided by Module Gating impl 05. The Module Gating impl 02 backfill migration ensures this is true for every existing tenant on rollout.',
      true,
      ARRAY[]::TEXT[],
      3
    ),
    (
      'infrastructure',
      'billing_status_set',
      'Billing status confirmed',
      'The billing status for this tenant has been reviewed and set.',
      false,
      ARRAY[]::TEXT[],
      4
    ),
    (
      'data',
      'owner_account_created',
      'School owner account created',
      'A user account with the school_owner role has been created for this tenant.',
      true,
      ARRAY[]::TEXT[],
      5
    ),
    (
      'data',
      'owner_welcomed',
      'Welcome email sent to owner',
      'A welcome email has been sent to the school owner.',
      false,
      ARRAY['owner_account_created']::TEXT[],
      6
    ),
    (
      'data',
      'staff_imported',
      'Staff data imported',
      'Staff records have been imported into the system.',
      false,
      ARRAY['owner_account_created']::TEXT[],
      7
    ),
    (
      'data',
      'students_imported',
      'Student data imported',
      'Student records have been imported into the system.',
      false,
      ARRAY['owner_account_created']::TEXT[],
      8
    ),
    (
      'data',
      'parents_imported',
      'Parent data imported',
      'Parent records have been imported and linked to students.',
      false,
      ARRAY['students_imported']::TEXT[],
      9
    ),
    (
      'configuration',
      'academic_year_set',
      'Academic year configured',
      'The academic year, terms, and periods have been set up.',
      false,
      ARRAY['owner_account_created']::TEXT[],
      10
    ),
    (
      'configuration',
      'classes_set_up',
      'Classes and year groups created',
      'Year groups, classes, and sections have been created.',
      false,
      ARRAY['academic_year_set']::TEXT[],
      11
    ),
    (
      'configuration',
      'settings_reviewed',
      'Tenant settings reviewed',
      'The tenant settings (attendance, gradebook, finance, etc.) have been reviewed and configured.',
      false,
      ARRAY['modules_configured']::TEXT[],
      12
    ),
    (
      'configuration',
      'roles_reviewed',
      'Roles and permissions reviewed',
      'The role definitions and permission assignments have been reviewed.',
      false,
      ARRAY['owner_account_created']::TEXT[],
      13
    ),
    (
      'go_live',
      'owner_trained',
      'Owner walkthrough completed',
      'The school owner has completed an onboarding walkthrough of the platform.',
      false,
      ARRAY['owner_welcomed']::TEXT[],
      14
    ),
    (
      'go_live',
      'go_live_confirmed',
      'Tenant marked as live',
      'The tenant has been reviewed and confirmed as ready for live use.',
      false,
      ARRAY[
        'domain_configured',
        'ssl_verified',
        'modules_configured',
        'billing_status_set',
        'owner_account_created',
        'owner_welcomed',
        'staff_imported',
        'students_imported',
        'parents_imported',
        'academic_year_set',
        'classes_set_up',
        'settings_reviewed',
        'roles_reviewed',
        'owner_trained'
      ]::TEXT[],
      15
    )
) AS defaults(
  phase,
  step_key,
  label,
  description,
  is_auto,
  blocked_by,
  sort_order
)
ON CONFLICT (tenant_id, step_key) DO NOTHING;
