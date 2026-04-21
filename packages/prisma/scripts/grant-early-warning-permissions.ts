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

async function main() {
  const prisma = new PrismaClient();

  try {
    for (const grant of GRANTS) {
      const roles = await prisma.role.findMany({
        where: { role_key: grant.role_key },
        select: { id: true, tenant_id: true, role_key: true },
      });

      if (roles.length === 0) {
        console.warn(`  [skip] no roles found for role_key="${grant.role_key}"`);
        continue;
      }

      const permissions = await prisma.permission.findMany({
        where: { permission_key: { in: grant.permissions } },
        select: { id: true, permission_key: true },
      });

      if (permissions.length !== grant.permissions.length) {
        const missing = grant.permissions.filter(
          (k) => !permissions.find((p) => p.permission_key === k),
        );
        throw new Error(
          `Missing permissions in DB: ${missing.join(', ')}. Run prisma seed first to register them.`,
        );
      }

      for (const role of roles) {
        for (const perm of permissions) {
          await prisma.$executeRaw`
            INSERT INTO role_permissions (role_id, permission_id, created_at)
            VALUES (${role.id}::uuid, ${perm.id}::uuid, NOW())
            ON CONFLICT DO NOTHING
          `;
        }
        console.log(
          `  [${role.tenant_id ?? 'platform'}] ${role.role_key}: granted ${permissions.length} permission(s)`,
        );
      }
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
