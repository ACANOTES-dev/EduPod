/**
 * Backfill policy evaluations for existing behaviour incidents.
 *
 * The engine auto-evaluates on incident CREATE, but existing seeded + UI-logged
 * incidents pre-date the default policy rules. This script enqueues a
 * `behaviour:evaluate-policy` job for every existing active incident so the
 * worker runs the engine retroactively and populates the ledger.
 *
 * Also triggers an `early-warning:compute-daily` job so the new risk tiers
 * reflect the updated data immediately.
 *
 * Usage:
 *   npx tsx packages/prisma/scripts/backfill-policy-evaluations.ts [--tenant=<id>]
 *
 * Requires REDIS_URL to be set.
 */
/* eslint-disable no-console -- seed script uses console for progress */
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

import { PrismaClient } from '@prisma/client';

const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
const redisUrl = process.env.REDIS_URL;
if (!redisUrl) throw new Error('REDIS_URL must be set');

const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });

function parseArgs() {
  const args = process.argv.slice(2);
  const tArg = args.find((a) => a.startsWith('--tenant='));
  return { tenantId: tArg ? tArg.split('=')[1] : null };
}

async function main() {
  const { tenantId } = parseArgs();

  const behaviourQueue = new Queue('behaviour', { connection });
  const earlyWarningQueue = new Queue('early-warning', { connection });

  try {
    const where = tenantId
      ? { tenant_id: tenantId, status: { not: 'draft' as const } }
      : { status: { not: 'draft' as const } };

    const incidents = await prisma.behaviourIncident.findMany({
      where,
      select: { id: true, tenant_id: true },
    });

    console.log(`Enqueueing policy evaluation for ${incidents.length} incident(s) …`);

    let added = 0;
    const now = new Date().toISOString();
    // Batch in chunks to avoid hammering Redis
    const CHUNK = 200;
    for (let i = 0; i < incidents.length; i += CHUNK) {
      const slice = incidents.slice(i, i + CHUNK);
      await Promise.all(
        slice.map((inc) =>
          behaviourQueue.add(
            'behaviour:evaluate-policy',
            {
              tenant_id: inc.tenant_id,
              incident_id: inc.id,
              trigger: 'backfill',
              triggered_at: now,
            },
            {
              attempts: 2,
              backoff: { type: 'exponential', delay: 5_000 },
              removeOnComplete: 500,
              removeOnFail: 100,
            },
          ),
        ),
      );
      added += slice.length;
      if (added % 1000 === 0) console.log(`  enqueued ${added}/${incidents.length}`);
    }

    console.log(`Enqueued ${added} policy-evaluation job(s).`);

    // Compute-daily recompute for early-warning, per tenant, so new thresholds kick in
    const tenants = tenantId
      ? [{ id: tenantId }]
      : await prisma.tenant.findMany({ where: { status: 'active' }, select: { id: true } });

    console.log(`Enqueueing early-warning compute-daily for ${tenants.length} tenant(s) …`);
    for (const t of tenants) {
      await earlyWarningQueue.add(
        'early-warning:compute-daily',
        { tenant_id: t.id },
        { attempts: 2, removeOnComplete: 10, removeOnFail: 5 },
      );
    }

    console.log('Done.');
  } finally {
    await behaviourQueue.close();
    await earlyWarningQueue.close();
    await prisma.$disconnect();
    connection.disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
