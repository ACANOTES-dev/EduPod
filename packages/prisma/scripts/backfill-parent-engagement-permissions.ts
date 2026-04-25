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
      where: { role_key: 'parent' },
      select: { id: true, tenant_id: true, role_key: true },
    });

    console.log(`Found ${parentRoles.length} parent roles across tenants.`);

    let added = 0;
    let skipped = 0;

    for (const role of parentRoles) {
      // Find the permission IDs for the engagement permissions.
      const engagementPerms = await prisma.permission.findMany({
        where: {
          permission_key: { in: [...PERMISSIONS_TO_ADD] },
        },
        select: { id: true, permission_key: true },
      });

      const permissionMap = new Map(engagementPerms.map((p) => [p.permission_key, p.id]));

      // Read the existing rolePermission entries for this role.
      const existing = await prisma.rolePermission.findMany({
        where: { role_id: role.id },
        select: { permission_id: true },
      });

      const existingPermissionIds = new Set(existing.map((rp) => rp.permission_id));

      // Determine which permissions are missing.
      const missingPerms = PERMISSIONS_TO_ADD.filter(
        (permKey) => !existingPermissionIds.has(permissionMap.get(permKey) as string),
      );

      if (missingPerms.length === 0) {
        skipped += 1;
        continue;
      }

      // Add the missing permissions.
      const dataToCreate = missingPerms.map((permKey) => ({
        tenant_id: role.tenant_id,
        role_id: role.id,
        permission_id: permissionMap.get(permKey) as string,
      }));

      await prisma.rolePermission.createMany({
        data: dataToCreate,
        skipDuplicates: true,
      });

      console.log(
        `[tenant=${role.tenant_id}] added ${missingPerms.length} permission(s) to parent role: ${missingPerms.join(', ')}`,
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
