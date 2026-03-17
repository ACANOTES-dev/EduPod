import * as fs from 'fs';
import * as path from 'path';

import { Client } from 'pg';

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
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  const migrationsDir = path.resolve(__dirname, '..', 'packages/prisma/migrations');

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
    for (const sqlFile of postMigrateFiles) {
      const relativePath = path.relative(process.cwd(), sqlFile);
      console.log(`Executing: ${relativePath}`);
      const sql = fs.readFileSync(sqlFile, 'utf-8');
      await client.query(sql);
      console.log(`  Done.`);
    }

    console.log(`\nPost-migrate complete. Executed ${postMigrateFiles.length} file(s).`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Post-migrate failed:', err);
  process.exit(1);
});
