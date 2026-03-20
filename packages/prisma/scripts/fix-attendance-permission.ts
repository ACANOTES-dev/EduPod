/**
 * Data migration script: Add attendance.take permission to school_owner and school_admin roles.
 *
 * Run: npx tsx packages/prisma/scripts/fix-attendance-permission.ts
 *
 * This script is idempotent — safe to run multiple times.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const permissionKey = 'attendance.take';
  const roleKeys = ['school_owner', 'school_admin'];

  // Find the permission record
  const permission = await prisma.permission.findFirst({
    where: { permission_key: permissionKey },
  });

  if (!permission) {
    console.log(`Permission '${permissionKey}' not found in the database. Run the seed first.`);
    return;
  }

  // Find all system roles matching the target role_keys across all tenants
  const roles = await prisma.role.findMany({
    where: { role_key: { in: roleKeys }, is_system: true },
    select: { id: true, role_key: true, tenant_id: true },
  });

  console.log(`Found ${roles.length} role records to update.`);

  let created = 0;
  let skipped = 0;

  for (const role of roles) {
    // Check if the role_permission already exists
    const existing = await prisma.rolePermission.findFirst({
      where: { role_id: role.id, permission_id: permission.id },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.rolePermission.create({
      data: {
        role_id: role.id,
        permission_id: permission.id,
      },
    });
    created++;
    console.log(`  Added ${permissionKey} to ${role.role_key} (tenant: ${role.tenant_id})`);
  }

  console.log(`Done. Created: ${created}, Skipped (already existed): ${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
