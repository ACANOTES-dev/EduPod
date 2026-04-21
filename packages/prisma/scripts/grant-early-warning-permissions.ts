/**
 * Backfill script: grant early_warning.* permissions to the standard role set.
 *
 * Root cause (W-S6-001 — 2026-04-21): the initial Impl-01 seed for system roles
 * never assigned `early_warning.view`, `early_warning.manage`,
 * `early_warning.acknowledge`, or `early_warning.assign` to any role. Service
 * layer `resolveRoleScope` in `early-warning.service.ts` checks
 * `permissions.includes('early_warning.manage')` to unlock unrestricted reads —
 * with no matching permission on the owner's role, the check returned
 * `{ unrestricted: false, studentIds: [] }` and every read endpoint surfaced
 * an empty dataset to owners, principals, and vice-principals alike.
 *
 * This script is idempotent — it uses `INSERT ... ON CONFLICT DO NOTHING` on
 * the `role_permissions` composite primary key. Safe to re-run.
 *
 * Usage:
 *   cd packages/prisma && DATABASE_URL=<prod> npx ts-node scripts/grant-early-warning-permissions.ts
 */
import { PrismaClient } from '@prisma/client';

interface Grant {
  role_key: string;
  permissions: string[];
}

const GRANTS: Grant[] = [
  {
    role_key: 'school_owner',
    permissions: [
      'early_warning.view',
      'early_warning.manage',
      'early_warning.acknowledge',
      'early_warning.assign',
    ],
  },
  {
    role_key: 'school_principal',
    permissions: [
      'early_warning.view',
      'early_warning.manage',
      'early_warning.acknowledge',
      'early_warning.assign',
    ],
  },
  {
    role_key: 'school_vice_principal',
    permissions: ['early_warning.view', 'early_warning.acknowledge', 'early_warning.assign'],
  },
  {
    role_key: 'admin',
    permissions: ['early_warning.view', 'early_warning.acknowledge', 'early_warning.assign'],
  },
  {
    role_key: 'teacher',
    permissions: ['early_warning.view', 'early_warning.acknowledge'],
  },
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
    // `roles` and `role_permissions` both have FORCE ROW LEVEL SECURITY. With
    // PgBouncer in transaction mode, SET LOCAL inside a transaction is the
    // only reliable way to pin RLS context to a single connection. We iterate
    // every tenant (plus the platform-level NULL case) so the script sees
    // every row.
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
            `Missing permissions in DB: ${missing.join(', ')}. Run prisma seed first to register them.`,
          );
        }
        const permByKey = new Map(permissions.map((p) => [p.permission_key, p]));

        for (const grant of GRANTS) {
          const isPlatform = scope.tenant_id === null;
          const isSchoolOwnerGrant = grant.role_key === 'school_owner';
          if (isPlatform !== isSchoolOwnerGrant) {
            // school_owner is a platform-tier role (tenant_id IS NULL);
            // every other role in GRANTS is tenant-scoped.
            continue;
          }

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
