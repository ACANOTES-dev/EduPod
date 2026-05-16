import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type Job, type JobType, Queue } from 'bullmq';
import type { RedisOptions } from 'ioredis';

import {
  type CleanQueueDto,
  JOB_STATUSES,
  type ListQueueJobsQuery,
  PLATFORM_QUEUE_NAMES,
} from '@school/shared';

export interface QueueCounts {
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface QueueSummary {
  name: string;
  is_paused: boolean;
  counts: QueueCounts;
}

export interface JobSummary {
  id: string;
  name: string;
  status: string;
  timestamp: number;
  processed_on: number | null;
  finished_on: number | null;
  attempts_made: number;
  attempts_total: number | null;
  failed_reason: string | null;
  data: unknown;
}

export interface JobDetail extends JobSummary {
  opts: unknown;
  progress: unknown;
  return_value: unknown;
  stacktrace: string[];
  logs: string[];
}

type QueueInstance = Queue<unknown, unknown, string>;

const VALID_QUEUE_NAMES = new Set<string>(PLATFORM_QUEUE_NAMES);
const DEFAULT_JOB_TYPES: JobType[] = ['waiting', 'active', 'completed', 'failed', 'delayed'];
const COUNT_JOB_TYPES = [...JOB_STATUSES] satisfies JobType[];

@Injectable()
export class QueueManagementService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueManagementService.name);
  private readonly queues = new Map<string, QueueInstance>();

  constructor(private readonly configService: ConfigService) {
    const connection = this.getRedisConnectionOptions();
    for (const queueName of PLATFORM_QUEUE_NAMES) {
      this.queues.set(queueName, new Queue(queueName, { connection }));
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
    this.queues.clear();
  }

  async listQueues(): Promise<QueueSummary[]> {
    const summaries = await Promise.all(
      [...this.queues.entries()].map(async ([name, queue]) => this.safeQueueSummary(name, queue)),
    );

    return summaries.sort((a, b) => a.name.localeCompare(b.name));
  }

  async listJobs(
    queryName: string,
    query: ListQueueJobsQuery,
  ): Promise<{
    data: JobSummary[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const queue = this.getQueue(queryName);
    const page = query.page;
    const pageSize = query.pageSize;
    const start = (page - 1) * pageSize;
    const end = start + pageSize - 1;
    const jobTypes = this.getJobTypes(query.status);

    const [jobs, counts] = await Promise.all([
      queue.getJobs(jobTypes, start, end, false),
      queue.getJobCounts(...jobTypes),
    ]);
    const total = Object.values(counts).reduce((sum, count) => sum + (count ?? 0), 0);
    const data = await Promise.all(jobs.map((job) => this.toJobSummary(job)));
    data.sort((a, b) => b.timestamp - a.timestamp);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  async getJobDetail(queueName: string, jobId: string): Promise<JobDetail> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException({
        code: 'JOB_NOT_FOUND',
        message: `Job "${jobId}" not found in queue "${queueName}"`,
      });
    }

    const [summary, logResult] = await Promise.all([
      this.toJobSummary(job),
      queue.getJobLogs(jobId, 0, 100, false).catch((err: unknown) => {
        this.logger.warn(`Failed to read logs for job "${jobId}" in queue "${queueName}"`, err);
        return { logs: [], count: 0 };
      }),
    ]);

    return {
      ...summary,
      opts: toSerializable(job.opts),
      progress: toSerializable(job.progress),
      return_value: toSerializable(job.returnvalue),
      stacktrace: job.stacktrace ?? [],
      logs: logResult.logs,
    };
  }

  async retryJob(queueName: string, jobId: string): Promise<{ retried: true }> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException({
        code: 'JOB_NOT_FOUND',
        message: `Job "${jobId}" not found in queue "${queueName}"`,
      });
    }

    const state = await job.getState();
    if (state !== 'failed') {
      throw new BadRequestException({
        code: 'JOB_NOT_FAILED',
        message: `Job "${jobId}" is in state "${state}" — only failed jobs can be retried`,
      });
    }

    await job.retry('failed');
    return { retried: true };
  }

  async pauseQueue(queueName: string): Promise<{ paused: true }> {
    const queue = this.getQueue(queueName);
    await queue.pause();
    return { paused: true };
  }

  async resumeQueue(queueName: string): Promise<{ resumed: true }> {
    const queue = this.getQueue(queueName);
    await queue.resume();
    return { resumed: true };
  }

  async cleanQueue(
    queueName: string,
    dto: CleanQueueDto,
  ): Promise<{ cleaned: number; job_ids: string[] }> {
    const queue = this.getQueue(queueName);
    const cleaned = await queue.clean(dto.grace_ms, dto.limit, dto.status);
    return { cleaned: cleaned.length, job_ids: cleaned };
  }

  async removeJob(
    queueName: string,
    jobId: string,
  ): Promise<{
    job_name: string;
    previous_state: string;
    failed_reason: string | null;
    attempts_made: number;
  }> {
    const queue = this.getQueue(queueName);
    const job = await queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException({
        code: 'JOB_NOT_FOUND',
        message: `Job "${jobId}" not found in queue "${queueName}"`,
      });
    }
    const previousState = await job.getState();
    const result = {
      job_name: job.name,
      previous_state: previousState,
      failed_reason: job.failedReason ?? null,
      attempts_made: job.attemptsMade,
    };
    await job.remove();
    return result;
  }

  getKnownQueueNames(): string[] {
    return [...PLATFORM_QUEUE_NAMES];
  }

  getQueue(name: string): QueueInstance {
    const queue = this.queues.get(name);
    if (!queue || !VALID_QUEUE_NAMES.has(name)) {
      throw new NotFoundException({
        code: 'QUEUE_NOT_FOUND',
        message: `Queue "${name}" not found. Valid queues: ${this.getKnownQueueNames().join(', ')}`,
      });
    }
    return queue;
  }

  private async safeQueueSummary(name: string, queue: QueueInstance): Promise<QueueSummary> {
    try {
      const [counts, isPaused] = await Promise.all([
        queue.getJobCounts(...COUNT_JOB_TYPES),
        queue.isPaused(),
      ]);
      return {
        name,
        is_paused: isPaused,
        counts: normalizeCounts(counts),
      };
    } catch (err: unknown) {
      this.logger.error(
        `Failed to inspect queue "${name}"`,
        err instanceof Error ? err.stack : String(err),
      );
      return {
        name,
        is_paused: false,
        counts: normalizeCounts({}),
      };
    }
  }

  private getJobTypes(status: ListQueueJobsQuery['status']): JobType[] {
    if (!status) {
      return DEFAULT_JOB_TYPES;
    }
    return [status];
  }

  private async toJobSummary(job: Job<unknown, unknown, string>): Promise<JobSummary> {
    return {
      id: job.id ?? 'unknown',
      name: job.name,
      status: await job.getState(),
      timestamp: job.timestamp,
      processed_on: job.processedOn ?? null,
      finished_on: job.finishedOn ?? null,
      attempts_made: job.attemptsMade,
      attempts_total:
        typeof job.opts.attempts === 'number' && Number.isFinite(job.opts.attempts)
          ? job.opts.attempts
          : null,
      failed_reason: job.failedReason ?? null,
      data: toSerializable(job.data),
    };
  }

  private getRedisConnectionOptions(): RedisOptions {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      throw new Error('REDIS_URL is not configured');
    }
    const url = new URL(redisUrl);
    const db = Number(url.pathname.slice(1));
    return {
      db: url.pathname.length > 1 && Number.isFinite(db) ? db : undefined,
      host: url.hostname,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      port: Number(url.port) || 6379,
      username: url.username ? decodeURIComponent(url.username) : undefined,
    };
  }
}

function normalizeCounts(counts: Record<string, number | undefined>): QueueCounts {
  return {
    waiting: counts.waiting ?? 0,
    active: counts.active ?? 0,
    completed: counts.completed ?? 0,
    failed: counts.failed ?? 0,
    delayed: counts.delayed ?? 0,
    paused: counts.paused ?? 0,
  };
}

function toSerializable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null, jsonReplacer)) as unknown;
}

function jsonReplacer(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}
