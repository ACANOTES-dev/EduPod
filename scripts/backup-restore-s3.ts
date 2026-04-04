/**
 * backup-restore-s3.ts — Download and restore a PostgreSQL backup from S3
 *
 * Modes:
 *   --list / --dry-run     List available backups in S3 (most recent first)
 *   --download-only        Download the most recent backup, print local path, exit
 *   --backup-key <key>     Download and restore a specific S3 key
 *   (default)              Download and restore the most recent backup
 *
 * Options:
 *   --target-url <url>     Target database connection string
 *                          (defaults to DATABASE_MIGRATE_URL or DATABASE_URL)
 *   --pg-restore-bin <bin> Path to pg_restore binary (default: pg_restore)
 */

import { createWriteStream } from 'fs';
import { mkdtemp, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';

// ─── Types ────────────────────────────────────────────────────────────────────

type RestoreConfig = {
  bucketName: string;
  prefix: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  targetUrl: string;
  pgRestoreBin: string;
};

type S3BackupEntry = {
  key: string;
  lastModified: Date;
  sizeBytes: number;
};

type CliFlags = {
  list: boolean;
  downloadOnly: boolean;
  backupKey?: string;
  targetUrl?: string;
  pgRestoreBin?: string;
};

// ─── Environment helpers ──────────────────────────────────────────────────────

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function loadConfig(flags: CliFlags): RestoreConfig {
  return {
    bucketName: getRequiredEnv('S3_BUCKET_NAME'),
    prefix: process.env.BACKUP_S3_PREFIX || 'postgresql/prod',
    region: process.env.S3_REGION || 'eu-west-1',
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: getRequiredEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
    targetUrl:
      flags.targetUrl ||
      process.env.DATABASE_MIGRATE_URL ||
      getRequiredEnv('DATABASE_URL'),
    pgRestoreBin: flags.pgRestoreBin || process.env.PG_RESTORE_BIN || 'pg_restore',
  };
}

function buildS3Client(config: RestoreConfig): S3Client {
  return new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: Boolean(config.endpoint),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
}

// ─── CLI argument parsing ─────────────────────────────────────────────────────

function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    list: false,
    downloadOnly: false,
  };

  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case '--list':
      case '--dry-run':
        flags.list = true;
        break;
      case '--download-only':
        flags.downloadOnly = true;
        break;
      case '--backup-key': {
        const nextArg = argv[i + 1];
        if (!nextArg || nextArg.startsWith('--')) {
          throw new Error('--backup-key requires a value');
        }
        flags.backupKey = nextArg;
        i++;
        break;
      }
      case '--target-url': {
        const nextArg = argv[i + 1];
        if (!nextArg || nextArg.startsWith('--')) {
          throw new Error('--target-url requires a value');
        }
        flags.targetUrl = nextArg;
        i++;
        break;
      }
      case '--pg-restore-bin': {
        const nextArg = argv[i + 1];
        if (!nextArg || nextArg.startsWith('--')) {
          throw new Error('--pg-restore-bin requires a value');
        }
        flags.pgRestoreBin = nextArg;
        i++;
        break;
      }
      case '--help':
      case '-h':
        printUsage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return flags;
}

function printUsage(): void {
  console.log(`
Usage: npx tsx scripts/backup-restore-s3.ts [options]

Modes:
  --list, --dry-run       List available backups (no restore)
  --download-only         Download most recent backup, print path, exit
  --backup-key <key>      Restore a specific S3 object key
  (default)               Restore the most recent backup

Options:
  --target-url <url>      Target database URL (default: DATABASE_MIGRATE_URL)
  --pg-restore-bin <bin>  Path to pg_restore (default: pg_restore)
  --help, -h              Show this help
  `.trim());
}

// ─── S3 operations ────────────────────────────────────────────────────────────

async function listBackups(
  client: S3Client,
  config: RestoreConfig,
): Promise<S3BackupEntry[]> {
  const entries: S3BackupEntry[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: config.bucketName,
        Prefix: config.prefix,
        ContinuationToken: continuationToken,
      }),
    );

    if (response.Contents) {
      for (const obj of response.Contents) {
        if (obj.Key && obj.LastModified && obj.Key.endsWith('.dump')) {
          entries.push({
            key: obj.Key,
            lastModified: obj.LastModified,
            sizeBytes: obj.Size ?? 0,
          });
        }
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  // Sort most recent first
  entries.sort((a, b) => b.lastModified.getTime() - a.lastModified.getTime());
  return entries;
}

async function downloadBackup(
  client: S3Client,
  config: RestoreConfig,
  key: string,
  destPath: string,
): Promise<void> {
  const response = await client.send(
    new GetObjectCommand({
      Bucket: config.bucketName,
      Key: key,
    }),
  );

  if (!response.Body) {
    throw new Error(`Empty response body for key: ${key}`);
  }

  // The AWS SDK body is always an AsyncIterable in Node.js runtimes.
  // Readable.from() handles both Readable and AsyncIterable<Uint8Array>.
  const nodeReadable =
    response.Body instanceof Readable
      ? response.Body
      : Readable.from(response.Body as AsyncIterable<Uint8Array>);

  await pipeline(nodeReadable, createWriteStream(destPath));
}

// ─── pg_restore ───────────────────────────────────────────────────────────────

async function runPgRestore(
  pgRestoreBin: string,
  targetUrl: string,
  dumpFile: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      pgRestoreBin,
      ['--clean', '--if-exists', '--no-owner', '--no-privileges', `--dbname=${targetUrl}`, dumpFile],
      { stdio: 'inherit' },
    );

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      // pg_restore returns non-zero for non-critical warnings (e.g., "relation does not exist" during --clean).
      // Code 1 with --clean --if-exists is typically safe. Only fail on code >= 2.
      if (code === 1) {
        console.warn(
          'pg_restore exited with code 1 (non-critical warnings during --clean). Continuing.',
        );
        resolve();
        return;
      }
      reject(new Error(`pg_restore exited with code ${code ?? 'unknown'}`));
    });
  });
}

// ─── Post-restore verification ────────────────────────────────────────────────

async function runVerification(
  targetUrl: string,
): Promise<{ tables: number; migrations: number; policies: number }> {
  const runPsql = (query: string): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const child = spawn('psql', [targetUrl, '-t', '-A', '-c', query], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on('error', reject);
      child.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`psql exited with code ${code}: ${stderr}`));
          return;
        }
        resolve(stdout.trim());
      });
    });

  const tablesRaw = await runPsql(
    "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';",
  );
  const tables = parseInt(tablesRaw, 10);

  const migrationsRaw = await runPsql(
    'SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL;',
  );
  const migrations = parseInt(migrationsRaw, 10);

  const policiesRaw = await runPsql(
    "SELECT count(*) FROM pg_policies WHERE schemaname = 'public';",
  );
  const policies = parseInt(policiesRaw, 10);

  return { tables, migrations, policies };
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(date: Date): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const flags = parseArgs(process.argv);
  const config = loadConfig(flags);
  const client = buildS3Client(config);

  // ── List mode ─────────────────────────────────────────────────────────────
  if (flags.list) {
    console.log(`Listing backups in s3://${config.bucketName}/${config.prefix}/\n`);
    const backups = await listBackups(client, config);

    if (backups.length === 0) {
      console.log('No .dump backups found.');
      return;
    }

    console.log(`Found ${backups.length} backup(s):\n`);
    console.log(
      ['  #', 'Date', 'Size', 'Key']
        .map((h, i) => h.padEnd([4, 26, 12, 0][i]))
        .join(''),
    );
    console.log('  ' + '-'.repeat(80));

    backups.forEach((b, i) => {
      const num = `${i + 1}`.padEnd(4);
      const date = formatDate(b.lastModified).padEnd(26);
      const size = formatBytes(b.sizeBytes).padEnd(12);
      console.log(`  ${num}${date}${size}${b.key}`);
    });

    return;
  }

  // ── Resolve which backup key to use ───────────────────────────────────────
  let targetKey: string;

  if (flags.backupKey) {
    targetKey = flags.backupKey;
    console.log(`Using specified backup key: ${targetKey}`);
  } else {
    console.log(`Finding most recent backup in s3://${config.bucketName}/${config.prefix}/`);
    const backups = await listBackups(client, config);
    if (backups.length === 0) {
      throw new Error('No .dump backups found in S3. Run backup-replicate.ts first.');
    }
    targetKey = backups[0].key;
    console.log(
      `Most recent backup: ${targetKey} (${formatDate(backups[0].lastModified)}, ${formatBytes(backups[0].sizeBytes)})`,
    );
  }

  // ── Download ──────────────────────────────────────────────────────────────
  const tempDir = await mkdtemp(join(tmpdir(), 'edupod-restore-'));
  const localFile = join(tempDir, 'restore.dump');

  try {
    console.log(`\nDownloading to ${localFile}...`);
    await downloadBackup(client, config, targetKey, localFile);

    const fileStat = await stat(localFile);
    console.log(`Download complete (${formatBytes(fileStat.size)})`);

    // ── Download-only mode ────────────────────────────────────────────────
    if (flags.downloadOnly) {
      // Print ONLY the file path to stdout so callers can capture it
      console.log(localFile);
      return;
    }

    // ── Restore ─────────────────────────────────────────────────────────────
    console.log(`\nRestoring to target database...`);
    console.log(`  pg_restore binary: ${config.pgRestoreBin}`);
    console.log(`  target: ${config.targetUrl.replace(/\/\/[^@]+@/, '//<credentials>@')}\n`);

    await runPgRestore(config.pgRestoreBin, config.targetUrl, localFile);
    console.log('Restore complete\n');

    // ── Verification ────────────────────────────────────────────────────────
    console.log('Running post-restore verification...');
    const result = await runVerification(config.targetUrl);

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║       Restore Verification Summary       ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  S3 key:       ${targetKey.slice(-35).padEnd(25)} ║`);
    console.log(`║  Tables:       ${String(result.tables).padEnd(25)} ║`);
    console.log(`║  Migrations:   ${String(result.migrations).padEnd(25)} ║`);
    console.log(`║  RLS policies: ${String(result.policies).padEnd(25)} ║`);
    console.log('╚══════════════════════════════════════════╝');

    if (result.tables === 0) {
      console.error('\nWARNING: No tables found after restore. The restore may have failed silently.');
      process.exit(1);
    }

    if (result.migrations === 0) {
      console.error('\nWARNING: No completed migrations found. The backup may be corrupt.');
      process.exit(1);
    }

    if (result.policies === 0) {
      console.warn(
        '\nWARNING: No RLS policies found. You may need to run post-migrate to re-apply policies.',
      );
    }

    console.log('\nRestore and verification complete.');
  } finally {
    // Clean up temp files UNLESS in download-only mode (caller needs the file)
    if (!flags.downloadOnly) {
      await rm(tempDir, { force: true, recursive: true });
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Restore from S3 failed:', message);
  process.exit(1);
});
