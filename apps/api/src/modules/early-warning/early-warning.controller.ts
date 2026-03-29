import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { assignStudentSchema } from './dto/assign-student.dto';
import type { AssignStudentDto } from './dto/assign-student.dto';
import { cohortQuerySchema } from './dto/cohort-query.dto';
import type { CohortQuery } from './dto/cohort-query.dto';
import {
  earlyWarningSummaryQuerySchema,
  listEarlyWarningsQuerySchema,
} from './dto/early-warning-query.dto';
import type {
  EarlyWarningSummaryQuery,
  ListEarlyWarningsQuery,
} from './dto/early-warning-query.dto';
import { updateEarlyWarningConfigSchema } from './dto/update-config.dto';
import type { UpdateEarlyWarningConfigDto } from './dto/update-config.dto';
import { EarlyWarningCohortService } from './early-warning-cohort.service';
import { EarlyWarningConfigService } from './early-warning-config.service';
import { EarlyWarningService } from './early-warning.service';

@Controller('v1/early-warnings')
@ModuleEnabled('early_warning')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class EarlyWarningController {
  constructor(
    private readonly earlyWarningService: EarlyWarningService,
    private readonly configService: EarlyWarningConfigService,
    private readonly cohortService: EarlyWarningCohortService,
  ) {}

  // ─── Static routes (MUST come before :studentId) ──────────────────────────

  // GET /v1/early-warnings
  @Get()
  @RequiresPermission('early_warning.view')
  async list(
    @CurrentTenant() tenantContext: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listEarlyWarningsQuerySchema))
    query: ListEarlyWarningsQuery,
  ) {
    return this.earlyWarningService.listProfiles(
      tenantContext.tenant_id,
      user.sub,
      user.membership_id,
      query,
    );
  }

  // GET /v1/early-warnings/summary
  @Get('summary')
  @RequiresPermission('early_warning.view')
  async summary(
    @CurrentTenant() tenantContext: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(earlyWarningSummaryQuerySchema))
    query: EarlyWarningSummaryQuery,
  ) {
    const summary = await this.earlyWarningService.getTierSummary(
      tenantContext.tenant_id,
      user.sub,
      user.membership_id,
      query,
    );
    return { data: summary };
  }

  // GET /v1/early-warnings/cohort
  @Get('cohort')
  @RequiresPermission('early_warning.view')
  async cohort(
    @CurrentTenant() tenantContext: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(cohortQuerySchema)) query: CohortQuery,
  ) {
    return this.cohortService.getCohortPivot(
      tenantContext.tenant_id,
      user.sub,
      user.membership_id,
      query,
    );
  }

  // GET /v1/early-warnings/config
  @Get('config')
  @RequiresPermission('early_warning.manage')
  async getConfig(@CurrentTenant() tenantContext: TenantContext) {
    const config = await this.configService.getConfig(tenantContext.tenant_id);
    return { data: config };
  }

  // PUT /v1/early-warnings/config
  @Put('config')
  @RequiresPermission('early_warning.manage')
  async updateConfig(
    @CurrentTenant() tenantContext: TenantContext,
    @Body(new ZodValidationPipe(updateEarlyWarningConfigSchema))
    dto: UpdateEarlyWarningConfigDto,
  ) {
    const config = await this.configService.updateConfig(tenantContext.tenant_id, dto);
    return { data: config };
  }

  // ─── Dynamic routes (:studentId) ─────────────────────────────────────────

  // GET /v1/early-warnings/:studentId
  @Get(':studentId')
  @RequiresPermission('early_warning.view')
  async getStudentDetail(
    @CurrentTenant() tenantContext: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    const detail = await this.earlyWarningService.getStudentDetail(
      tenantContext.tenant_id,
      user.sub,
      user.membership_id,
      studentId,
    );
    return { data: detail };
  }

  // POST /v1/early-warnings/:studentId/acknowledge
  @Post(':studentId/acknowledge')
  @RequiresPermission('early_warning.acknowledge')
  @HttpCode(HttpStatus.NO_CONTENT)
  async acknowledge(
    @CurrentTenant() tenantContext: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    await this.earlyWarningService.acknowledgeProfile(
      tenantContext.tenant_id,
      user.sub,
      studentId,
    );
  }

  // POST /v1/early-warnings/:studentId/assign
  @Post(':studentId/assign')
  @RequiresPermission('early_warning.assign')
  @HttpCode(HttpStatus.OK)
  async assign(
    @CurrentTenant() tenantContext: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body(new ZodValidationPipe(assignStudentSchema)) dto: AssignStudentDto,
  ) {
    const result = await this.earlyWarningService.assignStaff(
      tenantContext.tenant_id,
      user.sub,
      studentId,
      dto,
    );
    return { data: result };
  }
}
