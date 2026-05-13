# Implementation 21 — Migration Runbook for Existing Tenants

> **Phase:** 5 — Wave W5 (closure)
> **Wave:** W5
> **Depends on:** W1–W4 complete
> **Deploys:** No new code; verification + audit-log entry + runbook doc
> **Model:** Sonnet 4.6

---

## Goal

After all per-module enforcement waves (W2–W4) have shipped, run a final verification pass on every existing tenant (NHQS + 4 stress tenants + any other tenant that exists at the time) to confirm the migration backfill from impl 02 left them in a consistent state, the audit log captured the initial state, and the operator runbook is in place for future toggles.

---

## Critical safety constraints

- **No code changes.** This spec is verification + documentation.
- **Audit log entry must capture the initial state per tenant.** A "module gating system rolled out" entry per tenant with a snapshot of which modules are on/off serves as the historical record for future "what was enabled when?" questions.
- **Rollback plan must be documented and tested.** If the entire module gating system needs to be disabled in an emergency, the rollback path must be clear.

---

## Files to create / modify

### Create

- **`Module Gating/migration-runbook.md`** — operator-facing runbook with three procedures: pre-migration verification, post-migration verification, emergency rollback. Full content below.

### Run (one-off operations on production)

- For each tenant in production: insert an audit-log row capturing the state at migration completion. Use the existing audit-log infrastructure; do NOT create a new audit table.
- Run the verification SQL: confirm every tenant has exactly 20 `tenantModule` rows.

---

## migration-runbook.md content

````markdown
# Module Gating — Migration Runbook

## Pre-migration verification

Before running the impl 02 backfill migration:

```bash
# 1. Snapshot current tenant_modules state (for rollback comparison)
psql "$DATABASE_URL" -c "COPY (SELECT tenant_id, module_key, is_enabled FROM tenant_modules ORDER BY tenant_id, module_key) TO STDOUT CSV HEADER" > /tmp/tenant-modules-pre-migration.csv

# 2. Confirm tenant count + currently-set module count
psql "$DATABASE_URL" -c "SELECT COUNT(DISTINCT id) AS tenants FROM tenants WHERE status = 'active';"
psql "$DATABASE_URL" -c "SELECT module_key, COUNT(*) AS tenant_count FROM tenant_modules GROUP BY module_key ORDER BY module_key;"

# 3. Identify tenants that already have an `analytics` row (those rows will be deleted by the migration)
psql "$DATABASE_URL" -c "SELECT tenant_id FROM tenant_modules WHERE module_key = 'analytics';"
```
````

Save the snapshot CSV before running the migration.

## Post-migration verification

After impl 02 ships:

```bash
# 1. Every tenant must have exactly 20 module rows
psql "$DATABASE_URL" -c "SELECT t.id AS tenant_id, COUNT(tm.module_key) AS module_count FROM tenants t LEFT JOIN tenant_modules tm ON tm.tenant_id = t.id WHERE t.status = 'active' GROUP BY t.id HAVING COUNT(tm.module_key) <> 20;"
# Expected: zero rows. Any output is a tenant missing rows — investigate immediately.

# 2. The `analytics` key is gone
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM tenant_modules WHERE module_key = 'analytics';"
# Expected: 0

# 3. The default-on modules are on for every tenant
psql "$DATABASE_URL" -c "
SELECT module_key, COUNT(*) FILTER (WHERE is_enabled = true) AS enabled, COUNT(*) FILTER (WHERE is_enabled = false) AS disabled
FROM tenant_modules
WHERE module_key IN ('admissions', 'gradebook', 'finance', 'communications_outbound', 'pastoral')
GROUP BY module_key;
"
# Expected: enabled=N tenants, disabled=0 for each (assuming no admin has manually toggled).
```

## Audit log entry per tenant

Insert one entry per tenant at migration completion. Use the existing audit log via the API (or via direct DB insert if running offline). Schema (mirror existing audit_log columns):

```sql
INSERT INTO audit_logs (tenant_id, actor_user_id, action, resource_type, resource_id, payload, created_at)
SELECT
  t.id,
  '<platform_owner_user_id>',
  'module_gating.system_rolled_out',
  'tenant',
  t.id::text,
  jsonb_build_object(
    'wave', 'W5',
    'rolled_out_at', now(),
    'modules_snapshot', (
      SELECT jsonb_object_agg(module_key, is_enabled)
      FROM tenant_modules WHERE tenant_id = t.id
    )
  ),
  now()
FROM tenants t
WHERE t.status = 'active';
```

This snapshot is the historical record. Future "what modules were on for tenant X on date Y?" questions reference this.

## Per-tenant smoke test (one-off after rollout)

For NHQS + each of the 4 stress tenants:

```bash
# 1. Authenticate as an owner
TOKEN=$(curl -s -X POST https://<tenant>.edupod.app/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<owner_email>","password":"<password>"}' \
  | jq -r '.data.access_token')

# 2. Call /me and confirm enabled_modules has 18 entries (default)
curl -s https://<tenant>.edupod.app/api/v1/auth/me \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data.enabled_modules | length'
# Expected: 18 (all 20 minus sen + compliance_advanced which default OFF)

# 3. Confirm a gated endpoint works
curl -s https://<tenant>.edupod.app/api/v1/pastoral/cases \
  -H "Authorization: Bearer $TOKEN" \
  | jq '.data | length'
# Expected: integer (cases count). If you get 404 MODULE_DISABLED, pastoral is off — investigate.
```

## Emergency rollback

If module gating causes a production incident affecting tenants:

```bash
# 1. Re-enable EVERYTHING for the affected tenant (or all tenants)
psql "$DATABASE_URL" -c "UPDATE tenant_modules SET is_enabled = true WHERE tenant_id = '<id>';"
# Or for all tenants:
psql "$DATABASE_URL" -c "UPDATE tenant_modules SET is_enabled = true;"

# 2. Invalidate the cache for affected tenant(s)
redis-cli DEL "tenant_modules:<id>"
# Or for all:
redis-cli --scan --pattern "tenant_modules:*" | xargs redis-cli DEL

# 3. Publish invalidation events (frontend will refetch /me on next poll)
redis-cli PUBLISH "tenant_modules:invalidated" '{"tenantId":"<id>","moduleKey":"system","isEnabled":true,"timestamp":'$(date +%s%3N)'}'

# 4. If the issue is the @ModuleEnabled enforcement itself (not the toggle data),
#    the only true rollback is: revert the enforcement commits and redeploy.
#    git log --oneline | grep "module gating" — identify commits to revert.
```

## Rollback decision tree

- **Issue: a single tenant shouldn't have a module disabled** → toggle it back via SQL + redis (procedure 1 above).
- **Issue: enforcement bug 404s users on a module that should be on** → re-enable across-the-board (procedure 1 with all tenants), then investigate the bug.
- **Issue: enforcement is fundamentally broken (e.g., guard throwing on every request)** → revert the offending commit + redeploy. The data layer (tenantModule table) does not need to be touched.

```

---

## Acceptance

- [ ] `Module Gating/migration-runbook.md` exists with all three procedures and the rollback decision tree.
- [ ] Production verification SQL run on NHQS + 4 stress tenants: every one has exactly 20 `tenantModule` rows. Zero `analytics` rows remain.
- [ ] Audit-log entry inserted for each tenant capturing the modules snapshot at rollout.
- [ ] Smoke test commands run successfully on NHQS via curl: `/me` returns 18 enabled modules, gated endpoints return data.
- [ ] Rollback procedure tested in dev: disable a module via SQL, confirm 404; re-enable + invalidate cache via SQL+redis, confirm 200 within seconds.

---

## Notes

- This spec is mostly operations work, not coding. ~3-4 hours including verification on production.
- The audit-log entry is the historical anchor. If, in 18 months, someone asks "when did we turn module gating on for NHQS?", this entry is the answer.
- The rollback is intentionally aggressive (re-enable everything). The cost of over-enabling is low (a tenant sees features they didn't expect for a few minutes); the cost of leaving them locked out is high. When in doubt, re-enable.
```
