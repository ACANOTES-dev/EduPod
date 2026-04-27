# Implementation 02 — Permissions, RBAC seed, and backfill

> **Wave:** 1 (parallel with Impl 01 — codes against agreed permission strings, no schema dependency)
> **Depends on:** nothing (the two new permission strings — `configuration.communications.view` and `configuration.communications.manage` — are agreed in this spec; no other phase blocks)
> **Restart:** API only (the seeded `PERMISSIONS` constants flow through the running API; the backfill is a one-shot script run against the local dev DB)

---

## Goal

Land the two new permission constants for the Communications Settings UI, update the RBAC permission seed so freshly-provisioned tenants automatically receive them on the `school_owner` and `school_principal` roles, AND ship a one-shot, idempotent backfill script that grants the same two permissions to every existing `school_owner` / `school_principal` role row across the 5 known test tenants (NHQS + stress-a/b/c/d) in the local dev DB.

This phase **only touches permissions**. It does not touch any of the new credential tables (Impl 01 owns those), any service code (Impl 03 owns that), any provider refactor (Impl 04+), or any frontend (Impl 11). After this phase ships locally:

- The static `PERMISSIONS` object exports two new keys.
- The `PERMISSION_SEEDS` and `SYSTEM_ROLES` seeds in `packages/prisma/` know about both keys and bind them to Owner + Principal.
- A new script `packages/prisma/scripts/backfill-communications-permissions.ts` exists.
- After the script runs once on the local dev DB, every `school_owner` and `school_principal` role belonging to NHQS or any stress tenant carries both `configuration.communications.view` and `configuration.communications.manage`.

The `school_owner` system role is the platform-tenant version of "Owner" (created with `tenant_id = NULL` per the existing seed pattern), and `school_principal` is the per-tenant Principal. The backfill targets both because the architecture spec explicitly says those two roles get the new permissions by default.

### Why two paths

`packages/prisma/seed/permissions.ts` and `packages/prisma/seed/system-roles.ts` are read by `packages/prisma/seed.ts` only when a fresh tenant is provisioned. Existing tenants — including the 5 we already seeded into the local dev DB — never re-run the seed, so adding to the seed alone leaves them without the new permission rows on their role mappings. The backfill catches them up.

The seed change covers any **future** tenant created via `pnpm --filter @school/prisma seed`. The backfill covers the **current** 5 tenants (which are the only tenants the rebuild ever touches — production cutover happens later when the user merges to main, and at that point this same script is what unblocks production tenants).

---

## What to change

### 3.1 Permission constants

**File:** `packages/shared/src/constants/permissions.ts`

> Naming note: the user prompt referenced `apps/api/src/modules/rbac/permissions.constants.ts`, but the canonical `PERMISSIONS` object actually lives in `packages/shared/src/constants/permissions.ts` and is consumed by both API and web. There is no separate `permissions.constants.ts` under `apps/api/src/modules/rbac/`; that path does not exist. We add the two keys to the canonical shared file, mirroring the existing `stripe.manage` pattern.

Add a new `configuration` namespace alongside the existing `stripe`, `branding`, `domains` etc. namespaces. The `stripe` namespace currently exposes `manage` only — the architecture spec calls out `configuration.stripe.view` and `configuration.stripe.manage` as the conceptual model, so we mirror that pattern explicitly with the new comms keys.

```typescript
// In the body of PERMISSIONS = { ... } as const, alongside stripe / domains / branding:

configuration: {
  communications_view: 'configuration.communications.view',
  communications_manage: 'configuration.communications.manage',
},
```

Then in `PERMISSION_TIER_MAP`, add:

```typescript
[PERMISSIONS.configuration.communications_view]: 'admin',
[PERMISSIONS.configuration.communications_manage]: 'admin',
```

Then in `SYSTEM_ROLE_PERMISSIONS.school_owner`, append (immediately after the existing `PERMISSIONS.stripe.manage` line so the diff stays semantic):

```typescript
PERMISSIONS.configuration.communications_view,
PERMISSIONS.configuration.communications_manage,
```

`school_admin` does NOT receive these by default (Principal sits in the `school_principal` system role, which is seeded separately via `packages/prisma/seed/system-roles.ts`; see §3.2 below).

The keys are camelCase (`communications_view`, `communications_manage`) on the JS side and dot-separated (`configuration.communications.view`, `configuration.communications.manage`) on the string-value side. This matches the existing convention (e.g., `inbox.settings_read` → `'inbox.settings.read'`).

#### Cross-references the new keys must satisfy

- `PERMISSIONS.configuration.communications_view` and `..._manage` are the only two new entries — there is no `configuration.communications.send` (the `communications.send` permission already exists for sending messages; this rebuild is about credential CONFIG, not message authoring).
- The string values match what `EmailConfigController`, `SmsConfigController`, and `WhatsAppConfigController` (Impl 03) will pass to `@RequiresPermission(...)`.
- The string values match what the frontend (Impl 11) will check before rendering the Settings → Communications nav entry.

### 3.2 RBAC seed update

The seed has TWO files that need parallel updates:

#### 3.2.a `packages/prisma/seed/permissions.ts`

This file holds the master `PERMISSION_SEEDS` array — every permission row that exists in the global `permissions` table. Add the two new entries inside the existing `// ─── Admin tier — Settings & Configuration ─────` block, immediately after `stripe.manage`:

```typescript
{
  permission_key: 'configuration.communications.view',
  description: 'View tenant communications credentials and configuration (email, SMS, WhatsApp)',
  permission_tier: 'admin',
},
{
  permission_key: 'configuration.communications.manage',
  description: 'Configure tenant email, SMS, and WhatsApp credentials, domains, and templates',
  permission_tier: 'admin',
},
```

Naming + tier match `stripe.manage` exactly. Both are `admin` tier — no parent or staff role ever sees these.

#### 3.2.b `packages/prisma/seed/system-roles.ts`

In the `school_owner` `default_permissions` array, add the two new strings inside the existing `// ─── Settings & Config ──────` block, right after `'stripe.manage'`:

```typescript
'stripe.manage',
'configuration.communications.view',
'configuration.communications.manage',
'notifications.manage',
```

In the `school_principal` `default_permissions` array, do the same — append the two strings after `'stripe.manage'`:

```typescript
'stripe.manage',
'configuration.communications.view',
'configuration.communications.manage',
'notifications.manage',
```

Do **NOT** add these to `admin`, `school_vice_principal`, `accounting`, `front_office`, `attendance_officer`, `teacher`, `parent`, `student`. The architecture spec is explicit: only Owner and Principal manage comms.

### 3.3 Backfill script

**File:** `packages/prisma/scripts/backfill-communications-permissions.ts` (NEW)

This script:

1. Connects to the dev DB via `PrismaClient` with no RLS context (it runs as a platform-level operator, like the existing `sync-missing-permissions.ts`).
2. Fetches the platform-level `permissions` table for the two new keys. Throws if either is missing — the user must run `sync-missing-permissions.ts` first to make them exist (the canonical seed only runs on fresh tenants; existing dev DBs need the sync script to materialise new permission rows).
3. Fetches the 5 known tenants by **slug** (`nhqs`, `stress-a`, `stress-b`, `stress-c`, `stress-d`). UUIDs differ per environment so we never hardcode them.
4. For each tenant: opens an interactive transaction, sets RLS context for that tenant, finds the `school_owner` and `school_principal` rows for the tenant, inserts the role-permission rows with `ON CONFLICT DO NOTHING`. Logs every grant added.
5. Exits 0 on success, 1 on any failure.

Idempotency is guaranteed by `ON CONFLICT DO NOTHING` on the `(role_id, permission_id)` composite primary key.

Note about `school_owner`: in this codebase `school_owner` is a platform-level role created with `tenant_id = NULL` AND has a per-tenant counterpart created when a tenant is provisioned. The role rows for `school_owner` may live with `tenant_id = NULL` (the platform sentinel) or with `tenant_id = <tenant_id>` (the tenant's own copy). The backfill must handle both cases. We use `OR tenant_id IS NULL` when the role_key is `school_owner` to catch both shapes; for `school_principal` we always require `tenant_id = <tenant_id>`. This mirrors the dual-handling in `grant-leave-manage-types-permission.ts`.

Full source:

```typescript
/**
 * Idempotent backfill: grant `configuration.communications.view` and
 * `configuration.communications.manage` to the `school_owner` and
 * `school_principal` system roles on every known test tenant in the local
 * dev DB.
 *
 * Context: Communications Overhaul Impl 02 introduces two new permission
 * constants in `packages/shared/src/constants/permissions.ts`. The seed
 * files (`packages/prisma/seed/permissions.ts`, `seed/system-roles.ts`)
 * have been updated so newly-provisioned tenants receive them by default.
 * Existing tenants — NHQS plus the four stress tenants — never re-run
 * the seed, so we backfill them via this one-shot script.
 *
 * Run order:
 *   1. `npx tsx packages/prisma/scripts/sync-missing-permissions.ts`
 *      — materialises the two new permission rows in `permissions`.
 *   2. `pnpm backfill:comms-permissions` — this script.
 *
 * Idempotent: `ON CONFLICT DO NOTHING` on the (role_id, permission_id)
 * composite PK. Re-running is a no-op.
 *
 * Production cutover: this same script is what the user runs after
 * merging the worktree to main. Until then, do NOT execute against
 * production — Rule 16 of IMPLEMENTATION_LOG.md.
 *
 * Usage (local dev DB):
 *   pnpm backfill:comms-permissions
 * Or directly:
 *   npx tsx packages/prisma/scripts/backfill-communications-permissions.ts
 */
/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const TENANT_SLUGS = ['nhqs', 'stress-a', 'stress-b', 'stress-c', 'stress-d'] as const;

const TARGET_ROLES = ['school_owner', 'school_principal'] as const;

const PERMISSIONS_TO_GRANT = [
  'configuration.communications.view',
  'configuration.communications.manage',
] as const;

const SYSTEM_SENTINEL_UUID = '00000000-0000-0000-0000-000000000000';

interface TenantRow {
  id: string;
  slug: string;
}

interface RoleRow {
  id: string;
  tenant_id: string | null;
  role_key: string;
}

interface PermissionRow {
  id: string;
  permission_key: string;
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
  }

  const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });

  let totalGrantsAdded = 0;
  let totalGrantsSkipped = 0;
  let tenantsProcessed = 0;

  try {
    // ─── Step 1: load the two permission rows once (they're platform-level) ─────
    const permissions = await prisma.$queryRaw<PermissionRow[]>`
      SELECT id, permission_key
      FROM permissions
      WHERE permission_key = ANY(${[...PERMISSIONS_TO_GRANT]}::text[])
    `;

    if (permissions.length < PERMISSIONS_TO_GRANT.length) {
      const missing = PERMISSIONS_TO_GRANT.filter(
        (k) => !permissions.find((p) => p.permission_key === k),
      );
      throw new Error(
        `Missing permission row(s) in DB: ${missing.join(', ')}. ` +
          `Run sync-missing-permissions.ts first to materialise them.`,
      );
    }

    const permByKey = new Map<string, PermissionRow>(permissions.map((p) => [p.permission_key, p]));

    console.log(
      `Resolved ${permissions.length} permission row(s): ${permissions
        .map((p) => p.permission_key)
        .join(', ')}`,
    );

    // ─── Step 2: resolve tenant IDs by slug ────────────────────────────────────
    const tenants = await prisma.$queryRaw<TenantRow[]>`
      SELECT id, slug
      FROM tenants
      WHERE slug = ANY(${[...TENANT_SLUGS]}::text[])
      ORDER BY slug
    `;

    if (tenants.length === 0) {
      console.warn(
        `No tenants matched ${TENANT_SLUGS.join(', ')} — local dev DB may be ` +
          'missing the test tenants. Did you run the seed?',
      );
    }

    const foundSlugs = new Set(tenants.map((t) => t.slug));
    for (const slug of TENANT_SLUGS) {
      if (!foundSlugs.has(slug)) {
        console.warn(`  [skip] tenant slug='${slug}' not found in local DB`);
      }
    }

    // ─── Step 3: per-tenant grant ──────────────────────────────────────────────
    for (const tenant of tenants) {
      console.log(`\n[tenant=${tenant.slug}, id=${tenant.id}] processing…`);

      let tenantGrantsAdded = 0;
      let tenantGrantsSkipped = 0;

      await prisma.$transaction(async (tx) => {
        // RLS context — `roles` and `role_permissions` are tenant-scoped at the
        // DB layer, so we set the GUC inside the interactive transaction. This
        // matches the pattern used by grant-leave-manage-types-permission.ts.
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_user_id', '${SYSTEM_SENTINEL_UUID}', true)`,
        );
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', '${tenant.id}', true)`,
        );
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_membership_id', '${SYSTEM_SENTINEL_UUID}', true)`,
        );

        // For each target role: look up rows that are either (a) tenant-scoped
        // to this tenant or (b) the platform-level sentinel (only school_owner
        // is allowed to live with tenant_id = NULL).
        const roleRows = await tx.$queryRaw<RoleRow[]>`
          SELECT id, tenant_id, role_key
          FROM roles
          WHERE role_key = ANY(${[...TARGET_ROLES]}::text[])
            AND (
              tenant_id = ${tenant.id}::uuid
              OR (role_key = 'school_owner' AND tenant_id IS NULL)
            )
        `;

        if (roleRows.length === 0) {
          console.log(`  [tenant=${tenant.slug}] no Owner/Principal roles found — skipping`);
          return;
        }

        for (const role of roleRows) {
          for (const permKey of PERMISSIONS_TO_GRANT) {
            const perm = permByKey.get(permKey);
            if (!perm) {
              throw new Error(`permission row missing for key=${permKey}`);
            }

            // role_permissions.tenant_id is nullable; mirror the role's own
            // tenant_id so platform-level role_permissions live with NULL too.
            let inserted = 0;
            if (role.tenant_id !== null) {
              inserted = await tx.$executeRaw`
                INSERT INTO role_permissions (role_id, permission_id, tenant_id)
                VALUES (${role.id}::uuid, ${perm.id}::uuid, ${role.tenant_id}::uuid)
                ON CONFLICT DO NOTHING
              `;
            } else {
              inserted = await tx.$executeRaw`
                INSERT INTO role_permissions (role_id, permission_id, tenant_id)
                VALUES (${role.id}::uuid, ${perm.id}::uuid, NULL)
                ON CONFLICT DO NOTHING
              `;
            }

            if (inserted === 1) {
              tenantGrantsAdded += 1;
              console.log(
                `  [grant] ${role.role_key} (role_id=${role.id.slice(0, 8)}…) ← ${permKey}`,
              );
            } else {
              tenantGrantsSkipped += 1;
            }
          }
        }
      });

      console.log(
        `[tenant=${tenant.slug}] +${tenantGrantsAdded} grant(s) added, ` +
          `${tenantGrantsSkipped} already present`,
      );
      totalGrantsAdded += tenantGrantsAdded;
      totalGrantsSkipped += tenantGrantsSkipped;
      tenantsProcessed += 1;
    }

    // ─── Summary ───────────────────────────────────────────────────────────────
    console.log('\n──────────────────────────────────────────────');
    console.log(`Tenants processed:    ${tenantsProcessed} / ${TENANT_SLUGS.length}`);
    console.log(`Total grants added:   ${totalGrantsAdded}`);
    console.log(`Total grants skipped: ${totalGrantsSkipped} (already present)`);
    console.log('──────────────────────────────────────────────');
    console.log('Done.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
```

#### Why we look up tenants by slug, not UUID

UUIDs differ per environment. The dev DB you have on disk right now has different tenant UUIDs from production, from a freshly-seeded teammate's DB, and from any future migration target. Slugs are stable across environments — `nhqs`, `stress-a`, etc. are the same string everywhere. Hardcoding UUIDs would make the script unusable in any other environment, including the eventual production cutover.

#### Why `OR (role_key = 'school_owner' AND tenant_id IS NULL)`

The `school_owner` role is created at platform level (no tenant) AND can also have per-tenant copies. The grant must reach both shapes — the platform-level row covers cross-tenant ownership semantics, the per-tenant row covers tenants that have their own copy. `school_principal` is always tenant-scoped. This dual-handling matches `grant-leave-manage-types-permission.ts:84-108`.

### 3.4 npm script registration

**File:** `packages/prisma/package.json`

Add inside the existing `"scripts"` block, alphabetically between `migrate:deploy` and `seed`:

```json
"backfill:comms-permissions": "tsx scripts/backfill-communications-permissions.ts",
```

We register it on the `@school/prisma` package (where the script lives) rather than at the monorepo root, mirroring how `seed:school-data`, `seed:qa-mdad` etc. live on `@school/prisma`. The full invocation from the repo root is:

```bash
pnpm --filter @school/prisma backfill:comms-permissions
```

For convenience, you may ALSO add a root-level alias in `package.json` (the monorepo root):

```json
"backfill:comms-permissions": "pnpm --filter @school/prisma backfill:comms-permissions",
```

Alphabetically slot it next to `db:migrate`, `db:seed`, etc. Either path works — the working session can choose.

### 3.5 Run the backfill

After the seed + script changes are committed, the executing session runs the backfill against the local dev DB:

```bash
# (1) Make the new permission rows exist in the dev DB
npx tsx packages/prisma/scripts/sync-missing-permissions.ts

# (2) Backfill the role mappings on the 5 test tenants
pnpm backfill:comms-permissions
# or, if no root alias was added:
# pnpm --filter @school/prisma backfill:comms-permissions
```

Expected log output (abbreviated):

```
Resolved 2 permission row(s): configuration.communications.view, configuration.communications.manage

[tenant=nhqs, id=…] processing…
  [grant] school_owner (role_id=…) ← configuration.communications.view
  [grant] school_owner (role_id=…) ← configuration.communications.manage
  [grant] school_principal (role_id=…) ← configuration.communications.view
  [grant] school_principal (role_id=…) ← configuration.communications.manage
[tenant=nhqs] +4 grant(s) added, 0 already present

[tenant=stress-a, id=…] processing…
… (same pattern, 4 grants per tenant)

──────────────────────────────────────────────
Tenants processed:    5 / 5
Total grants added:   20
Total grants skipped: 0 (already present)
──────────────────────────────────────────────
Done.
```

(Note: 4 grants per tenant = 2 roles × 2 permissions = 4 `role_permission` rows inserted. With `school_owner` having both a platform-level row AND a per-tenant row in some environments, the count may be 6 per tenant. On the local dev DB the actual number depends on how the seed wired the roles — anywhere between 4 and 6 grants per tenant is correct.)

A second run of the backfill should produce:

```
Total grants added:   0
Total grants skipped: 20 (already present)
```

That's the idempotency invariant proven on the wire.

---

## Tests

### Unit test — backfill script with mock prisma

**File:** `packages/prisma/scripts/backfill-communications-permissions.spec.ts` (NEW)

Verify the script logic with a mock `PrismaClient` that returns canned responses. Two scenarios:

1. **First run** — no role_permission rows exist → 4 grants inserted per tenant.
2. **Second run** — `ON CONFLICT DO NOTHING` returns `0` for every insert → 0 grants added, all skipped.

The mock `PrismaClient` substitutes `$queryRaw` and `$executeRaw` with `jest.fn()`s that return the canned rows. The transaction wrapper passes through. We verify:

- The exact `permission_key = ANY(...)` query is issued with both keys.
- The exact `slug = ANY(...)` query is issued with all 5 slugs.
- `set_config('app.current_tenant_id', ...)` is invoked once per tenant.
- The role lookup query carries `role_key = ANY(...)` with both target roles.
- `INSERT INTO role_permissions` is invoked exactly `roles.length × permissions.length` times per tenant.
- Re-running with the mock returning `0` from inserts produces no errors.

The script as written reads `process.env.DATABASE_URL` and instantiates a real `PrismaClient`. To keep the test isolated, the script should be lightly refactored to allow injection: extract the body of `main()` into an exported `runBackfill(prisma: PrismaClient)` function and have `main()` instantiate the client and call it. The test imports `runBackfill` and passes a mock.

### Integration test — fresh tenant + backfill round-trip

**File:** `apps/api/test/comms-permissions-backfill.integration.spec.ts` (NEW, but optional if the time budget is tight — the unit test plus the local dev-server run are sufficient evidence)

Inside an isolated test DB:

1. Seed a fresh tenant with slug `nhqs-test-comms` via the same path the canonical seed uses.
2. Confirm the `school_owner` and `school_principal` rows for that tenant exist but DO NOT yet carry the new permissions (simulating a tenant created before the seed change shipped).
3. Run the backfill script's `runBackfill(prisma)` function pointed at this tenant.
4. Query `role_permissions` joined to `permissions` and `roles` for the new tenant — assert both new permission keys are now present on both `school_owner` and `school_principal`.
5. Run the backfill again — assert no duplicate rows, no errors.

Because the local dev verification (§4 below) already exercises the same end-to-end path against real data on real role records, this integration test is nice-to-have rather than mandatory. If skipped, leave a comment in the unit test pointing to the live verification.

### Existing-suite regression check

Before committing:

```bash
pnpm --filter @school/shared run test
pnpm --filter @school/prisma run test
pnpm --filter @school/api run test --testPathPattern='rbac|permissions'
```

The `permissions.controller.spec.ts` and `roles.service.spec.ts` files in `apps/api/src/modules/rbac/` may import from `packages/shared/src/constants/permissions.ts`. Adding new keys is additive — existing tests should keep passing. If any test enumerates permission keys exhaustively (looking for `expect(allKeys).toHaveLength(N)` patterns), update the count.

---

## Verification (local dev server)

Local dev server testing only — no CI, no production (per Rule 5 of `IMPLEMENTATION_LOG.md`). Sequence:

### Step 1 — Type-check + lint

```bash
pnpm turbo run type-check --filter='@school/shared' --filter='@school/prisma'
pnpm turbo run lint --filter='@school/shared' --filter='@school/prisma'
```

Both must pass clean.

### Step 2 — Run the backfill against the local dev DB

```bash
# Materialise new permission rows
npx tsx packages/prisma/scripts/sync-missing-permissions.ts

# Run the backfill
pnpm backfill:comms-permissions
```

Capture the output. Confirm grants land on every test tenant.

### Step 3 — Direct DB query

Connect to the local dev DB (`psql $DATABASE_URL`) and run:

```sql
SELECT
  t.slug,
  r.role_key,
  p.permission_key
FROM role_permissions rp
JOIN permissions p ON rp.permission_id = p.id
JOIN roles r ON rp.role_id = r.id
LEFT JOIN tenants t ON rp.tenant_id = t.id
WHERE p.permission_key IN (
  'configuration.communications.view',
  'configuration.communications.manage'
)
ORDER BY t.slug NULLS LAST, r.role_key, p.permission_key;
```

Expected: at least 20 rows — 5 tenants × 2 roles × 2 permissions. If the platform-level `school_owner` row also picks up the grant, you may see additional rows with `t.slug = NULL` and `r.role_key = 'school_owner'`. Anything between 20 and 30 rows total is correct depending on how `school_owner` is wired in the local DB.

Aggregate count check:

```sql
SELECT COUNT(*)
FROM role_permissions rp
JOIN permissions p ON rp.permission_id = p.id
JOIN roles r ON rp.role_id = r.id
WHERE p.permission_key IN (
  'configuration.communications.view',
  'configuration.communications.manage'
)
  AND r.role_key IN ('school_owner', 'school_principal');
```

Should be ≥ 20. (The user-prompt math `5 × 2 × 2 = 20` is the lower bound; reality may be higher due to platform-level `school_owner` rows.)

### Step 4 — Idempotency check

Re-run `pnpm backfill:comms-permissions`. Output should report `Total grants added: 0`. If any grant lands on the second run, the script is non-idempotent — fix before committing.

### Step 5 — Login + `/api/v1/me/permissions`

Restart the API:

```bash
pnpm --filter @school/api dev
```

Authenticate as `owner@nhqs.test` (password from `MEMORY.md` reference: `Password123!`). Hit:

```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:3001/api/v1/me/permissions \
  | jq '.[] | select(. == "configuration.communications.view" or . == "configuration.communications.manage")'
```

Expected output:

```
"configuration.communications.view"
"configuration.communications.manage"
```

If the keys are missing, the API may have a permission cache that needs invalidation — restart the API process to flush. (The architecture comment about a permission cache is informational; on a fresh dev server restart the keys appear immediately.)

Repeat the check for `principal@nhqs.test`. Optionally spot-check one stress tenant (e.g., `owner@stress-a.test`).

### Step 6 — Negative check

Authenticate as `teacher@nhqs.test` (or any non-Owner non-Principal user). Hit `/api/v1/me/permissions` and grep for the new keys — they MUST NOT appear. This proves the backfill did not over-grant.

```bash
curl -H "Authorization: Bearer $TOKEN_TEACHER" \
  http://localhost:3001/api/v1/me/permissions \
  | jq 'map(select(. == "configuration.communications.view" or . == "configuration.communications.manage"))'
```

Expected: `[]`.

---

## Files touched

| Path                                                                  | Change                                                                |
| --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `packages/shared/src/constants/permissions.ts`                        | + `configuration.communications_view` / `..._manage` in `PERMISSIONS` |
| `packages/shared/src/constants/permissions.ts`                        | + tier mapping (admin, admin) in `PERMISSION_TIER_MAP`                |
| `packages/shared/src/constants/permissions.ts`                        | + grants in `SYSTEM_ROLE_PERMISSIONS.school_owner`                    |
| `packages/prisma/seed/permissions.ts`                                 | + 2 entries in `PERMISSION_SEEDS`                                     |
| `packages/prisma/seed/system-roles.ts`                                | + 2 strings in `school_owner.default_permissions`                     |
| `packages/prisma/seed/system-roles.ts`                                | + 2 strings in `school_principal.default_permissions`                 |
| `packages/prisma/scripts/backfill-communications-permissions.ts`      | NEW — the backfill script                                             |
| `packages/prisma/scripts/backfill-communications-permissions.spec.ts` | NEW — unit test with mock prisma                                      |
| `packages/prisma/package.json`                                        | + `"backfill:comms-permissions"` script entry                         |
| `package.json` (repo root, optional)                                  | + `"backfill:comms-permissions"` alias                                |

No schema changes. No migration. No frontend. No worker. No new endpoints. No new module imports.

---

## Rollback

This implementation has three reversible layers. Reverse them in this order:

### 1. Undo the backfill (delete the inserted role_permission rows)

```sql
DELETE FROM role_permissions
WHERE permission_id IN (
  SELECT id FROM permissions
  WHERE permission_key IN (
    'configuration.communications.view',
    'configuration.communications.manage'
  )
);
```

This removes ONLY the role-permission grants — the permission rows themselves stay (orthogonal). Safe because no service code yet checks these permissions (Impl 03 introduces the controllers; until then the keys are inert).

### 2. Optionally remove the permission rows

```sql
DELETE FROM permissions
WHERE permission_key IN (
  'configuration.communications.view',
  'configuration.communications.manage'
);
```

Only run this if you also reverted the seed code (step 3). Otherwise the next seed run will re-create them.

### 3. Revert the code

```bash
git revert <commit-sha-for-impl-02>
```

This undoes the changes to `permissions.ts` (shared), `permissions.ts` (seed), `system-roles.ts` (seed), `package.json`, and removes the new backfill script + spec from the working tree.

### Verifying the rollback

```sql
SELECT COUNT(*)
FROM role_permissions rp
JOIN permissions p ON rp.permission_id = p.id
WHERE p.permission_key IN (
  'configuration.communications.view',
  'configuration.communications.manage'
);
```

Should return `0`.

```sql
SELECT permission_key
FROM permissions
WHERE permission_key LIKE 'configuration.communications.%';
```

Should return zero rows (after step 2) or two rows (if step 2 was skipped — harmless).

```bash
pnpm --filter @school/api dev
# Hit /api/v1/me/permissions as owner@nhqs.test — neither new key should appear
```

### Rollback never needed mid-rebuild

In practice this rebuild does not roll back individual implementations — the entire `communications-overhaul` worktree is the rollback unit. If the rebuild is abandoned, the user discards the worktree branch and the local dev DB rows can be cleared with the SQL above. The script + permission rows are isolated enough that no other implementation depends on them being present except Impl 03 (which adds the controllers that gate on these keys), Impl 11 (frontend), and Impl 13 (tenant backfill — which uses the same dev credentials path but does not read these permission rows directly).

---

## Key invariants — must hold after this phase ships

1. **Idempotent**: running the backfill N times produces the same DB state. Every insert uses `ON CONFLICT DO NOTHING` on the `(role_id, permission_id)` composite primary key.
2. **Scope-bounded**: the backfill never touches roles other than `school_owner` and `school_principal`. The `WHERE role_key = ANY(...)` clause is the only role filter; the `TARGET_ROLES` constant is the source of truth and is two strings, not three.
3. **Tenant-bounded**: the backfill never touches role-permission rows for tenants outside the `TENANT_SLUGS` allowlist. The `WHERE slug = ANY(...)` query gates this.
4. **Slug-keyed lookup**: tenant resolution goes through the `tenants.slug` column, never a hardcoded UUID. The script is portable across environments because of this.
5. **Auditable**: every grant insertion logs to stdout with the role_key, role_id (truncated), and permission_key. The full output is the audit trail for a manual review of what landed.
6. **Permission-row prerequisite**: if the two new `permissions` rows do not exist in the DB, the script fails fast with an instructive error pointing to `sync-missing-permissions.ts`. It does NOT silently skip.
7. **Two paths covered**: (a) the seed update covers freshly-provisioned tenants automatically when `pnpm --filter @school/prisma seed` runs; (b) the backfill covers existing tenants. Both must be kept in sync — if a future change adds a third comms permission, both paths get updated together.
8. **Production-safe by neglect**: the script does not attempt to discover production tenants, does not authenticate against any remote DB, and reads only `process.env.DATABASE_URL` from the local environment. Running it accidentally against production would require explicitly setting that env var to a production connection string — which Rule 16 of `IMPLEMENTATION_LOG.md` explicitly forbids during the rebuild.

---

## Notes for subsequent waves

- **Impl 03** (`EmailConfigController`, `SmsConfigController`, `WhatsAppConfigController`) gates every endpoint behind `@RequiresPermission('configuration.communications.manage')`. The string literal must match `PERMISSIONS.configuration.communications_manage`. If Impl 03 chooses to differentiate read vs write (GET vs PUT), it can use `..._view` for GETs.
- **Impl 11** (Frontend Settings UI) reads `/api/v1/me/permissions` and conditionally renders the `Settings → Communications` nav entry based on presence of `configuration.communications.view`. The action buttons (Save, Test send, Delete) gate on `configuration.communications.manage`.
- **Impl 13** (Tenant backfill of credential configs) does not read these permission rows directly — it runs as a platform script and bypasses the controller layer. But it produces `email_config` / `sms_config` / `whatsapp_config` rows that the Settings UI later renders, and the UI gating depends on Impl 02 having shipped.
- **Production cutover**: when the user merges `communications-overhaul` to main, the same backfill script is what unblocks production tenants. The user runs it manually via SSH once on production after the deploy. The seed change covers any tenants created post-merge automatically.

---

## Completion record template (fill in §5 of `IMPLEMENTATION_LOG.md` when done)

```
### [IMPL 02] — Permissions, RBAC seed, and backfill
- **Completed:** <ISO timestamp> (Europe/Dublin)
- **Local commit SHA:** <sha>
- **Deployment route:** worktree commit only — NO CI, NO PRODUCTION
- **Verified at:** <ISO timestamp> on local dev server
- **Local verification:**
  - sync-missing-permissions.ts run → 2 permission rows materialised
  - backfill:comms-permissions run → N grants added across 5 tenants
  - Direct SQL count: <N> rows for the new keys × Owner/Principal roles
  - Idempotency check: re-run → 0 grants added
  - Login owner@nhqs.test → /api/v1/me/permissions returns both keys
  - Login teacher@nhqs.test → neither key present (negative check passed)
- **Summary:** Added two new permission constants
  (`configuration.communications.view`, `configuration.communications.manage`)
  to `packages/shared/src/constants/permissions.ts`. Updated
  `packages/prisma/seed/permissions.ts` and `seed/system-roles.ts` so newly-
  provisioned tenants receive both keys on `school_owner` + `school_principal`.
  Wrote one-shot idempotent backfill script
  `packages/prisma/scripts/backfill-communications-permissions.ts` that grants
  both keys to every existing Owner/Principal role across NHQS + stress-a/b/c/d.
  Registered `pnpm backfill:comms-permissions` script alias.
  Tenants resolved by slug (not UUID) so the script ports cleanly to production
  cutover.
- **Follow-ups:**
  - Impl 03 controllers must use the matching literal strings.
  - Impl 11 frontend must read these keys for nav gating.
  - Production cutover (post-merge): user runs the same backfill once on
    production via SSH. Until then, do NOT run against production (Rule 16).
- **Rollback:** see §Rollback in this spec — three-step reverse (DELETE
  role_permissions, optionally DELETE permissions, `git revert <sha>`).
```
