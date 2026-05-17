import { HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../prisma/prisma.service';

import { deriveBackupKey } from './backup-key';

interface ReplicationTarget {
  bucket: string;
  endpoint?: string;
  name: string;
  prefix: string;
  region: string;
}

@Injectable()
export class OffsiteReplicationPollerService {
  private readonly logger = new Logger(OffsiteReplicationPollerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async poll(): Promise<{ scanned: number; upserted: number }> {
    const targets = this.targets();
    let scanned = 0;
    let upserted = 0;
    for (const target of targets) {
      const client = this.clientFor(target);
      let continuationToken: string | undefined;
      do {
        const listed = await client.send(
          new ListObjectsV2Command({
            Bucket: target.bucket,
            ContinuationToken: continuationToken,
            Prefix: target.prefix,
          }),
        );
        for (const object of listed.Contents ?? []) {
          if (!object.Key || !object.LastModified || !object.Key.endsWith('.dump')) continue;
          scanned += 1;
          const headed = await client.send(
            new HeadObjectCommand({ Bucket: target.bucket, Key: object.Key }),
          );
          const size = headed.ContentLength ?? object.Size ?? null;
          const replicatedAt = headed.LastModified ?? object.LastModified;
          const backupKey = deriveBackupKey({
            finished_at: replicatedAt,
            location: `s3://${target.bucket}/${object.Key}`,
            size_bytes: size,
            started_at: replicatedAt,
            storage_kind: 's3',
          });
          const source = await this.prisma.platformBackupRun.findFirst({
            where: {
              OR: [
                { backup_key: backupKey },
                { location: { contains: object.Key.split('/').at(-1) ?? object.Key } },
              ],
            },
            orderBy: { finished_at: 'desc' },
          });
          const lagSeconds = source?.finished_at
            ? Math.max(
                0,
                Math.floor((replicatedAt.getTime() - source.finished_at.getTime()) / 1000),
              )
            : null;
          await this.prisma.platformOffsiteReplication.upsert({
            where: {
              replication_target_snapshot_id: {
                replication_target: target.name,
                snapshot_id: object.Key,
              },
            },
            create: {
              integrity_verified: false,
              lag_seconds: lagSeconds,
              replicated_at: replicatedAt,
              replication_target: target.name,
              size_bytes: size === null ? null : BigInt(size),
              snapshot_id: object.Key,
              source_backup_id: source?.id ?? null,
            },
            update: {
              lag_seconds: lagSeconds,
              replicated_at: replicatedAt,
              size_bytes: size === null ? undefined : BigInt(size),
              source_backup_id: source?.id ?? undefined,
            },
          });
          upserted += 1;
        }
        continuationToken = listed.NextContinuationToken;
      } while (continuationToken);
    }
    return { scanned, upserted };
  }

  private targets(): ReplicationTarget[] {
    const raw = this.config.get<string>('BACKUP_REPLICATION_TARGETS_JSON');
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as unknown;
        if (Array.isArray(parsed)) {
          return parsed
            .map(parseTarget)
            .filter((target): target is ReplicationTarget => target !== null);
        }
      } catch (err: unknown) {
        this.logger.warn('Invalid BACKUP_REPLICATION_TARGETS_JSON; falling back to S3 env.', err);
      }
    }
    const bucket = this.config.get<string>('S3_BUCKET_NAME');
    const region = this.config.get<string>('S3_REGION') ?? 'eu-west-1';
    if (!bucket) return [];
    return [
      {
        bucket,
        endpoint: this.config.get<string>('S3_ENDPOINT'),
        name: `s3://${bucket}`,
        prefix: this.config.get<string>('BACKUP_S3_PREFIX') ?? 'postgresql/prod',
        region,
      },
    ];
  }

  private clientFor(target: ReplicationTarget): S3Client {
    const accessKeyId = this.config.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.config.get<string>('S3_SECRET_ACCESS_KEY');
    return new S3Client({
      credentials: accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : undefined,
      endpoint: target.endpoint,
      forcePathStyle: Boolean(target.endpoint),
      region: target.region,
    });
  }
}

function parseTarget(value: unknown): ReplicationTarget | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.bucket !== 'string' ||
    typeof record.name !== 'string' ||
    typeof record.prefix !== 'string'
  ) {
    return null;
  }
  return {
    bucket: record.bucket,
    endpoint: typeof record.endpoint === 'string' ? record.endpoint : undefined,
    name: record.name,
    prefix: record.prefix,
    region: typeof record.region === 'string' ? record.region : 'eu-west-1',
  };
}
