# Implementation 05 — Parent permission backfill

> **Wave:** 3 (parallel-safe with Impl 04 — different file zones, no overlap)
> **Classification:** data
> **Depends on:** 01
> **Deploys:** Prisma script run on production only — no service restart

---

## Goal

Backfill the `parent.view_engagement` and `parent.manage_engagement` permissions onto the parent role at every tenant where they are missing, and update the role-permission seed file so future tenants get them by default. Without this, the entire parent-facing engagement portal returns 403 — confirmed at NHQS during the 2026-04-25 audit:

> Toast: "Missing required permission: parent.view_engagement" (×2)

The audit also surfaced parallel gaps for `parent.homework`, `parent.view_finances`, and `homework.view_diary`. Those are NOT in scope for this impl — they get a single-line follow-up note in the completion record so they're visible to whoever picks them up later.

After this impl ships:

- `parent@nhqs.test` logging in sees zero "Missing required permission: parent.view_engagement / parent.manage_engagement" toasts.
- `/engagement/parent/events` loads without 403.
- Parents can register / withdraw their child for an open event end-to-end.
- New tenants created from this point forward get these permissions on the parent role automatically.

## Shared files this impl touches

- `packages/prisma/scripts/backfill-parent-engagement-permissions.ts` — NEW idempotent backfill script.
- `packages/prisma/seed/role-permissions.ts` (or wherever the role-permission seed lives — verify by reading `packages/prisma/seed/` and `packages/prisma/scripts/`) — adds the two permissions to the parent role definition for new tenants.
- `IMPLEMENTATION_LOG.md` — status flips + completion record. Always in a separate commit.

**No `apps/web` or `apps/api` changes.** This is a pure data-layer impl.

## What to build

### Sub-step 1: Identify the seed file

Read `packages/prisma/seed/` and `packages/prisma/scripts/` to find where role permissions are defined for new tenants. Likely candidates:

- `packages/prisma/seed/index.ts`
- `packages/prisma/seed/role-permissions.ts`
- `packages/prisma/seed/seed-tenant.ts`
- `packages/prisma/scripts/seed-default-roles.ts`

The file we're looking for defines what permissions each role (parent, teacher, school_principal, etc.) starts with when a new tenant is provisioned. Read the actual content to confirm before editing.

### Sub-step 2: Write the backfill script

Create `packages/prisma/scripts/backfill-parent-engagement-permissions.ts`:

```ts
/**
 * Idempotent backfill: add `parent.view_engagement` and `parent.manage_engagement`
 * to the `parent` role at every tenant that doesn't already have them.
 *
 * Triggered manually after the engagement-fix Impl 05 ships:
 *
 *   pnpm --filter @school/prisma tsx scripts/backfill-parent-engagement-permissions.ts
 *
 * Safe to re-run — does nothing for tenants that already have the permissions.
 *
 * Context: the parent role at NHQS (and likely other tenants) was provisioned
 * before the engagement module's parent permissions were added to the default
 * seed. This script catches up the existing tenants. The seed file is updated
 * in the same impl so newly-provisioned tenants get them by default.
 */

import { PrismaClient } from '@prisma/client';

const PERMISSIONS_TO_ADD = ['parent.view_engagement', 'parent.manage_engagement'] as const;

async function main() {
  const prisma = new PrismaClient();

  try {
    // Find every tenant that has a `parent` role.
    const parentRoles = await prisma.role.findMany({
      where: { name: 'parent' },
      select: { id: true, tenant_id: true, name: true },
    });

    console.log(`Found ${parentRoles.length} parent roles across tenants.`);

    let added = 0;
    let skipped = 0;

    for (const role of parentRoles) {
      // Read the existing permissions on this role.
      const existing = await prisma.rolePermission.findMany({
        where: {
          role_id: role.id,
          permission: { in: [...PERMISSIONS_TO_ADD] },
        },
        select: { permission: true },
      });

      const existingSet = new Set(existing.map((rp) => rp.permission));
      const missing = PERMISSIONS_TO_ADD.filter((p) => !existingSet.has(p));

      if (missing.length === 0) {
        skipped += 1;
        continue;
      }

      // Add the missing permissions.
      await prisma.rolePermission.createMany({
        data: missing.map((permission) => ({
          tenant_id: role.tenant_id,
          role_id: role.id,
          permission,
        })),
        skipDuplicates: true,
      });

      console.log(
        `[tenant=${role.tenant_id}] added ${missing.length} permission(s) to parent role: ${missing.join(', ')}`,
      );
      added += 1;
    }

    console.log(`Done. ${added} tenant(s) updated, ${skipped} already had the permissions.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
```

**Important assumptions to verify before running:**

- The `Role` table has columns `id`, `tenant_id`, `name`. The parent role's name is the literal string `'parent'`. Verify by querying: `SELECT DISTINCT name FROM roles ORDER BY name;` on the dev or staging database.
- The `RolePermission` table has columns `role_id`, `tenant_id`, `permission`. The unique constraint is on `(role_id, permission)`.
- The permissions are stored as plain dot-separated strings (`parent.view_engagement`), not as a foreign key to a permissions table.

If the actual schema differs (e.g. permissions live in an enum, or in a separate `Permission` model with a join table), adapt the script. The intent is invariant: add the two permissions to the parent role at every tenant where they're missing.

### Sub-step 3: Update the role-permission seed

Open the seed file identified in sub-step 1. Find the parent role definition. It likely looks like:

```ts
const PARENT_PERMISSIONS = [
  'parent.view_dashboard',
  'parent.view_finances',
  'parent.homework',
  // ... etc
] as const;
```

Add the two engagement permissions:

```ts
const PARENT_PERMISSIONS = [
  'parent.view_dashboard',
  'parent.view_finances',
  'parent.homework',
  'parent.view_engagement', // NEW — added by engagement-fix Impl 05
  'parent.manage_engagement', // NEW — added by engagement-fix Impl 05
  // ... etc
] as const;
```

The exact location and format depends on the seed file structure — adapt to whatever it is. The goal is: when a new tenant is provisioned via the standard seed flow, the parent role starts with these two permissions in addition to its existing set.

### Sub-step 4: Local dry-run

Before deploying, run the script locally against a dev database to verify the SQL is correct:

```bash
# Point at dev DB — verify .env DATABASE_URL is local, NOT production
pnpm --filter @school/prisma tsx scripts/backfill-parent-engagement-permissions.ts
```

Expected output: a list of tenant IDs that got the permissions added. If your local dev database has only one tenant and it already has the permissions, the output will be "0 tenant(s) updated, 1 already had the permissions" — which is correct idempotent behaviour, but doesn't actually exercise the add path.

To exercise the add path locally, manually delete the permissions from a test tenant first:

```sql
DELETE FROM role_permissions
WHERE role_id IN (SELECT id FROM roles WHERE tenant_id = 'YOUR_DEV_TENANT_ID' AND name = 'parent')
  AND permission IN ('parent.view_engagement', 'parent.manage_engagement');
```

Then re-run the script and confirm it adds them back.

### Sub-step 5: Production execution

This is the actual deploy step for this impl. Unlike other impls, there's no PM2 restart — the script runs against the live database and the result is immediately visible to any logged-in parent.

```bash
# 1. Rsync the script to production
rsync -avz \
  --exclude='.git' --exclude='node_modules' --exclude='.next' --exclude='dist' \
  --exclude='.env' --exclude='.env.local' --exclude='.turbo' --exclude='*.tsbuildinfo' \
  /Users/ram/Desktop/SDB/packages/prisma/ \
  root@46.62.244.139:/opt/edupod/app/packages/prisma/

# 2. Re-chown to edupod user (CLAUDE.md mandate)
ssh root@46.62.244.139 'chown -R edupod:edupod /opt/edupod/app/packages/prisma/'

# 3. Run the backfill on production
ssh root@46.62.244.139 'sudo -u edupod bash -lc "cd /opt/edupod/app && pnpm --filter @school/prisma tsx scripts/backfill-parent-engagement-permissions.ts"'
```

The script output goes to stdout — capture it for the completion record. Expect one log line per affected tenant.

### Sub-step 6: Production smoke test

Log in as `parent@nhqs.test` (password `Password123!`) at `https://nhqs.edupod.app`:

1. Dashboard → no "Missing required permission: parent.view_engagement" toasts.
2. Click `Open engagement` action centre button → loads `/engagement/parent/events` without 403.
3. (If there is a published event) Click on an event → detail page renders.
4. (If there is a published event with this child as a participant) Click `Register` → request returns 200, status changes.

If any of these still show 403, the script didn't add the right permissions OR the parent role at NHQS uses a different name (`guardian`, `family_account`, etc.) — investigate via DB query.

### Sub-step 7: Update default seed test (optional)

If `packages/prisma/seed/*.spec.ts` exists with tests that assert the default permission set per role, add `parent.view_engagement` and `parent.manage_engagement` to the parent role's expected set. Otherwise no test changes needed.

## Tests

- The backfill script is idempotent and safe — running it twice is a no-op the second time. That's the implicit test.
- If you want a unit test for the script, mock Prisma and verify the `createMany` call has the right `data`. Optional.
- If a default-seed test exists, update it (sub-step 7).

## Watch out for

- **Permission name correctness.** The audit captured the literal toast strings. The codebase enforces `parent.view_engagement` and `parent.manage_engagement` (with underscore). Do NOT add `parent.view-engagement` (hyphen) or `parent.viewEngagement` (camelCase). Grep for `parent.view_engagement` in `apps/api/src/modules/engagement/` to confirm the exact strings.
- **Role name correctness.** NHQS may use `parent`, `guardian`, or some other name. Verify via DB query before running the backfill. The script has `where: { name: 'parent' }` — if the actual name differs, the script silently skips that tenant.
- **Cross-tenant safety.** The script uses `findMany({ where: { name: 'parent' } })` — this returns parent roles across ALL tenants. The subsequent `createMany` is scoped per-tenant via the `tenant_id` field on each row. RLS does NOT apply to this Prisma client because it runs as the system user, not in a tenant transaction. That's intentional — backfills must cross tenant boundaries.
- **Don't bundle seed file edit with backfill script.** Seed file is a separate commit (it affects future tenants). Backfill script + execution is a separate commit (it affects existing tenants). Keep them separable for revertability.
- **The `parent.homework`, `parent.view_finances`, `homework.view_diary` permissions are also missing at NHQS** per the audit. They are OUT OF SCOPE for this impl. Note them in the completion record's follow-ups so they're picked up by their respective module fixes (homework rebuild, finance backfill).
- **No service restart needed.** The change is to the database. Permission checks happen at request time — the next API request from any parent picks up the new permissions automatically.
- **Sibling Impl 04 does NOT touch any of these files.** Wave 3 is parallel-safe.

## Deployment notes

This impl has no PM2 restart. The "deploy" is the one-shot script execution against the production database.

1. Commit locally:
   - Commit 1: `feat(engagement-fix): backfill script for parent.view_engagement permissions` (the script file).
   - Commit 2: `feat(engagement-fix): seed parent role with engagement permissions for new tenants` (the seed file edit).
2. Rsync `packages/prisma/` to production (see sub-step 5).
3. Run the backfill on production (see sub-step 5). Capture the output.
4. **Smoke test (mandatory):**
   - Log in as `parent@nhqs.test` at https://nhqs.edupod.app.
   - Open browser devtools → Network tab.
   - Navigate to `/en/engagement/parent/events`. Observe `GET /api/v1/parent/engagement/events` returns 200, NOT 403.
   - Verify no "Missing required permission: parent.view_engagement" toasts on the dashboard.
5. **Pre-deploy serialisation check (Rule 6b):** N/A — this impl doesn't share any restart target with Impl 04. Wave 3 is parallel-safe.
6. Log flips to `completed` in a separate commit after verification. Include in the completion record:
   - The script output (number of tenants updated).
   - Any tenants that were skipped because they already had the permissions.
   - Confirmation that the seed file was updated for future tenants.
   - Follow-up note about the other missing parent permissions (`parent.homework`, etc.).
