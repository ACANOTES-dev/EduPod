/**
 * Idempotent backfill: grant `configuration.communications.view` and
 * `configuration.communications.manage` to the `school_owner` and
 * `school_principal` system roles on every known test tenant.
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
 *   2. `pnpm --filter @school/prisma backfill:comms-permissions`
 *      — this script.
 *
 * Idempotent: `ON CONFLICT DO NOTHING` on the (role_id, permission_id)
 * composite PK. Re-running is a no-op.
 *
 * Usage:
 *   pnpm --filter @school/prisma backfill:comms-permissions
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

export interface BackfillResult {
  tenantsProcessed: number;
  totalGrantsAdded: number;
  totalGrantsSkipped: number;
}

/**
 * Pure backfill core — accepts a PrismaClient (or compatible mock) and
 * performs the role-permission grants. Exposed for testability.
 */
export async function runBackfill(prisma: PrismaClient): Promise<BackfillResult> {
  let totalGrantsAdded = 0;
  let totalGrantsSkipped = 0;
  let tenantsProcessed = 0;

  // ─── Step 1: load the two permission rows once (they are platform-level) ─
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

  // ─── Step 2: resolve tenant IDs by slug ─────────────────────────────────
  const tenants = await prisma.$queryRaw<TenantRow[]>`
    SELECT id, slug
    FROM tenants
    WHERE slug = ANY(${[...TENANT_SLUGS]}::text[])
    ORDER BY slug
  `;

  if (tenants.length === 0) {
    console.warn(
      `No tenants matched ${TENANT_SLUGS.join(', ')} — DB may be missing the test tenants.`,
    );
  }

  const foundSlugs = new Set(tenants.map((t) => t.slug));
  for (const slug of TENANT_SLUGS) {
    if (!foundSlugs.has(slug)) {
      console.warn(`  [skip] tenant slug='${slug}' not found in DB`);
    }
  }

  // ─── Step 3: per-tenant grant ───────────────────────────────────────────
  for (const tenant of tenants) {
    console.log(`\n[tenant=${tenant.slug}, id=${tenant.id}] processing…`);

    let tenantGrantsAdded = 0;
    let tenantGrantsSkipped = 0;

    await prisma.$transaction(async (tx) => {
      // RLS context — `roles` and `role_permissions` are tenant-scoped at
      // the DB layer, so we set the GUC inside the interactive transaction.
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

          // role_permissions.tenant_id mirrors the role's own tenant_id —
          // platform-level role_permissions live with NULL too.
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

  // ─── Summary ─────────────────────────────────────────────────────────────
  console.log('\n──────────────────────────────────────────────');
  console.log(`Tenants processed:    ${tenantsProcessed} / ${TENANT_SLUGS.length}`);
  console.log(`Total grants added:   ${totalGrantsAdded}`);
  console.log(`Total grants skipped: ${totalGrantsSkipped} (already present)`);
  console.log('──────────────────────────────────────────────');
  console.log('Done.');

  return { tenantsProcessed, totalGrantsAdded, totalGrantsSkipped };
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
  }

  const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });

  try {
    await runBackfill(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

// Only run main() when executed as a script — not when imported by the spec.
if (require.main === module) {
  main().catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
}
