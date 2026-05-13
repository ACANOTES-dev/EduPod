-- Backfill tenant_modules rows for every existing tenant x every gateable module key.
-- Idempotent: skips rows that already exist.
-- Removes rows for deprecated/non-gateable keys so each tenant has exactly the registry rows.

BEGIN;

CREATE TEMP TABLE _module_registry_backfill (
  module_key TEXT NOT NULL,
  default_enabled BOOLEAN NOT NULL
) ON COMMIT DROP;

INSERT INTO _module_registry_backfill (module_key, default_enabled) VALUES
  ('admissions',                TRUE),
  ('gradebook',                 TRUE),
  ('homework',                  TRUE),
  ('sen',                       FALSE),
  ('finance',                   TRUE),
  ('payroll',                   TRUE),
  ('budgeting',                 TRUE),
  ('behaviour',                 TRUE),
  ('pastoral',                  TRUE),
  ('staff_wellbeing',           TRUE),
  ('early_warning',             TRUE),
  ('communications_outbound',   TRUE),
  ('parent_inquiries',          TRUE),
  ('engagement',                TRUE),
  ('website',                   TRUE),
  ('auto_scheduling',           TRUE),
  ('leave',                     TRUE),
  ('school_closures',           TRUE),
  ('ai_functions',              TRUE),
  ('compliance_advanced',       FALSE);

INSERT INTO tenant_modules (tenant_id, module_key, is_enabled)
SELECT
  t.id,
  r.module_key,
  r.default_enabled
FROM tenants t
CROSS JOIN _module_registry_backfill r
ON CONFLICT (tenant_id, module_key) DO NOTHING;

-- Preserve the most conservative old communications state. A tenant that had
-- communications=false should also have communications_outbound=false.
UPDATE tenant_modules new
SET is_enabled = old.is_enabled
FROM tenant_modules old
WHERE new.tenant_id = old.tenant_id
  AND new.module_key = 'communications_outbound'
  AND old.module_key = 'communications'
  AND new.is_enabled = TRUE
  AND old.is_enabled = FALSE;

DELETE FROM tenant_modules
WHERE module_key NOT IN (SELECT module_key FROM _module_registry_backfill);

COMMIT;
