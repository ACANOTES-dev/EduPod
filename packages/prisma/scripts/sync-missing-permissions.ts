/**
 * One-off sync script: upsert every permission defined in
 * `packages/prisma/seed/permissions.ts` into the production DB.
 *
 * Context: the canonical seed script (`packages/prisma/seed.ts`) refuses to
 * run in `NODE_ENV=production`, so every new permission added to
 * `seed/permissions.ts` is stuck in dev until someone writes a migration or
 * an ad-hoc sync. When those drifts accumulate, tenants ship without the
 * permissions their roles are supposed to grant (see SCHED-016 resolution
 * fallout — `schedule.manage_substitutions`, `schedule.view_reports`,
 * `schedule.manage_exams`, `schedule.manage_scenarios`, and
 * `schedule.view_personal_timetable` are all missing from prod DB).
 *
 * This script is idempotent — it upserts, so existing permissions are
 * updated in place. No role_permission rows are touched — call the
 * create-stress-tenants or similar downstream grant step to wire them up.
 *
 * Run on production:
 *   cd /opt/edupod/app && \
 *     set -a; source /opt/edupod/app/.env; set +a && \
 *     npx tsx packages/prisma/scripts/sync-missing-permissions.ts
 */
/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';

import { PERMISSION_SEEDS } from '../seed/permissions';

const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });

async function main() {
  let created = 0;
  let updated = 0;
  for (const p of PERMISSION_SEEDS) {
    const existing = await prisma.permission.findUnique({
      where: { permission_key: p.permission_key },
    });
    await prisma.permission.upsert({
      where: { permission_key: p.permission_key },
      update: { description: p.description, permission_tier: p.permission_tier as never },
      create: {
        permission_key: p.permission_key,
        description: p.description,
        permission_tier: p.permission_tier as never,
      },
    });
    if (existing) updated++;
    else created++;
  }
  console.log(
    `permissions synced: ${created} created, ${updated} updated (total ${PERMISSION_SEEDS.length})`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
