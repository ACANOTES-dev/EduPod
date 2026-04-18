/**
 * Step 3 sync script: add `attendance.take_any_class` permission, grant it
 * to existing system roles (school_owner, school_principal, admin) across
 * every tenant, and create the new `attendance_officer` system role for
 * every tenant with its default permission set.
 *
 * Idempotent — safe to re-run.
 *
 * Run: npx tsx packages/prisma/scripts/sync-attendance-take-any-class.ts
 */
/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });

const TAKE_ANY_CLASS_KEY = 'attendance.take_any_class';
const TAKE_ANY_CLASS_DESC =
  'Take attendance for any class in the tenant — intended for dedicated attendance officers and admins who need to cover teachers who are absent';
const HOLDER_ROLES = ['school_owner', 'school_principal', 'admin'];

const ATTENDANCE_OFFICER_KEY = 'attendance_officer';
const ATTENDANCE_OFFICER_NAME = 'Attendance Officer';
const ATTENDANCE_OFFICER_PERMISSIONS = [
  'students.view',
  'attendance.view',
  'attendance.take',
  'attendance.take_any_class',
  'schedule.view_class',
];

async function main() {
  // ─── 1. Ensure the permission exists ───────────────────────────────────────
  const existingPermission = await prisma.permission.findFirst({
    where: { permission_key: TAKE_ANY_CLASS_KEY },
  });

  const permission =
    existingPermission ??
    (await prisma.permission.create({
      data: {
        permission_key: TAKE_ANY_CLASS_KEY,
        description: TAKE_ANY_CLASS_DESC,
        permission_tier: 'admin',
      },
    }));

  console.log(
    existingPermission
      ? `Permission ${TAKE_ANY_CLASS_KEY} already present (id=${permission.id})`
      : `Created permission ${TAKE_ANY_CLASS_KEY} (id=${permission.id})`,
  );

  // ─── 2. Grant to existing holder roles across all tenants ──────────────────
  const holderRoles = await prisma.role.findMany({
    where: { role_key: { in: HOLDER_ROLES }, is_system_role: true },
    select: { id: true, role_key: true, tenant_id: true },
  });
  console.log(
    `Found ${holderRoles.length} holder role rows (${HOLDER_ROLES.join(', ')}) across tenants`,
  );

  let grantsCreated = 0;
  let grantsSkipped = 0;

  for (const role of holderRoles) {
    const existing = await prisma.rolePermission.findFirst({
      where: { role_id: role.id, permission_id: permission.id },
    });
    if (existing) {
      grantsSkipped++;
      continue;
    }
    await prisma.rolePermission.create({
      data: { role_id: role.id, permission_id: permission.id },
    });
    grantsCreated++;
    console.log(`  Granted to ${role.role_key} in tenant ${role.tenant_id}`);
  }
  console.log(`Grants created: ${grantsCreated}, skipped: ${grantsSkipped}`);

  // ─── 3. Create the attendance_officer role for every tenant ───────────────
  const tenants = await prisma.tenant.findMany({
    where: { status: 'active' },
    select: { id: true, name: true },
  });
  console.log(`Processing ${tenants.length} active tenants for attendance_officer role...`);

  const officerPermissions = await prisma.permission.findMany({
    where: { permission_key: { in: ATTENDANCE_OFFICER_PERMISSIONS } },
    select: { id: true, permission_key: true },
  });
  if (officerPermissions.length !== ATTENDANCE_OFFICER_PERMISSIONS.length) {
    const found = new Set(officerPermissions.map((p) => p.permission_key));
    const missing = ATTENDANCE_OFFICER_PERMISSIONS.filter((k) => !found.has(k));
    console.warn(
      `Warning: ${missing.length} permissions from attendance_officer default set are missing from DB: ${missing.join(', ')}. These will be skipped.`,
    );
  }

  let rolesCreated = 0;
  let rolesSkipped = 0;

  for (const tenant of tenants) {
    const existing = await prisma.role.findFirst({
      where: {
        tenant_id: tenant.id,
        role_key: ATTENDANCE_OFFICER_KEY,
        is_system_role: true,
      },
    });

    if (existing) {
      rolesSkipped++;
      continue;
    }

    const role = await prisma.role.create({
      data: {
        tenant_id: tenant.id,
        role_key: ATTENDANCE_OFFICER_KEY,
        display_name: ATTENDANCE_OFFICER_NAME,
        role_tier: 'staff',
        is_system_role: true,
      },
    });

    for (const perm of officerPermissions) {
      await prisma.rolePermission.create({
        data: { role_id: role.id, permission_id: perm.id },
      });
    }

    rolesCreated++;
    console.log(
      `  Created ${ATTENDANCE_OFFICER_KEY} for tenant ${tenant.name} (${tenant.id}) with ${officerPermissions.length} permissions`,
    );
  }

  console.log(`Roles created: ${rolesCreated}, skipped: ${rolesSkipped}`);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
