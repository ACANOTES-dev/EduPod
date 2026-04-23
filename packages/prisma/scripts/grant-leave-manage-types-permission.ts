/**
 * Backfill script: grant `leave.manage_types` to the standard admin role set.
 *
 * Root cause (Category C gap — 2026-04-23): the initial leave-module seed only
 * registered `leave.submit_request` and `leave.approve_requests`. The new
 * `/settings/leave-types` UI introduces `leave.manage_types` — existing tenants
 * would not have it on any role until this grant runs.
 *
 * This script is idempotent — `ON CONFLICT DO NOTHING` on the role_permissions
 * composite primary key. Safe to re-run. Run AFTER
 * `sync-missing-permissions.ts` so the permission row itself exists.
 *
 * Usage:
 *   cd /opt/edupod/app && set -a; source /opt/edupod/app/.env; set +a && \
 *     npx tsx packages/prisma/scripts/grant-leave-manage-types-permission.ts
 */
/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

interface Grant {
  role_key: string;
  permissions: string[];
}

const GRANTS: Grant[] = [
  { role_key: 'school_owner', permissions: ['leave.manage_types'] },
  { role_key: 'school_principal', permissions: ['leave.manage_types'] },
  { role_key: 'admin', permissions: ['leave.manage_types'] },
];

interface RoleRow {
  id: string;
  tenant_id: string | null;
  role_key: string;
}

interface PermissionRow {
  id: string;
  permission_key: string;
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const tenantIds = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM tenants
    `;

    const allPermissions = [...new Set(GRANTS.flatMap((g) => g.permissions))];

    const scopes: Array<{ tenant_id: string | null; label: string }> = [
      { tenant_id: null, label: 'platform' },
      ...tenantIds.map((t) => ({ tenant_id: t.id, label: t.id })),
    ];

    for (const scope of scopes) {
      await prisma.$transaction(async (tx) => {
        const ctxTenantId = scope.tenant_id ?? '00000000-0000-0000-0000-000000000000';
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_user_id', '00000000-0000-0000-0000-000000000000', true)`,
        );
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_tenant_id', '${ctxTenantId}', true)`,
        );
        await tx.$executeRawUnsafe(
          `SELECT set_config('app.current_membership_id', '00000000-0000-0000-0000-000000000000', true)`,
        );

        const permissions = await tx.$queryRaw<PermissionRow[]>`
          SELECT id, permission_key FROM permissions WHERE permission_key = ANY(${allPermissions}::text[])
        `;
        if (permissions.length < allPermissions.length && scope.tenant_id === null) {
          const missing = allPermissions.filter(
            (k) => !permissions.find((p) => p.permission_key === k),
          );
          throw new Error(
            `Missing permissions in DB: ${missing.join(', ')}. Run sync-missing-permissions first.`,
          );
        }
        const permByKey = new Map(permissions.map((p) => [p.permission_key, p]));

        for (const grant of GRANTS) {
          const isPlatform = scope.tenant_id === null;
          const isSchoolOwnerGrant = grant.role_key === 'school_owner';
          if (isPlatform !== isSchoolOwnerGrant) continue;

          const roles = await tx.$queryRaw<RoleRow[]>`
            SELECT id, tenant_id, role_key FROM roles WHERE role_key = ${grant.role_key}
          `;
          if (roles.length === 0) continue;

          for (const role of roles) {
            for (const key of grant.permissions) {
              const perm = permByKey.get(key);
              if (!perm) continue;
              if (role.tenant_id) {
                await tx.$executeRaw`
                  INSERT INTO role_permissions (role_id, permission_id, tenant_id)
                  VALUES (${role.id}::uuid, ${perm.id}::uuid, ${role.tenant_id}::uuid)
                  ON CONFLICT DO NOTHING
                `;
              } else {
                await tx.$executeRaw`
                  INSERT INTO role_permissions (role_id, permission_id, tenant_id)
                  VALUES (${role.id}::uuid, ${perm.id}::uuid, NULL)
                  ON CONFLICT DO NOTHING
                `;
              }
            }
            console.log(
              `  [${scope.label}] ${role.role_key}: granted ${grant.permissions.length} permission(s)`,
            );
          }
        }
      });
    }

    console.log('done.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
