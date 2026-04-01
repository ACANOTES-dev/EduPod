import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import { triggerSolverRunSchema } from '@school/shared';
import type { JwtPayload, TriggerSolverRunDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { SchedulerOrchestrationService } from './scheduler-orchestration.service';

const prerequisitesQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
});

const listRunsQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const applyBodySchema = z.object({
  acknowledged_violations: z.boolean().optional(),
});

@Controller('v1/scheduling/runs')
@UseGuards(AuthGuard, PermissionGuard)
export class SchedulerOrchestrationController {
  constructor(private readonly service: SchedulerOrchestrationService) {}

  @Post('prerequisites')
  @RequiresPermission('schedule.run_auto')
  @HttpCode(HttpStatus.OK)
  async checkPrerequisites(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(prerequisitesQuerySchema))
    body: z.infer<typeof prerequisitesQuerySchema>,
  ) {
    return this.service.checkPrerequisites(tenant.tenant_id, body.academic_year_id);
  }

  @Post('trigger')
  @RequiresPermission('schedule.run_auto')
  @HttpCode(HttpStatus.CREATED)
  async trigger(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(triggerSolverRunSchema))
    dto: TriggerSolverRunDto,
  ) {
    return this.service.triggerSolverRun(tenant.tenant_id, dto.academic_year_id, user.sub, dto);
  }

  @Get()
  @RequiresPermission('schedule.view_auto_reports')
  async listRuns(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listRunsQuerySchema))
    query: z.infer<typeof listRunsQuerySchema>,
  ) {
    return this.service.listRuns(
      tenant.tenant_id,
      query.academic_year_id,
      query.page,
      query.pageSize,
    );
  }

  @Get(':id')
  @RequiresPermission('schedule.view_auto_reports')
  async getRun(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getRun(tenant.tenant_id, id);
  }

  @Post(':id/apply')
  @RequiresPermission('schedule.apply_auto')
  @HttpCode(HttpStatus.OK)
  async applyRun(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(applyBodySchema))
    body: z.infer<typeof applyBodySchema>,
  ) {
    return this.service.applyRun(tenant.tenant_id, id, user.sub, body.acknowledged_violations);
  }

  @Post(':id/discard')
  @RequiresPermission('schedule.run_auto')
  @HttpCode(HttpStatus.OK)
  async discardRun(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.discardRun(tenant.tenant_id, id);
  }

  @Get(':id/status')
  @RequiresPermission('schedule.run_auto')
  async getRunStatus(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getRunStatus(tenant.tenant_id, id);
  }
}
