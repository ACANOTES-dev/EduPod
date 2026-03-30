import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload, TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { HomeworkParentService } from './homework-parent.service';

// ─── Query Schemas ────────────────────────────────────────────────────────────

const parentHomeworkQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

type ParentHomeworkQuery = z.infer<typeof parentHomeworkQuerySchema>;

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('v1/parent/homework')
@UseGuards(AuthGuard, PermissionGuard)
export class HomeworkParentController {
  constructor(private readonly service: HomeworkParentService) {}

  // GET /v1/parent/homework
  @Get()
  @RequiresPermission('parent.view_homework')
  async listAll(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(parentHomeworkQuerySchema))
    query: ParentHomeworkQuery,
  ) {
    return this.service.listAll(tenant.tenant_id, user.sub, query);
  }

  // GET /v1/parent/homework/today
  @Get('today')
  @RequiresPermission('parent.view_homework')
  async listToday(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listToday(tenant.tenant_id, user.sub);
  }

  // GET /v1/parent/homework/overdue
  @Get('overdue')
  @RequiresPermission('parent.view_homework')
  async listOverdue(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listOverdue(tenant.tenant_id, user.sub);
  }

  // GET /v1/parent/homework/week
  @Get('week')
  @RequiresPermission('parent.view_homework')
  async listWeek(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.service.listWeek(tenant.tenant_id, user.sub);
  }

  // GET /v1/parent/homework/:studentId/summary
  @Get(':studentId/summary')
  @RequiresPermission('parent.view_homework')
  async studentSummary(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.service.studentSummary(tenant.tenant_id, user.sub, studentId);
  }

  // GET /v1/parent/homework/:studentId/diary
  @Get(':studentId/diary')
  @RequiresPermission('parent.view_homework')
  async studentDiary(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(parentHomeworkQuerySchema))
    query: ParentHomeworkQuery,
  ) {
    return this.service.studentDiary(tenant.tenant_id, user.sub, studentId, query);
  }
}
