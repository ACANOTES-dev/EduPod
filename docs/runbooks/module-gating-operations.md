# Module Gating — Operations Runbook

Use this when an operator toggles a tenant feature, a user reports `MODULE_DISABLED`, or a tenant appears to have missing module rows.

## Toggle a module

Preferred path after the admin-console handoff lands: use the tenant module toggle UI for the tenant. That route writes the DB row, records the audit log, deletes the Redis cache key, and publishes `tenant_modules:invalidated`.

Emergency direct database path, only when the admin UI is unavailable:

```bash
psql "$DATABASE_URL" -c "UPDATE tenant_modules SET is_enabled = false WHERE tenant_id = '<tenant-id>' AND module_key = '<module-key>';"
redis-cli DEL "tenant_modules:<tenant-id>"
redis-cli PUBLISH "tenant_modules:invalidated" '{"tenantId":"<tenant-id>","module_key":"<module-key>","is_enabled":false,"timestamp":'$(date +%s%3N)'}'
```

Use the same sequence with `is_enabled = true` and `"is_enabled":true` to re-enable. The Redis publish is best-effort, but the `DEL` is mandatory so the API and worker do not serve stale module state until the five-minute TTL expires.

## Verify a tenant's module state

```bash
psql "$DATABASE_URL" -c "SELECT module_key, is_enabled, updated_at FROM tenant_modules WHERE tenant_id = '<tenant-id>' ORDER BY module_key;"
```

Expected result: 20 rows, one per key in `packages/shared/src/modules/registry.ts`. If fewer rows appear, run the latest module-gating backfill migration before enforcing any new decorator for that tenant.

## Debug a user blocked from a feature

1. Identify the tenant id from the user's JWT/session or membership row.
2. Map the feature to its module key using `docs/architecture/feature-map.md`.
3. Check the tenant row:

   ```bash
   psql "$DATABASE_URL" -c "SELECT module_key, is_enabled FROM tenant_modules WHERE tenant_id = '<tenant-id>' AND module_key = '<module-key>';"
   ```

4. If the row is missing, treat it as a DZ-MG-1 data drift incident and run the backfill.
5. If `is_enabled = false`, check the audit log before changing it back.
6. If `is_enabled = true` but the user still sees `MODULE_DISABLED`, clear Redis and watch the next `/me` refresh:

   ```bash
   redis-cli DEL "tenant_modules:<tenant-id>"
   ```

7. If the error persists, verify the controller has both `@ModuleEnabled('<module-key>')` and `ModuleEnabledGuard` in `@UseGuards(...)`, then run `apps/api/src/common/guards/module-enabled-coverage.spec.ts`.

## Re-enable default-on modules for one tenant

Use for emergency rollback when a tenant should regain all default-on modules:

```bash
psql "$DATABASE_URL" -c "UPDATE tenant_modules SET is_enabled = true WHERE tenant_id = '<tenant-id>' AND module_key NOT IN ('sen', 'compliance_advanced');"
redis-cli DEL "tenant_modules:<tenant-id>"
for key in admissions gradebook homework finance payroll budgeting behaviour pastoral staff_wellbeing early_warning communications_outbound parent_inquiries engagement website auto_scheduling leave school_closures ai_functions; do
  redis-cli PUBLISH "tenant_modules:invalidated" '{"tenantId":"<tenant-id>","module_key":"'"$key"'","is_enabled":true,"timestamp":'$(date +%s%3N)'}'
done
```

`sen` and `compliance_advanced` default off in the registry, so do not enable them during a blanket rollback unless the tenant explicitly bought those features.
