/**
 * Data migration script: Grant attendance.view_pattern_reports to
 * school_owner, school_principal, and admin roles across all tenants.
 *
 * Run: npx tsx packages/prisma/scripts/grant-attendance-view-pattern-reports.ts
 *
 * Context: the permission was referenced on three /pattern-alerts controller
 * routes but was missing from the seed entirely, leaving those routes
 * functionally dead for every role. The permission has now been added to
 * seed/permissions.ts and seed/system-roles.ts — but since the prod seed is
 * guarded against running in NODE_ENV=production, we need this companion
 * script to sync the permission-to-role assignment into live tenants.
 *
 * Idempotent — safe to re-run.
 */
/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

// Use DATABASE_MIGRATE_URL (BYPASSRLS) so we can see and write role rows
// across every tenant. DATABASE_URL runs under the RLS-bound role and
// would only return platform-scoped rows.
const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });

async function main() {
  const permissionKey = 'attendance.view_pattern_reports';
  const roleKeys = ['school_owner', 'school_principal', 'admin'];

  const permission = await prisma.permission.findFirst({
    where: { permission_key: permissionKey },
  });

  if (!permission) {
    console.log(`Permission '${permissionKey}' not found. Run sync-missing-permissions.ts first.`);
    process.exit(1);
  }

  const roles = await prisma.role.findMany({
    where: { role_key: { in: roleKeys }, is_system_role: true },
    select: { id: true, role_key: true, tenant_id: true },
  });

  console.log(`Found ${roles.length} role records to update across tenants.`);

  let created = 0;
  let skipped = 0;

  for (const role of roles) {
    const existing = await prisma.rolePermission.findFirst({
      where: { role_id: role.id, permission_id: permission.id },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.rolePermission.create({
      data: { role_id: role.id, permission_id: permission.id },
    });
    created++;
    console.log(`  Granted ${permissionKey} to ${role.role_key} (tenant: ${role.tenant_id})`);
  }

  console.log(`Done. Created: ${created}, Skipped (already existed): ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
