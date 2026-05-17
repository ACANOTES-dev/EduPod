-- Session 5E: platform backup / restore readiness.

CREATE TYPE backup_run_kind AS ENUM (
  'full',
  'incremental',
  'pg_dump',
  'snapshot'
);

CREATE TYPE backup_run_status AS ENUM (
  'succeeded',
  'failed',
  'partial',
  'verifying'
);

CREATE TYPE restore_drill_outcome AS ENUM (
  'passed',
  'failed_recoverable',
  'failed_blocking',
  'inconclusive'
);

ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'backup_captured';
ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'backup_updated';
ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'backup_restore_drill_recorded';
ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'backup_restore_drill_updated';
ALTER TYPE platform_audit_action ADD VALUE IF NOT EXISTS 'backup_restore_drill_deleted';

CREATE TABLE platform_backup_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  backup_key VARCHAR(160) NOT NULL UNIQUE,
  kind backup_run_kind NOT NULL,
  status backup_run_status NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  finished_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  size_bytes BIGINT,
  location VARCHAR(500) NOT NULL,
  storage_kind VARCHAR(40) NOT NULL,
  integrity_check_passed BOOLEAN,
  integrity_check_at TIMESTAMPTZ,
  integrity_check_detail JSONB,
  trigger_source VARCHAR(40) NOT NULL,
  triggered_by_user_id UUID,
  failure_reason TEXT,
  deploy_event_id UUID REFERENCES platform_deploy_events(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_backup_runs_finished
  ON platform_backup_runs(finished_at DESC);
CREATE INDEX idx_platform_backup_runs_status_finished
  ON platform_backup_runs(status, finished_at DESC);
CREATE INDEX idx_platform_backup_runs_kind_finished
  ON platform_backup_runs(kind, finished_at DESC);

CREATE TRIGGER set_updated_at_platform_backup_runs
  BEFORE UPDATE ON platform_backup_runs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE platform_offsite_replications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_backup_id UUID REFERENCES platform_backup_runs(id) ON DELETE SET NULL,
  replication_target VARCHAR(120) NOT NULL,
  snapshot_id VARCHAR(255) NOT NULL,
  replicated_at TIMESTAMPTZ NOT NULL,
  size_bytes BIGINT,
  lag_seconds INTEGER,
  integrity_verified BOOLEAN NOT NULL DEFAULT false,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT platform_offsite_replications_target_snapshot_key UNIQUE(replication_target, snapshot_id)
);

CREATE INDEX idx_platform_replications_target_time
  ON platform_offsite_replications(replication_target, replicated_at DESC);
CREATE INDEX idx_platform_replications_source
  ON platform_offsite_replications(source_backup_id);

CREATE TABLE platform_restore_drills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drill_at TIMESTAMPTZ NOT NULL,
  performed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  restore_point VARCHAR(255) NOT NULL,
  outcome restore_drill_outcome NOT NULL,
  duration_seconds INTEGER,
  rpo_observed_seconds INTEGER,
  rto_observed_seconds INTEGER,
  notes TEXT,
  evidence_url VARCHAR(500),
  follow_ups JSONB,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_restore_drills_drill_at
  ON platform_restore_drills(drill_at DESC);
CREATE INDEX idx_platform_restore_drills_outcome
  ON platform_restore_drills(outcome);

INSERT INTO platform_permissions (
  permission_key,
  category,
  display_name,
  description,
  is_destructive,
  requires_owner_confirmation
)
VALUES
  ('platform.backups.view', 'backups', 'View backup readiness', 'View backup runs, off-site replication metadata, and restore drill records.', false, false),
  ('platform.backups.record_drill', 'backups', 'Record restore drills', 'Create and update manual restore-drill evidence records.', false, false),
  ('platform.backups.manage', 'backups', 'Manage backup evidence', 'Delete or destructively edit suspicious restore-drill records with owner confirmation.', true, true)
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
  AND p.permission_key IN ('platform.backups.view', 'platform.backups.record_drill', 'platform.backups.manage')
ON CONFLICT DO NOTHING;

INSERT INTO platform_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM platform_roles r
CROSS JOIN platform_permissions p
WHERE r.role_key = 'platform_support'
  AND p.permission_key IN ('platform.backups.view', 'platform.backups.record_drill')
ON CONFLICT DO NOTHING;
