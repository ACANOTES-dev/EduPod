import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

import { Client } from 'pg';

interface AppliedScriptRow {
  applied_at: string;
  checksum: string;
  script_path: string;
}

const POST_MIGRATE_STATE_TABLE = '_post_migrate_scripts';

function buildChecksum(contents: string): string {
  return createHash('sha256').update(contents).digest('hex');
}

async function ensureStateTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS ${POST_MIGRATE_STATE_TABLE} (
      script_path TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function loadAppliedScripts(client: Client): Promise<Map<string, AppliedScriptRow>> {
  const result = await client.query<AppliedScriptRow>(
    `SELECT script_path, checksum, applied_at FROM ${POST_MIGRATE_STATE_TABLE}`,
  );
  return new Map(result.rows.map((row) => [row.script_path, row]));
}

/**
 * Post-migrate runner.
 *
 * Finds all post_migrate.sql files in Prisma migration directories
 * and executes them idempotently. These files contain:
 * - RLS policies (DROP IF EXISTS + CREATE)
 * - Extensions (CREATE IF NOT EXISTS)
 * - Custom functions (CREATE OR REPLACE)
 * - Trigger attachments
 *
 * Run after `prisma migrate deploy` via: pnpm db:post-migrate
 */

async function main() {
  const connectionString = process.env.DATABASE_MIGRATE_URL ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL or DATABASE_MIGRATE_URL environment variable is required');
  }

  const repoRoot = path.resolve(__dirname, '..');
  const migrationsDir = path.join(repoRoot, 'packages/prisma/migrations');

  if (!fs.existsSync(migrationsDir)) {
    console.log('No migrations directory found. Skipping post-migrate.');
    return;
  }

  const migrationDirs = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(); // Migrations are timestamp-prefixed, so sorting = chronological order

  const postMigrateFiles: string[] = [];

  for (const dir of migrationDirs) {
    const sqlFile = path.join(migrationsDir, dir, 'post_migrate.sql');
    if (fs.existsSync(sqlFile)) {
      postMigrateFiles.push(sqlFile);
    }
  }

  if (postMigrateFiles.length === 0) {
    console.log('No post_migrate.sql files found. Nothing to do.');
    return;
  }

  const client = new Client({ connectionString });
  await client.connect();

  try {
    await ensureStateTable(client);
    const appliedScripts = await loadAppliedScripts(client);
    let executedCount = 0;
    let skippedCount = 0;

    for (const sqlFile of postMigrateFiles) {
      const sql = fs.readFileSync(sqlFile, 'utf-8');
      const checksum = buildChecksum(sql);
      const relativePath = path.relative(repoRoot, sqlFile).replaceAll(path.sep, '/');
      const existing = appliedScripts.get(relativePath);

      if (existing) {
        if (existing.checksum !== checksum) {
          throw new Error(
            [
              `Detected checksum drift for already-applied post-migrate script "${relativePath}".`,
              'Applied post-migrate SQL must remain immutable once recorded.',
              'Create a new migration with its own post_migrate.sql instead of editing historical scripts.',
            ].join(' '),
          );
        }

        console.log(`Skipping: ${relativePath} (already applied ${existing.applied_at})`);
        skippedCount += 1;
        continue;
      }

      console.log(`Executing: ${relativePath}`);
      await client.query(sql);
      await client.query(
        `
          INSERT INTO ${POST_MIGRATE_STATE_TABLE} (script_path, checksum)
          VALUES ($1, $2)
        `,
        [relativePath, checksum],
      );
      console.log(`  Done.`);
      executedCount += 1;
    }

    console.log(
      `\nPost-migrate complete. Executed ${executedCount} new file(s), skipped ${skippedCount} already-applied file(s).`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Post-migrate failed:', err);
  process.exit(1);
});
