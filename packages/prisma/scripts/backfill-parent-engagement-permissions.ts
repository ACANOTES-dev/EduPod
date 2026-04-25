/**
 * Idempotent backfill: add `parent.view_engagement` and `parent.manage_engagement`
 * to the `parent` role at every tenant that doesn't already have them.
 *
 * Run AFTER `sync-missing-permissions.ts` so the permission rows themselves exist.
 *
 * Triggered manually after the engagement-fix Impl 05 ships:
 *
 *   cd /opt/edupod/app && set -a; source /opt/edupod/app/.env; set +a && \
 *     npx tsx packages/prisma/scripts/backfill-parent-engagement-permissions.ts
 *
 * Safe to re-run — `ON CONFLICT DO NOTHING` on the role_permissions composite
 * primary key. A second run is a no-op.
 *
 * Context: the parent role at NHQS (and likely other tenants) was provisioned
 * before the engagement module's parent permissions were added to the default
 * seed. This script catches up the existing tenants. The seed file is updated
 * in the same impl so newly-provisioned tenants get them by default.
 *
 * Production uses an RLS-enforced DB role, so the `roles` and `role_permissions`
 * tables are tenant-scoped at the DB layer. We iterate every tenant and set the
 * `app.current_tenant_id` GUC inside a transaction before reading/mutating that
 * tenant's parent role. Setting the GUC inside an interactive transaction is
 * the documented backfill pattern (see grant-leave-manage-types-permission.ts).
 */
/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const PERMISSIONS_TO_ADD = ['parent.view_engagement', 'parent.manage_engagement'] as const;
const PARENT_ROLE_KEY = 'parent';
const SYSTEM_SENTINEL_UUID = '00000000-0000-0000-0000-000000000000';

interface RoleRow {
  id: string;
  tenant_id: string;
  role_key: string;
}

interface PermissionRow {
  id: string;
  permission_key: string;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const tenants = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM tenants ORDER BY id
    `;
    console.log(`Found ${tenants.length} tenant(s) to process.`);

    let updated = 0;
    let skipped = 0;
    let missingParent = 0;

    for (const tenant of tenants) {
      await prisma.$transaction(async (tx) => {
        // Set RLS context for this tenant so the tenant-scoped queries succeed.
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_user_id', '${SYSTEM_SENTINEL_UUID}', true)`,
        );
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', '${tenant.id}', true)`,
        );
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_membership_id', '${SYSTEM_SENTINEL_UUID}', true)`,
        );

        const parentRoles = await tx.$queryRaw<RoleRow[]>`
          SELECT id, tenant_id, role_key
          FROM roles
          WHERE role_key = ${PARENT_ROLE_KEY}
            AND tenant_id = ${tenant.id}::uuid
        `;
        if (parentRoles.length === 0) {
          missingParent += 1;
          console.log(`[tenant=${tenant.id}] no parent role found — skipping.`);
          return;
        }

        const permissions = await tx.$queryRaw<PermissionRow[]>`
          SELECT id, permission_key
          FROM permissions
          WHERE permission_key = ANY(${[...PERMISSIONS_TO_ADD]}::text[])
        `;
        if (permissions.length < PERMISSIONS_TO_ADD.length) {
          const missingKeys = PERMISSIONS_TO_ADD.filter(
            (k) => !permissions.find((p) => p.permission_key === k),
          );
          throw new Error(
            `Missing permission row(s) in DB: ${missingKeys.join(', ')}. ` +
              `Run sync-missing-permissions.ts first.`,
          );
        }

        let tenantAdded = 0;
        for (const role of parentRoles) {
          for (const perm of permissions) {
            const result = await tx.$executeRaw`
              INSERT INTO role_permissions (role_id, permission_id, tenant_id)
              VALUES (${role.id}::uuid, ${perm.id}::uuid, ${role.tenant_id}::uuid)
              ON CONFLICT DO NOTHING
            `;
            tenantAdded += result;
          }
        }

        if (tenantAdded === 0) {
          skipped += 1;
          console.log(
            `[tenant=${tenant.id}] parent role already had ${PERMISSIONS_TO_ADD.join(' + ')}.`,
          );
        } else {
          updated += 1;
          console.log(
            `[tenant=${tenant.id}] added ${tenantAdded} role-permission row(s) to the parent role.`,
          );
        }
      });
    }

    console.log(
      `\nDone. ${updated} tenant(s) updated, ${skipped} already had the permissions, ${missingParent} had no parent role.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
