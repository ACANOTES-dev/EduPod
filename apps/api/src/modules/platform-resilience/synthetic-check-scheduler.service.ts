import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job, Queue, Worker } from 'bullmq';

import { PrismaService } from '../prisma/prisma.service';

import { SyntheticCheckRunnerService } from './synthetic-check-runner.service';

const SYNTHETIC_CHECK_QUEUE = 'platform-synthetic-checks';
const RUN_SYNTHETIC_CHECK_JOB = 'resilience:run-synthetic-check';

@Injectable()
export class SyntheticCheckSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SyntheticCheckSchedulerService.name);
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    private readonly runner: SyntheticCheckRunnerService,
  ) {}

  async onModuleInit(): Promise<void> {
    const connection = this.redisConnection();
    this.queue = new Queue(SYNTHETIC_CHECK_QUEUE, { connection });
    this.worker = new Worker(
      SYNTHETIC_CHECK_QUEUE,
      async (job: Job<{ definition_id: string }>) => {
        await this.runner.run(job.data.definition_id, { triggered_by: 'schedule' });
      },
      { connection },
    );
    await this.syncAll();
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([this.worker?.close(), this.queue?.close()]);
    this.worker = null;
    this.queue = null;
  }

  async syncAll(): Promise<void> {
    const definitions = await this.prisma.platformSyntheticCheckDefinition.findMany();
    for (const definition of definitions) {
      await this.syncDefinition(definition.id);
    }
  }

  async syncDefinition(definitionId: string): Promise<void> {
    const definition = await this.prisma.platformSyntheticCheckDefinition.findUnique({
      where: { id: definitionId },
    });
    if (!definition) return;
    if (!definition.enabled) {
      await this.removeDefinitionSchedule(definition.key);
      return;
    }
    await this.removeDefinitionSchedule(definition.key);
    await this.queueOrThrow().add(
      RUN_SYNTHETIC_CHECK_JOB,
      { definition_id: definition.id },
      {
        jobId: `cron:synthetic:${definition.key}`,
        removeOnComplete: 10,
        removeOnFail: 50,
        repeat: { pattern: definition.schedule_cron },
      },
    );
    this.logger.log(`Registered synthetic check schedule: ${definition.key}`);
  }

  async removeDefinitionSchedule(definitionKey: string): Promise<void> {
    const queue = this.queueOrThrow();
    const repeatables = await queue.getRepeatableJobs();
    await Promise.all(
      repeatables
        .filter((job) => job.id === `cron:synthetic:${definitionKey}`)
        .map((job) => queue.removeRepeatableByKey(job.key)),
    );
  }

  private queueOrThrow(): Queue {
    if (!this.queue) throw new Error('Synthetic check queue is not initialised.');
    return this.queue;
  }

  private redisConnection() {
    const redisUrl = new URL(
      this.configService.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
    );
    return {
      host: redisUrl.hostname,
      password: redisUrl.password ? decodeURIComponent(redisUrl.password) : undefined,
      port: Number.parseInt(redisUrl.port || '6379', 10),
    };
  }
}
