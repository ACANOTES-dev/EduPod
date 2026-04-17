/**
 * Dump a scheduling-run's config snapshot to disk so it can be replayed
 * against the solver sidecar locally (e.g. to reproduce an OR-Tools crash).
 *
 * Context: when the CP-SAT sidecar crashes mid-solve the worker marks the
 * run as `failed` with `failure_reason = 'CP_SAT_UNREACHABLE: fetch failed'`
 * but the full `config_snapshot` JSONB is still on the run row — there is no
 * DB-layer loss. This script just makes it one command to pull that snapshot
 * out for offline investigation.
 *
 * Run (locally, with admin-level DATABASE_MIGRATE_URL pointing at prod via
 * tunnel, or on the server via docker exec with admin creds):
 *
 *   DATABASE_MIGRATE_URL=postgresql://... \
 *     npx tsx packages/prisma/scripts/dump-scheduling-run-snapshot.ts \
 *       <run-id> [output-path]
 *
 * Without an output path the JSON is printed to stdout, so you can pipe it
 * into `| jq` or `> file.json`.
 */
/* eslint-disable no-console */
import * as fs from 'fs';

import { PrismaClient } from '@prisma/client';

async function main(): Promise<void> {
  const [runId, outputPath] = process.argv.slice(2);
  if (!runId) {
    console.error('Usage: dump-scheduling-run-snapshot <run-id> [output-path]');
    process.exit(2);
  }

  const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_MIGRATE_URL or DATABASE_URL must be set');
  }

  const prisma = new PrismaClient({ datasources: { db: { url: connectionString } } });

  try {
    const run = await prisma.schedulingRun.findUnique({
      where: { id: runId },
      select: {
        id: true,
        tenant_id: true,
        academic_year_id: true,
        status: true,
        mode: true,
        failure_reason: true,
        created_at: true,
        config_snapshot: true,
      },
    });

    if (!run) {
      console.error(`No scheduling run found with id ${runId}`);
      process.exit(1);
    }

    if (!run.config_snapshot) {
      console.error(
        `Run ${runId} has no config_snapshot (status=${run.status}). ` +
          `Jobs that failed before assembly don't persist a snapshot — nothing to dump.`,
      );
      process.exit(1);
    }

    const payload = {
      run_id: run.id,
      tenant_id: run.tenant_id,
      academic_year_id: run.academic_year_id,
      status: run.status,
      mode: run.mode,
      failure_reason: run.failure_reason,
      created_at: run.created_at,
      config_snapshot: run.config_snapshot,
    };

    const json = JSON.stringify(payload, null, 2);
    if (outputPath) {
      fs.writeFileSync(outputPath, json);
      console.error(`Wrote ${outputPath} (${json.length} bytes)`);
    } else {
      process.stdout.write(json + '\n');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
