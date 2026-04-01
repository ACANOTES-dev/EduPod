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
import { z } from 'zod';

import {
  addAdjustmentSchema,
  applyRunSchema,
  createSchedulingRunSchema,
  discardRunSchema,
} from '@school/shared';
import type {
  AddAdjustmentDto,
  ApplyRunDto,
  CreateSchedulingRunDto,
  DiscardRunDto,
} from '@school/shared';
import type { JwtPayload } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { SchedulingApplyService } from './scheduling-apply.service';
import { SchedulingPrerequisitesService } from './scheduling-prerequisites.service';
import { SchedulingRunsService } from './scheduling-runs.service';

const listRunsQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const prerequisitesQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
});

@Controller('v1/scheduling-runs')
@UseGuards(AuthGuard, PermissionGuard)
export class SchedulingRunsController {
  constructor(
    private readonly runsService: SchedulingRunsService,
    private readonly applyService: SchedulingApplyService,
    private readonly prerequisitesService: SchedulingPrerequisitesService,
  ) {}

  /**
   * GET /v1/scheduling-runs/prerequisites
   * Check all prerequisites before starting a new solver run.
   */
  @Get('prerequisites')
  @RequiresPermission('schedule.run_auto')
  async prerequisites(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(prerequisitesQuerySchema))
    query: z.infer<typeof prerequisitesQuerySchema>,
  ) {
    return this.prerequisitesService.check(tenant.tenant_id, query.academic_year_id);
  }

  /**
   * POST /v1/scheduling-runs
   * Start a new scheduling run.
   */
  @Post()
  @RequiresPermission('schedule.run_auto')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createSchedulingRunSchema)) dto: CreateSchedulingRunDto,
  ) {
    return this.runsService.create(tenant.tenant_id, user.sub, dto);
  }

  /**
   * GET /v1/scheduling-runs
   * List all runs for an academic year (excludes large JSONB fields).
   */
  @Get()
  @RequiresPermission('schedule.view_auto_reports')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listRunsQuerySchema))
    query: z.infer<typeof listRunsQuerySchema>,
  ) {
    return this.runsService.findAll(tenant.tenant_id, query.academic_year_id, {
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  /**
   * GET /v1/scheduling-runs/:id
   * Get a single run with full result_json and proposed_adjustments.
   */
  @Get(':id')
  @RequiresPermission('schedule.view_auto_reports')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runsService.findById(tenant.tenant_id, id);
  }

  /**
   * GET /v1/scheduling-runs/:id/progress
   * Poll the progress of an active run.
   */
  @Get(':id/progress')
  @RequiresPermission('schedule.run_auto')
  async getProgress(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runsService.getProgress(tenant.tenant_id, id);
  }

  /**
   * POST /v1/scheduling-runs/:id/cancel
   * Cancel a queued or running scheduling run.
   */
  @Post(':id/cancel')
  @RequiresPermission('schedule.run_auto')
  @HttpCode(HttpStatus.OK)
  async cancel(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.runsService.cancel(tenant.tenant_id, id);
  }

  /**
   * PATCH /v1/scheduling-runs/:id/adjustments
   * Add a manual adjustment to a completed run.
   */
  @Patch(':id/adjustments')
  @RequiresPermission('schedule.apply_auto')
  async addAdjustment(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(addAdjustmentSchema)) dto: AddAdjustmentDto,
  ) {
    return this.runsService.addAdjustment(tenant.tenant_id, id, dto);
  }

  /**
   * POST /v1/scheduling-runs/:id/apply
   * Apply a completed run's schedule to the live timetable.
   */
  @Post(':id/apply')
  @RequiresPermission('schedule.apply_auto')
  @HttpCode(HttpStatus.OK)
  async apply(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(applyRunSchema)) dto: ApplyRunDto,
  ) {
    return this.applyService.apply(tenant.tenant_id, id, user.sub, dto);
  }

  /**
   * POST /v1/scheduling-runs/:id/discard
   * Discard a completed run without applying it.
   */
  @Post(':id/discard')
  @RequiresPermission('schedule.apply_auto')
  @HttpCode(HttpStatus.OK)
  async discard(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(discardRunSchema)) dto: DiscardRunDto,
  ) {
    return this.runsService.discard(tenant.tenant_id, id, dto);
  }
}
