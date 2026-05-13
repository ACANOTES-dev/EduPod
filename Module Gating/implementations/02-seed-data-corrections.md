# Implementation 02 — Seed Data Corrections + Migration

> **Phase:** 1 — Foundation
> **Wave:** W1 (must land second; runs the migration that makes default-deny safe for existing tenants)
> **Depends on:** 01 — Canonical module registry
> **Deploys:** API restart (seed); Prisma migration runs as part of deploy script `scripts/deploy-production.sh`
> **Model:** Opus 4.7 / **Max effort** (database migration with idempotency + verification gate)

---

## Goal

Make the per-tenant `tenantModule` table consistent with the canonical registry from implementation 01. Specifically: backfill rows for every existing tenant × every gateable key (so the default-deny guard behaviour doesn't surprise anyone), remove deprecated keys (`analytics`, plus the old `communications` if relevant), and replace the duplicated `MODULE_KEYS` constant in the test fixture with an import from the registry.

After this ships, every tenant in production has exactly 20 `tenantModule` rows — one per gateable key — with `is_enabled` set per the registry's `default_enabled`. New tenants created via seed/registration go through the same provisioning. Subsequent enforcement waves can ship without instantly breaking tenants.

---

## Critical safety constraints

- **Idempotent migration.** Safe to re-run. Uses `INSERT ... ON CONFLICT (tenant_id, module_key) DO NOTHING` for backfill. Uses `DELETE WHERE module_key NOT IN (...)` for cleanup of deprecated keys.
- **Verification gate.** Migration's final statement is a SQL assertion: every tenant must have exactly 20 rows. If any tenant has fewer (or more), the migration aborts via `RAISE EXCEPTION`. The deploy script must surface this and roll back.
- **NHQS + 4 stress tenants verified post-migration.** Spot-check via `psql` that each has all 20 rows with the right defaults.
- **No behaviour change for endpoints that aren't yet decorated.** Existing controllers without `@ModuleEnabled` continue to work unchanged. The migration only changes the data; new enforcement comes in subsequent specs.
- **Tenant deletion respects the cascade.** The existing `tenants → tenantModule` FK cascade is preserved.

---

## Files to create / modify

### Modify

- **`apps/api/test/tenant-fixture.builder.ts`** — delete the inline `MODULE_KEYS` constant + `getDefaultModuleEnabledState` function. Replace with imports from `@school/shared/modules/registry`. The fixture provisions modules for new test tenants using `MODULE_REGISTRY` directly.
- **`packages/prisma/seed.ts`** (or wherever production seed runs) — same: delete the inline list, import from registry.
- **`packages/prisma/seed/system-roles.ts`** if it has any module-related references — verify and update.

### Create

- **`packages/prisma/migrations/<timestamp>_module_registry_backfill/migration.sql`** — the backfill SQL. Full content below.
- **`packages/prisma/migrations/<timestamp>_module_registry_backfill/post_migrate.sql`** — runs the verification assertion outside the migration's transaction so it can RAISE EXCEPTION cleanly.

---

## Migration SQL (backfill)

```sql
-- Backfill tenantModule rows for every existing tenant × every gateable module key.
-- Idempotent: skips rows that already exist.
-- Removes rows for deprecated keys (analytics).

BEGIN;

-- Step 1: Delete deprecated keys.
-- analytics is a ghost toggle that was never enforced; drop it.
DELETE FROM tenant_modules WHERE module_key IN ('analytics');

-- Step 2: Build the registry as a temporary table for the cross-join.
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

-- Step 3: Cross-join tenants × registry, insert any missing rows.
INSERT INTO tenant_modules (tenant_id, module_key, is_enabled, created_at, updated_at)
SELECT
  t.id,
  r.module_key,
  r.default_enabled,
  now(),
  now()
FROM tenants t
CROSS JOIN _module_registry_backfill r
ON CONFLICT (tenant_id, module_key) DO NOTHING;

-- Step 4: Migrate the old `communications` key to `communications_outbound` IF present
-- (preserve whatever the tenant had — if they had communications=false, keep
-- communications_outbound=false for them, otherwise the backfill gave them true).
-- Done by: copy is_enabled from old → new where new just got created at default,
-- then drop the old row.
UPDATE tenant_modules new
SET is_enabled = old.is_enabled, updated_at = now()
FROM tenant_modules old
WHERE new.tenant_id = old.tenant_id
  AND new.module_key = 'communications_outbound'
  AND old.module_key = 'communications'
  AND new.is_enabled = TRUE  -- only overwrite if backfill set the default; respect existing
  AND old.is_enabled = FALSE;

DELETE FROM tenant_modules WHERE module_key = 'communications';

COMMIT;
```

## Migration SQL (post_migrate verification — outside the txn)

```sql
-- Verification: every tenant must have exactly 20 module_keys after backfill.
-- Aborts the deploy if any tenant has fewer (or more).
DO $$
DECLARE
  bad_tenant_count INT;
BEGIN
  SELECT COUNT(*) INTO bad_tenant_count
  FROM tenants t
  WHERE (
    SELECT COUNT(*)
    FROM tenant_modules tm
    WHERE tm.tenant_id = t.id
      AND tm.module_key IN (
        'admissions', 'gradebook', 'homework', 'sen',
        'finance', 'payroll', 'budgeting',
        'behaviour', 'pastoral', 'staff_wellbeing', 'early_warning',
        'communications_outbound', 'parent_inquiries', 'engagement', 'website',
        'auto_scheduling', 'leave', 'school_closures', 'ai_functions',
        'compliance_advanced'
      )
  ) <> 20;

  IF bad_tenant_count > 0 THEN
    RAISE EXCEPTION 'Module registry backfill verification FAILED: % tenants do not have exactly 20 gateable module rows.', bad_tenant_count;
  END IF;

  -- Also verify deprecated keys are gone
  IF EXISTS (SELECT 1 FROM tenant_modules WHERE module_key IN ('analytics', 'communications')) THEN
    RAISE EXCEPTION 'Deprecated module keys (analytics, communications) still present in tenant_modules.';
  END IF;
END $$;
```

---

## Acceptance

- [ ] Prisma migration created with timestamp prefix; runs on `pnpm db:migrate dev` locally without errors.
- [ ] Migration is idempotent: running it twice produces no errors and no duplicate rows.
- [ ] Verification assertion in `post_migrate.sql` runs and passes locally.
- [ ] `apps/api/test/tenant-fixture.builder.ts`: no inline `MODULE_KEYS` constant remains; imports from `@school/shared`.
- [ ] `packages/prisma/seed.ts`: imports from `@school/shared`; produces tenants with all 20 rows on fresh seed.
- [ ] All existing tests in `apps/api` pass after the seed change (the fixture builder still produces the modules tests expect; defaults match registry).
- [ ] Manual verification on local dev DB: `SELECT module_key, is_enabled FROM tenant_modules WHERE tenant_id = '<test-tenant>' ORDER BY module_key;` returns exactly 20 rows in alphabetical order matching the registry.
- [ ] Production verification (after deploy): for NHQS and each of the 4 stress tenants, run the same SELECT and confirm exactly 20 rows.
- [ ] Deploy script (`scripts/deploy-production.sh`) does NOT skip the verification step — failure aborts deploy.

---

## Notes

- The `communications` → `communications_outbound` rename in step 4 of the SQL preserves the most conservative state. If a tenant had `communications=false` (i.e., they had already disabled their broadcast comms), the new `communications_outbound` row is set to `false`. If they had `communications=true`, the backfill default of `true` stays.
- After this spec ships, no controller is yet gated by `communications_outbound` — that wiring is implementation 09. The data is just ready.
- The `early_warning` and `engagement` rows DID NOT EXIST for any tenant before this migration. Those modules were enforced by `@ModuleEnabled` but the seed never created the rows, meaning every tenant got 403 on those endpoints. **This migration silently fixes that production bug.** The audit-log row inserted at end of deploy should call this out: "early_warning and engagement enforcement was previously broken for all tenants; backfill restored access using default=true."
- The deploy script must run the migration BEFORE the API restart so the API never serves stale data on first request post-deploy.
