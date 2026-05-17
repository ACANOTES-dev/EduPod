-- Session 5F: platform readiness score / ops confidence.

CREATE TYPE readiness_dimension AS ENUM (
  'synthetic_journeys',
  'alert_route_health',
  'evidence_freshness',
  'backup_readiness',
  'sentry_intake',
  'queue_canary',
  'deploy_event_freshness',
  'unresolved_critical_incidents',
  'certificate_expiry',
  'external_dependency_status'
);

ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'readiness_weight_updated';

CREATE TABLE platform_readiness_score_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  score NUMERIC(5, 2) NOT NULL,
  worst_dimension readiness_dimension,
  worst_dimension_value NUMERIC(5, 2),
  breakdown JSONB NOT NULL,
  reasons JSONB NOT NULL,
  weights_snapshot JSONB NOT NULL
);

CREATE INDEX idx_platform_readiness_snapshots_at
  ON platform_readiness_score_snapshots(snapshot_at DESC);

CREATE TABLE platform_readiness_dimension_weights (
  dimension readiness_dimension PRIMARY KEY,
  weight NUMERIC(5, 2) NOT NULL CHECK (weight >= 0),
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at_platform_readiness_dimension_weights
  BEFORE UPDATE ON platform_readiness_dimension_weights
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

INSERT INTO platform_readiness_dimension_weights (dimension, weight, enabled)
VALUES
  ('alert_route_health', 20, true),
  ('evidence_freshness', 15, true),
  ('backup_readiness', 15, true),
  ('synthetic_journeys', 12, true),
  ('unresolved_critical_incidents', 10, true),
  ('sentry_intake', 8, true),
  ('queue_canary', 7, true),
  ('certificate_expiry', 5, true),
  ('deploy_event_freshness', 4, true),
  ('external_dependency_status', 4, true)
ON CONFLICT (dimension) DO UPDATE SET
  weight = EXCLUDED.weight,
  enabled = EXCLUDED.enabled;

INSERT INTO platform_permissions (
  permission_key,
  category,
  display_name,
  description,
  is_destructive,
  requires_owner_confirmation
)
VALUES
  ('platform.readiness.view', 'readiness', 'View readiness score', 'View platform readiness score, dimension breakdown, and snapshot history.', false, false),
  ('platform.readiness.manage', 'readiness', 'Manage readiness weights', 'Adjust platform readiness dimension weights with audit logging and owner confirmation for large changes.', true, true)
ON CONFLICT (permission_key) DO UPDATE SET
  category = EXCLUDED.category,
  display_name = EXCLUDED.display_name,
  description = EXCLUDED.description,
  is_destructive = EXCLUDED.is_destructive,
  requires_owner_confirmation = EXCLUDED.requires_owner_confirmation;

INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform_roles r
CROSS JOIN platform_permissions p
WHERE r.role_key = 'platform_owner'
  AND p.permission_key IN ('platform.readiness.view', 'platform.readiness.manage')
ON CONFLICT DO NOTHING;

INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform_roles r
CROSS JOIN platform_permissions p
WHERE r.role_key = 'platform_support'
  AND p.permission_key IN ('platform.readiness.view')
ON CONFLICT DO NOTHING;
