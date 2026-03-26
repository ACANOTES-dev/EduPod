import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  cancelTaskSchema,
  completeTaskSchema,
  listTasksQuerySchema,
  updateTaskSchema,
} from '@school/shared';
import type { JwtPayload, TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourTasksService } from './behaviour-tasks.service';

// ─── Local Query Schemas ─────────────────────────────────────────────────────

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class BehaviourTasksController {
  constructor(
    private readonly tasksService: BehaviourTasksService,
  ) {}

  // ─── List Tasks ────────────────────────────────────────────────────────────

  @Get('behaviour/tasks')
  @RequiresPermission('behaviour.view')
  async listTasks(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listTasksQuerySchema))
    query: z.infer<typeof listTasksQuerySchema>,
  ) {
    return this.tasksService.listTasks(tenant.tenant_id, query);
  }

  // ─── My Pending Tasks ─────────────────────────────────────────────────────

  @Get('behaviour/tasks/my')
  @RequiresPermission('behaviour.view')
  async getMyTasks(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.tasksService.getMyTasks(
      tenant.tenant_id,
      user.sub,
      query.page,
      query.pageSize,
    );
  }

  // ─── Overdue Tasks ────────────────────────────────────────────────────────

  @Get('behaviour/tasks/overdue')
  @RequiresPermission('behaviour.manage')
  async getOverdueTasks(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.tasksService.getOverdueTasks(
      tenant.tenant_id,
      query.page,
      query.pageSize,
    );
  }

  // ─── Dashboard Stats ──────────────────────────────────────────────────────

  @Get('behaviour/tasks/stats')
  @RequiresPermission('behaviour.view')
  async getTaskStats(
    @CurrentTenant() tenant: TenantContext,
  ) {
    return this.tasksService.getTaskStats(tenant.tenant_id);
  }

  // ─── Task Detail ──────────────────────────────────────────────────────────

  @Get('behaviour/tasks/:id')
  @RequiresPermission('behaviour.view')
  async getTask(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.getTask(tenant.tenant_id, id);
  }

  // ─── Update Task ──────────────────────────────────────────────────────────

  @Patch('behaviour/tasks/:id')
  @RequiresPermission('behaviour.manage')
  async updateTask(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTaskSchema))
    dto: z.infer<typeof updateTaskSchema>,
  ) {
    return this.tasksService.updateTask(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
  }

  // ─── Complete Task ────────────────────────────────────────────────────────

  @Post('behaviour/tasks/:id/complete')
  @RequiresPermission('behaviour.view', 'behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async completeTask(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(completeTaskSchema))
    dto: z.infer<typeof completeTaskSchema>,
  ) {
    return this.tasksService.completeTask(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
  }

  // ─── Cancel Task ──────────────────────────────────────────────────────────

  @Post('behaviour/tasks/:id/cancel')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async cancelTask(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelTaskSchema))
    dto: z.infer<typeof cancelTaskSchema>,
  ) {
    return this.tasksService.cancelTask(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
  }
}
