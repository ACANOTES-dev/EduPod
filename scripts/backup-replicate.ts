import { createReadStream } from 'fs';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';

import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

type BackupEnv = {
  databaseUrl: string;
  bucketName: string;
  prefix: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  pgDumpBin: string;
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }

  return value;
}

function loadConfig(): BackupEnv {
  return {
    databaseUrl: process.env.DATABASE_MIGRATE_URL || getRequiredEnv('DATABASE_URL'),
    bucketName: getRequiredEnv('S3_BUCKET_NAME'),
    prefix: process.env.BACKUP_S3_PREFIX || 'postgresql/prod',
    region: process.env.S3_REGION || 'eu-west-1',
    endpoint: process.env.S3_ENDPOINT,
    accessKeyId: getRequiredEnv('S3_ACCESS_KEY_ID'),
    secretAccessKey: getRequiredEnv('S3_SECRET_ACCESS_KEY'),
    pgDumpBin: process.env.PGDUMP_BIN || 'pg_dump',
  };
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:]/g, '-');
}

async function runPgDump(
  pgDumpBin: string,
  databaseUrl: string,
  outputFile: string,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(pgDumpBin, ['--format=custom', '--file', outputFile, databaseUrl], {
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`pg_dump exited with code ${code ?? 'unknown'}`));
    });
  });
}

async function main() {
  const config = loadConfig();
  const tempDir = await mkdtemp(join(tmpdir(), 'edupod-backup-'));
  const fileName = `postgres-${timestamp()}.dump`;
  const localFile = join(tempDir, fileName);
  const s3Key = `${config.prefix}/${new Date().toISOString().slice(0, 7)}/${fileName}`;

  const client = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    forcePathStyle: Boolean(config.endpoint),
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  try {
    console.log(`Creating pg_dump archive at ${localFile}`);
    await runPgDump(config.pgDumpBin, config.databaseUrl, localFile);

    console.log(`Uploading backup to s3://${config.bucketName}/${s3Key}`);
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucketName,
        Key: s3Key,
        Body: createReadStream(localFile),
        Metadata: {
          created_at: new Date().toISOString(),
          source: 'deploy-ops-backup-replication',
        },
      }),
    );

    console.log('Backup replication complete');
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

main().catch((error) => {
  console.error('Off-site backup replication failed:', error);
  process.exit(1);
});
