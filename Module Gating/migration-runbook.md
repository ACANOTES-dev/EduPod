# Module Gating — Migration Runbook

Use this runbook when preparing, verifying, or recovering the per-tenant module gating rollout for existing tenants.

## Pre-Migration Verification

Run these checks before the implementation 02 backfill migration reaches production.

```bash
# Snapshot current tenant_modules state for rollback comparison.
psql "$DATABASE_MIGRATE_URL" -c "COPY (SELECT tenant_id, module_key, is_enabled FROM tenant_modules ORDER BY tenant_id, module_key) TO STDOUT CSV HEADER" > /tmp/tenant-modules-pre-migration.csv

# Confirm tenant count and currently configured module counts.
psql "$DATABASE_MIGRATE_URL" -c "SELECT COUNT(*) AS active_tenants FROM tenants WHERE status = 'active';"
psql "$DATABASE_MIGRATE_URL" -c "SELECT module_key, COUNT(*) AS tenant_count FROM tenant_modules GROUP BY module_key ORDER BY module_key;"

# Identify deprecated analytics rows. The backfill migration removes these.
psql "$DATABASE_MIGRATE_URL" -c "SELECT tenant_id FROM tenant_modules WHERE module_key = 'analytics';"
```

Save `/tmp/tenant-modules-pre-migration.csv` before applying the migration.

## Post-Migration Verification

Run these checks after the implementation 02 backfill migration and after every production deploy that materially changes module gating.

```bash
# Every active tenant must have exactly 20 canonical module rows.
psql "$DATABASE_MIGRATE_URL" -c "
SELECT t.id AS tenant_id, t.slug, COUNT(tm.module_key) AS module_count
FROM tenants t
LEFT JOIN tenant_modules tm ON tm.tenant_id = t.id
WHERE t.status = 'active'
GROUP BY t.id, t.slug
HAVING COUNT(tm.module_key) <> 20
ORDER BY t.slug;
"
# Expected: zero rows.

# Deprecated analytics tenant-module rows must be gone.
psql "$DATABASE_MIGRATE_URL" -c "SELECT COUNT(*) AS analytics_rows FROM tenant_modules WHERE module_key = 'analytics';"
# Expected: 0

# Confirm each canonical key exists for every active tenant.
psql "$DATABASE_MIGRATE_URL" -c "
SELECT module_key,
       COUNT(*) AS tenant_count,
       COUNT(*) FILTER (WHERE is_enabled) AS enabled_count
FROM tenant_modules
GROUP BY module_key
ORDER BY module_key;
"
# Expected: 20 module_key rows. tenant_count should match the active tenant count for each row.
```

Default-off modules (`sen`, `compliance_advanced`) may have enabled counts below the tenant count. Do not assume every production tenant has exactly 18 enabled modules: tenant-specific settings may intentionally enable optional modules.

## Rollout Audit Entry

Insert one audit row per active tenant at W5 completion. This is the historical record that module gating was rolled out and captures the exact module snapshot at that moment.

Prefer the application audit infrastructure when an operator API exists for this rollout event. If running offline, use this idempotent SQL from the production checkout:

```bash
psql "$DATABASE_MIGRATE_URL" -v ON_ERROR_STOP=1 -c "
WITH actor AS (
  SELECT id FROM users WHERE email = '<platform-owner-email>' LIMIT 1
),
active_tenants AS (
  SELECT id FROM tenants WHERE status = 'active'
)
INSERT INTO audit_logs (
  tenant_id,
  actor_user_id,
  entity_type,
  entity_id,
  action,
  metadata_json,
  ip_address
)
SELECT
  t.id,
  actor.id,
  'tenant_config',
  t.id,
  'module_gating.system_rolled_out',
  jsonb_build_object(
    'category', 'security_event',
    'sensitivity', 'elevated',
    'wave', 'W5',
    'rolled_out_at', now(),
    'modules_snapshot', (
      SELECT jsonb_object_agg(tm.module_key, tm.is_enabled ORDER BY tm.module_key)
      FROM tenant_modules tm
      WHERE tm.tenant_id = t.id
    )
  ),
  NULL
FROM active_tenants t
CROSS JOIN actor
WHERE NOT EXISTS (
  SELECT 1
  FROM audit_logs al
  WHERE al.tenant_id = t.id
    AND al.action = 'module_gating.system_rolled_out'
);
"
```

Verify the audit rows:

```bash
psql "$DATABASE_MIGRATE_URL" -c "
SELECT tenant_id, COUNT(*) AS rollout_audit_rows
FROM audit_logs
WHERE action = 'module_gating.system_rolled_out'
GROUP BY tenant_id
ORDER BY tenant_id;
"
# Expected: one row per active tenant, count = 1.
```

## Per-Tenant Smoke Test

Run at least one non-disruptive smoke test on the pilot tenant after rollout.

```bash
# Authenticate as a test tenant owner.
TOKEN=$(curl -s -X POST https://<tenant>.edupod.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<owner-email>","password":"<password>"}' \
  | jq -r '.data.access_token')

# /me must include enabled_modules.
curl -s https://<tenant>.edupod.app/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data.enabled_modules'

# A default-on gated endpoint should respond without MODULE_DISABLED.
curl -s https://<tenant>.edupod.app/api/v1/pastoral/cases \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.error.code // "ok"'
# Expected: "ok", or a non-MODULE_DISABLED application response if the fixture has no records.
```

Avoid disruptive production module off/on smoke unless a safe platform-owner credential and explicit smoke path are available. Use the dev rollback drill below for the actual disable/re-enable proof.

## Dev Rollback Drill

Use a disposable development tenant. Do not run this on production tenants unless the operator explicitly requests it.

```bash
# 1. Disable one default-on module.
psql "$DATABASE_MIGRATE_URL" -c "UPDATE tenant_modules SET is_enabled = false WHERE tenant_id = '<tenant-id>' AND module_key = 'pastoral';"
redis-cli DEL "tenant_modules:<tenant-id>"

# 2. Confirm the API returns MODULE_DISABLED for that tenant.
curl -s https://<tenant-host>/api/v1/pastoral/cases \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.error.code'
# Expected: "MODULE_DISABLED"

# 3. Re-enable and invalidate.
psql "$DATABASE_MIGRATE_URL" -c "UPDATE tenant_modules SET is_enabled = true WHERE tenant_id = '<tenant-id>' AND module_key = 'pastoral';"
redis-cli DEL "tenant_modules:<tenant-id>"
redis-cli PUBLISH "tenant_modules:invalidated" '{"tenantId":"<tenant-id>","module_key":"pastoral","is_enabled":true,"timestamp":'$(date +%s%3N)'}'

# 4. Confirm the API no longer returns MODULE_DISABLED.
curl -s https://<tenant-host>/api/v1/pastoral/cases \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.error.code // "ok"'
# Expected: "ok", or a non-MODULE_DISABLED application response.
```

## Emergency Rollback

If module gating causes a production incident:

```bash
# Re-enable all default-on modules for one affected tenant.
psql "$DATABASE_MIGRATE_URL" -c "
UPDATE tenant_modules
SET is_enabled = true
WHERE tenant_id = '<tenant-id>'
  AND module_key NOT IN ('sen', 'compliance_advanced');
"
redis-cli DEL "tenant_modules:<tenant-id>"

# Or re-enable every module for every tenant during a severe outage.
psql "$DATABASE_MIGRATE_URL" -c "UPDATE tenant_modules SET is_enabled = true;"
redis-cli --scan --pattern "tenant_modules:*" | xargs redis-cli DEL
```

If the failure is an enforcement bug rather than bad tenant data, revert the offending enforcement commit and redeploy through `git push origin main` / GitHub Actions. Do not bypass CI with rsync or direct server edits.

## Rollback Decision Tree

- Single tenant has an unexpected disabled module: re-enable that module for that tenant and invalidate `tenant_modules:<tenant-id>`.
- Tenant should regain all default-on modules quickly: run the one-tenant default-on rollback.
- Multiple tenants are blocked by bad module data: re-enable all default-on modules globally, invalidate all tenant module cache keys, then investigate.
- `@ModuleEnabled` or `ModuleEnabledGuard` is broken globally: revert the offending code commit and redeploy through CI. Leave the `tenant_modules` data intact unless the incident analysis proves it is corrupt.
