/**
 * Data migration script: Add students.view and attendance.view to teacher role across all tenants.
 *
 * Run on production server:
 *   cd /opt/edupod/app && npx tsx packages/prisma/scripts/fix-teacher-permissions.ts
 *
 * This script is idempotent — safe to run multiple times.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const permissionKeys = ['students.view', 'attendance.view'];
  const roleKey = 'teacher';

  for (const permissionKey of permissionKeys) {
    const permission = await prisma.permission.findFirst({
      where: { permission_key: permissionKey },
    });

    if (!permission) {
      console.log(`Permission '${permissionKey}' not found. Run the seed first.`);
      continue;
    }

    const roles = await prisma.role.findMany({
      where: { role_key: roleKey, is_system: true },
      select: { id: true, role_key: true, tenant_id: true },
    });

    console.log(`Found ${roles.length} '${roleKey}' roles to add '${permissionKey}' to.`);

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
        data: {
          role_id: role.id,
          permission_id: permission.id,
          tenant_id: role.tenant_id,
        },
      });
      created++;
      console.log(`  Added ${permissionKey} to teacher (tenant: ${role.tenant_id})`);
    }

    console.log(`  ${permissionKey}: Created ${created}, Skipped ${skipped}`);
  }

  console.log('\nDone. Flush Redis permission cache: docker exec edupod-redis redis-cli FLUSHDB');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
