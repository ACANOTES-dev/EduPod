import { InjectQueue } from '@nestjs/bullmq';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Queue } from 'bullmq';

import type { JwtPayload } from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

// ─── Controller ─────────────────────────────────────────────────────────────

@Controller('v1/admin/queues')
@UseGuards(AuthGuard, PermissionGuard)
export class QueueAdminController {
  private readonly queues: Map<string, Queue>;

  constructor(
    @InjectQueue('gradebook') private readonly gradebookQueue: Queue,
    @InjectQueue('notifications') private readonly notificationsQueue: Queue,
  ) {
    // Register all injected queues by name for dynamic lookup
    this.queues = new Map<string, Queue>([
      ['gradebook', this.gradebookQueue],
      ['notifications', this.notificationsQueue],
    ]);
  }

  // GET /v1/admin/queues/failed — summary of failed jobs across all registered queues
  @Get('failed')
  @RequiresPermission('settings.manage')
  async getFailedSummary() {
    const results: Array<{ queue: string; failed_count: number }> = [];
    for (const [name, queue] of this.queues) {
      const failedCount = await queue.getFailedCount();
      results.push({ queue: name, failed_count: failedCount });
    }
    return { data: results.filter((r) => r.failed_count > 0) };
  }

  // GET /v1/admin/queues/:queueName/failed — list failed jobs for a specific queue
  @Get(':queueName/failed')
  @RequiresPermission('settings.manage')
  async listFailedJobs(
    @Param('queueName') queueName: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const queue = this.resolveQueue(queueName);
    const pageNum = Math.max(1, parseInt(page ?? '1', 10) || 1);
    const size = Math.min(100, Math.max(1, parseInt(pageSize ?? '20', 10) || 20));
    const start = (pageNum - 1) * size;
    const end = start + size - 1;

    const [jobs, total] = await Promise.all([queue.getFailed(start, end), queue.getFailedCount()]);

    return {
      data: jobs.map((job) => ({
        id: job.id,
        name: job.name,
        data: job.data,
        failed_reason: job.failedReason,
        attempts_made: job.attemptsMade,
        timestamp: job.timestamp,
        finished_on: job.finishedOn,
      })),
      meta: { page: pageNum, pageSize: size, total },
    };
  }

  // POST /v1/admin/queues/:queueName/failed/:jobId/retry — replay a failed job
  @Post(':queueName/failed/:jobId/retry')
  @RequiresPermission('settings.manage')
  @HttpCode(HttpStatus.OK)
  async retryFailedJob(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const queue = this.resolveQueue(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      throw new NotFoundException({
        error: {
          code: 'JOB_NOT_FOUND',
          message: `Job "${jobId}" not found in queue "${queueName}"`,
        },
      });
    }

    const state = await job.getState();
    if (state !== 'failed') {
      throw new NotFoundException({
        error: {
          code: 'JOB_NOT_FAILED',
          message: `Job "${jobId}" is in state "${state}", not "failed"`,
        },
      });
    }

    await job.retry(state);

    return {
      replayed: true,
      job_id: jobId,
      queue: queueName,
      replayed_by: user.sub,
    };
  }

  // DELETE /v1/admin/queues/:queueName/failed/:jobId — discard a failed job
  @Delete(':queueName/failed/:jobId')
  @RequiresPermission('settings.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async discardFailedJob(@Param('queueName') queueName: string, @Param('jobId') jobId: string) {
    const queue = this.resolveQueue(queueName);
    const job = await queue.getJob(jobId);

    if (!job) {
      throw new NotFoundException({
        error: {
          code: 'JOB_NOT_FOUND',
          message: `Job "${jobId}" not found in queue "${queueName}"`,
        },
      });
    }

    await job.remove();
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private resolveQueue(name: string): Queue {
    const queue = this.queues.get(name);
    if (!queue) {
      const validNames = Array.from(this.queues.keys()).join(', ');
      throw new NotFoundException({
        error: {
          code: 'QUEUE_NOT_FOUND',
          message: `Queue "${name}" is not registered. Available: ${validNames}`,
        },
      });
    }
    return queue;
  }
}
