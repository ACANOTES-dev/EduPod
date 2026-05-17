import { HeadObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';

import { OffsiteReplicationPollerService } from './offsite-replication-poller.service';

jest.mock('@aws-sdk/client-s3', () => {
  const mockSend = jest.fn();
  class MockListObjectsV2Command {
    constructor(readonly input: Record<string, unknown>) {}
  }
  class MockHeadObjectCommand {
    constructor(readonly input: Record<string, unknown>) {}
  }
  class MockS3Client {
    static instances: MockS3Client[] = [];
    send = mockSend;
    constructor(readonly config: Record<string, unknown>) {
      MockS3Client.instances.push(this);
    }
  }
  return {
    HeadObjectCommand: MockHeadObjectCommand,
    ListObjectsV2Command: MockListObjectsV2Command,
    S3Client: MockS3Client,
    __mockSend: mockSend,
  };
});

function mockedSend() {
  return (jest.requireMock('@aws-sdk/client-s3') as { __mockSend: jest.Mock }).__mockSend;
}

describe('OffsiteReplicationPollerService', () => {
  afterEach(() => {
    jest.clearAllMocks();
    (S3Client as unknown as { instances: unknown[] }).instances.length = 0;
  });

  it('reads S3 metadata and upserts replication snapshots without mutating artifacts', async () => {
    const replicatedAt = new Date('2026-05-18T12:00:00.000Z');
    const sourceFinishedAt = new Date('2026-05-18T11:58:00.000Z');
    const source = { finished_at: sourceFinishedAt, id: 'backup-1' };
    const prisma = {
      platformBackupRun: {
        findFirst: jest.fn().mockResolvedValue(source),
      },
      platformOffsiteReplication: {
        upsert: jest.fn().mockResolvedValue({ id: 'replication-1' }),
      },
    };
    const config = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          BACKUP_REPLICATION_TARGETS_JSON: JSON.stringify([
            {
              bucket: 'edupod-offsite',
              endpoint: 'https://storage.example.test',
              name: 'offsite-primary',
              prefix: 'postgresql/prod',
              region: 'eu-west-1',
            },
          ]),
          S3_ACCESS_KEY_ID: 'access-key',
          S3_SECRET_ACCESS_KEY: 'secret-key',
        };
        return values[key];
      }),
    };
    const service = new OffsiteReplicationPollerService(prisma as never, config as never);

    mockedSend()
      .mockImplementationOnce((command: ListObjectsV2Command) => {
        expect(command.input).toMatchObject({
          Bucket: 'edupod-offsite',
          Prefix: 'postgresql/prod',
        });
        return Promise.resolve({
          Contents: [
            {
              Key: 'postgresql/prod/predeploy-20260518.dump',
              LastModified: replicatedAt,
              Size: 128,
            },
            {
              Key: 'postgresql/prod/readme.txt',
              LastModified: replicatedAt,
              Size: 1,
            },
          ],
        });
      })
      .mockImplementationOnce((command: HeadObjectCommand) => {
        expect(command.input).toMatchObject({
          Bucket: 'edupod-offsite',
          Key: 'postgresql/prod/predeploy-20260518.dump',
        });
        return Promise.resolve({ ContentLength: 256, LastModified: replicatedAt });
      });

    await expect(service.poll()).resolves.toEqual({ scanned: 1, upserted: 1 });

    expect(prisma.platformBackupRun.findFirst).toHaveBeenCalledWith({
      orderBy: { finished_at: 'desc' },
      where: {
        OR: [
          { backup_key: expect.any(String) },
          { location: { contains: 'predeploy-20260518.dump' } },
        ],
      },
    });
    expect(prisma.platformOffsiteReplication.upsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        integrity_verified: false,
        lag_seconds: 120,
        replicated_at: replicatedAt,
        replication_target: 'offsite-primary',
        size_bytes: BigInt(256),
        snapshot_id: 'postgresql/prod/predeploy-20260518.dump',
        source_backup_id: 'backup-1',
      }),
      update: expect.objectContaining({
        lag_seconds: 120,
        replicated_at: replicatedAt,
        size_bytes: BigInt(256),
        source_backup_id: 'backup-1',
      }),
      where: {
        replication_target_snapshot_id: {
          replication_target: 'offsite-primary',
          snapshot_id: 'postgresql/prod/predeploy-20260518.dump',
        },
      },
    });
    expect(mockedSend()).toHaveBeenCalledTimes(2);
  });

  it('falls back to S3 env configuration and returns zero when no bucket is configured', async () => {
    const prisma = {
      platformBackupRun: { findFirst: jest.fn() },
      platformOffsiteReplication: { upsert: jest.fn() },
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'BACKUP_REPLICATION_TARGETS_JSON' ? '{invalid-json' : undefined,
      ),
    };
    const service = new OffsiteReplicationPollerService(prisma as never, config as never);

    await expect(service.poll()).resolves.toEqual({ scanned: 0, upserted: 0 });

    expect(prisma.platformBackupRun.findFirst).not.toHaveBeenCalled();
    expect(prisma.platformOffsiteReplication.upsert).not.toHaveBeenCalled();
  });
});
