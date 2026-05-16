import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import { cleanQueueSchema, listQueueJobsQuerySchema, type JwtPayload } from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';
import { PlatformAuditService } from '../platform-audit/platform-audit.service';

import type { CleanQueueDto, ListQueueJobsQuery } from './dto/queue.dto';
import { QueueManagementService } from './queue-management.service';

@Controller('v1/admin/queues')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class QueueAdminController {
  constructor(
    private readonly queueManagementService: QueueManagementService,
    private readonly platformAuditService: PlatformAuditService,
  ) {}

  // GET /v1/admin/queues
  @Get()
  @RequiresPlatformPermission('platform.queues.view')
  async listQueues() {
    return this.queueManagementService.listQueues();
  }

  // GET /v1/admin/queues/failed
  @Get('failed')
  @RequiresPlatformPermission('platform.queues.view')
  async getFailedSummary() {
    const queues = await this.queueManagementService.listQueues();
    return {
      data: queues
        .filter((queue) => queue.counts.failed > 0)
        .map((queue) => ({ queue: queue.name, failed_count: queue.counts.failed })),
    };
  }

  // GET /v1/admin/queues/:name/jobs
  @Get(':name/jobs')
  @RequiresPlatformPermission('platform.queues.view')
  async listJobs(
    @Param('name') name: string,
    @Query(new ZodValidationPipe(listQueueJobsQuerySchema)) query: ListQueueJobsQuery,
  ) {
    return this.queueManagementService.listJobs(name, query);
  }

  // GET /v1/admin/queues/:name/jobs/:id
  @Get(':name/jobs/:id')
  @RequiresPlatformPermission('platform.queues.view')
  async getJobDetail(@Param('name') name: string, @Param('id') jobId: string) {
    return this.queueManagementService.getJobDetail(name, jobId);
  }

  // GET /v1/admin/queues/:queueName/failed
  @Get(':queueName/failed')
  @RequiresPlatformPermission('platform.queues.view')
  async listFailedJobs(
    @Param('queueName') queueName: string,
    @Query(new ZodValidationPipe(listQueueJobsQuerySchema)) query: ListQueueJobsQuery,
  ) {
    return this.queueManagementService.listJobs(queueName, { ...query, status: 'failed' });
  }

  // POST /v1/admin/queues/:name/jobs/:id/retry
  @Post(':name/jobs/:id/retry')
  @RequiresPlatformPermission('platform.queues.retry')
  @HttpCode(HttpStatus.OK)
  async retryJob(
    @Param('name') name: string,
    @Param('id') jobId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    const result = await this.queueManagementService.retryJob(name, jobId);
    await this.platformAuditService.log({
      ...auditContextFromRequest(user, request),
      action: 'job_retried',
      target_resource_type: 'queue_job',
      target_resource_id: jobId,
      payload: { extra: { queue: name } },
    });
    return result;
  }

  // POST /v1/admin/queues/:queueName/failed/:jobId/retry
  @Post(':queueName/failed/:jobId/retry')
  @RequiresPlatformPermission('platform.queues.retry')
  @HttpCode(HttpStatus.OK)
  async retryFailedJob(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    await this.retryJob(queueName, jobId, user, request);
    return {
      replayed: true,
      job_id: jobId,
      queue: queueName,
      replayed_by: user.sub,
    };
  }

  // POST /v1/admin/queues/:name/pause
  @Post(':name/pause')
  @RequiresPlatformPermission('platform.queues.pause')
  @HttpCode(HttpStatus.OK)
  async pauseQueue(
    @Param('name') name: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    const result = await this.queueManagementService.pauseQueue(name);
    await this.platformAuditService.log({
      ...auditContextFromRequest(user, request),
      action: 'queue_paused',
      target_resource_type: 'queue',
      target_resource_id: name,
      payload: { extra: { queue: name } },
    });
    return result;
  }

  // POST /v1/admin/queues/:name/resume
  @Post(':name/resume')
  @RequiresPlatformPermission('platform.queues.pause')
  @HttpCode(HttpStatus.OK)
  async resumeQueue(
    @Param('name') name: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    const result = await this.queueManagementService.resumeQueue(name);
    await this.platformAuditService.log({
      ...auditContextFromRequest(user, request),
      action: 'queue_resumed',
      target_resource_type: 'queue',
      target_resource_id: name,
      payload: { extra: { queue: name } },
    });
    return result;
  }

  // POST /v1/admin/queues/:name/clean
  @Post(':name/clean')
  @RequiresPlatformPermission('platform.queues.clean')
  @HttpCode(HttpStatus.OK)
  async cleanQueue(
    @Param('name') name: string,
    @Body(new ZodValidationPipe(cleanQueueSchema)) dto: CleanQueueDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    const result = await this.queueManagementService.cleanQueue(name, dto);
    await this.platformAuditService.log({
      ...auditContextFromRequest(user, request),
      action: 'queue_cleaned',
      target_resource_type: 'queue',
      target_resource_id: name,
      payload: { extra: { queue: name, ...dto, cleaned: result.cleaned } },
    });
    return result;
  }

  // DELETE /v1/admin/queues/:queueName/failed/:jobId
  @Delete(':queueName/failed/:jobId')
  @RequiresPlatformPermission('platform.queues.clean')
  @HttpCode(HttpStatus.NO_CONTENT)
  async discardFailedJob(
    @Param('queueName') queueName: string,
    @Param('jobId') jobId: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ) {
    const removed = await this.queueManagementService.removeJob(queueName, jobId);
    await this.platformAuditService.log({
      ...auditContextFromRequest(user, request),
      action: 'job_removed',
      target_resource_type: 'queue_job',
      target_resource_id: jobId,
      payload: {
        extra: {
          queue: queueName,
          ...removed,
        },
      },
    });
  }
}
