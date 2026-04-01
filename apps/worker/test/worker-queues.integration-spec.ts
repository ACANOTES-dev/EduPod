import { PrismaClient } from '@prisma/client';
import { Queue, QueueEvents, Worker, type ConnectionOptions } from 'bullmq';

import { QUEUE_NAMES } from '../src/base/queue.constants';
import { TenantAwareJob, type TenantJobPayload } from '../src/base/tenant-aware-job';

process.env.DATABASE_URL ??= 'postgresql://postgres:localpassword@localhost:5553/school_platform';
process.env.REDIS_URL ??= 'redis://localhost:5554';

const TENANT_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID = '22222222-2222-2222-2222-222222222222';
const PROBE_JOB_NAME = 'integration:tenant-aware-probe';

type CriticalQueueName =
  | typeof QUEUE_NAMES.BEHAVIOUR
  | typeof QUEUE_NAMES.COMPLIANCE
  | typeof QUEUE_NAMES.NOTIFICATIONS;

interface ProbePayload extends TenantJobPayload {
  queue_name: CriticalQueueName;
}

interface ProbeResult {
  queue_name: CriticalQueueName;
  tenant_id: string | null;
  user_id: string | null;
}

class QueueProbeJob extends TenantAwareJob<ProbePayload> {
  constructor(
    prisma: PrismaClient,
    private readonly results: ProbeResult[],
  ) {
    super(prisma);
  }

  protected async processJob(data: ProbePayload, tx: PrismaClient): Promise<void> {
    const rows = await tx.$queryRaw<
      Array<{ tenant_id: string | null; user_id: string | null }>
    >`SELECT current_setting('app.current_tenant_id', true) AS tenant_id, current_setting('app.current_user_id', true) AS user_id`;

    this.results.push({
      queue_name: data.queue_name,
      tenant_id: rows[0]?.tenant_id ?? null,
      user_id: rows[0]?.user_id ?? null,
    });
  }
}

function createRedisConnectionOptions(): ConnectionOptions {
  const redisUrl = process.env.REDIS_URL;
  if (!redisUrl) {
    throw new Error('REDIS_URL is not configured');
  }

  const parsed = new URL(redisUrl);

  return {
    db: parsed.pathname.length > 1 ? Number(parsed.pathname.slice(1)) : 0,
    enableReadyCheck: false,
    host: parsed.hostname,
    maxRetriesPerRequest: null,
    password: parsed.password || undefined,
    port: parsed.port ? Number(parsed.port) : 6379,
    username: parsed.username || undefined,
  };
}

describe('Worker queue integration', () => {
  let prisma: PrismaClient;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it.each([QUEUE_NAMES.NOTIFICATIONS, QUEUE_NAMES.BEHAVIOUR, QUEUE_NAMES.COMPLIANCE])(
    'should process tenant-aware jobs against real Redis and Postgres on the %s queue',
    async (queueName) => {
      const prefix = `wt23-${queueName}-${Date.now()}`;
      const queueConnection = createRedisConnectionOptions();
      const workerConnection = createRedisConnectionOptions();
      const eventsConnection = createRedisConnectionOptions();

      const queue = new Queue(queueName, {
        connection: queueConnection,
        prefix,
      });
      const queueEvents = new QueueEvents(queueName, {
        connection: eventsConnection,
        prefix,
      });

      await queueEvents.waitUntilReady();

      const results: ProbeResult[] = [];
      const worker = new Worker(
        queueName,
        async (job) => {
          if (job.name !== PROBE_JOB_NAME) {
            return;
          }

          const probeJob = new QueueProbeJob(prisma, results);
          await probeJob.execute(job.data as ProbePayload);
        },
        {
          connection: workerConnection,
          prefix,
        },
      );

      try {
        const job = await queue.add(
          PROBE_JOB_NAME,
          {
            queue_name: queueName,
            tenant_id: TENANT_ID,
            user_id: USER_ID,
          } satisfies ProbePayload,
          {
            removeOnComplete: true,
            removeOnFail: true,
          },
        );

        await job.waitUntilFinished(queueEvents);

        expect(results).toEqual([
          {
            queue_name: queueName,
            tenant_id: TENANT_ID,
            user_id: USER_ID,
          },
        ]);
      } finally {
        await worker.close();
        await queue.obliterate({ force: true });
        await queue.close();
        await queueEvents.close();
      }
    },
  );
});
