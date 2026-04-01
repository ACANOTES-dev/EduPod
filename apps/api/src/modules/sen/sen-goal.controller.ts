import {
  Body,
  Controller,
  Delete,
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

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import {
  createSenGoalStrategySchema,
  type CreateSenGoalStrategyDto,
} from './dto/create-goal-strategy.dto';
import { createSenGoalSchema, type CreateSenGoalDto } from './dto/create-sen-goal.dto';
import {
  listSenGoalProgressQuerySchema,
  type ListSenGoalProgressQuery,
} from './dto/list-goal-progress.dto';
import { listSenGoalsQuerySchema, type ListSenGoalsQuery } from './dto/list-sen-goals.dto';
import {
  createSenGoalProgressSchema,
  type CreateSenGoalProgressDto,
} from './dto/record-goal-progress.dto';
import {
  senGoalStatusTransitionSchema,
  type SenGoalStatusTransitionDto,
} from './dto/sen-goal-status-transition.dto';
import {
  updateSenGoalStrategySchema,
  type UpdateSenGoalStrategyDto,
} from './dto/update-goal-strategy.dto';
import { updateSenGoalSchema, type UpdateSenGoalDto } from './dto/update-sen-goal.dto';
import { SenGoalService } from './sen-goal.service';

@Controller('v1')
@ModuleEnabled('sen')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class SenGoalController {
  constructor(
    private readonly senGoalService: SenGoalService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // POST /v1/sen/plans/:planId/goals
  @Post('sen/plans/:planId/goals')
  @RequiresPermission('sen.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Body(new ZodValidationPipe(createSenGoalSchema)) dto: CreateSenGoalDto,
  ) {
    return this.senGoalService.create(tenant.tenant_id, planId, dto);
  }

  // GET /v1/sen/plans/:planId/goals
  @Get('sen/plans/:planId/goals')
  @RequiresPermission('sen.view')
  async findAllByPlan(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('planId', ParseUUIDPipe) planId: string,
    @Query(new ZodValidationPipe(listSenGoalsQuerySchema)) query: ListSenGoalsQuery,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senGoalService.findAllByPlan(
      tenant.tenant_id,
      user.sub,
      permissions,
      planId,
      query,
    );
  }

  // PATCH /v1/sen/goals/:id
  @Patch('sen/goals/:id')
  @RequiresPermission('sen.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSenGoalSchema)) dto: UpdateSenGoalDto,
  ) {
    return this.senGoalService.update(tenant.tenant_id, id, dto);
  }

  // PATCH /v1/sen/goals/:id/status
  @Patch('sen/goals/:id/status')
  @RequiresPermission('sen.manage')
  async transitionStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(senGoalStatusTransitionSchema))
    dto: SenGoalStatusTransitionDto,
  ) {
    return this.senGoalService.transitionStatus(tenant.tenant_id, id, dto, user.sub);
  }

  // POST /v1/sen/goals/:id/progress
  @Post('sen/goals/:id/progress')
  @RequiresPermission('sen.manage')
  @HttpCode(HttpStatus.CREATED)
  async recordProgress(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createSenGoalProgressSchema)) dto: CreateSenGoalProgressDto,
  ) {
    return this.senGoalService.recordProgress(tenant.tenant_id, id, dto, user.sub);
  }

  // GET /v1/sen/goals/:id/progress
  @Get('sen/goals/:id/progress')
  @RequiresPermission('sen.view')
  async findProgress(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(listSenGoalProgressQuerySchema))
    query: ListSenGoalProgressQuery,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senGoalService.findProgress(tenant.tenant_id, user.sub, permissions, id, query);
  }

  // POST /v1/sen/goals/:id/strategies
  @Post('sen/goals/:id/strategies')
  @RequiresPermission('sen.manage')
  @HttpCode(HttpStatus.CREATED)
  async createStrategy(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createSenGoalStrategySchema)) dto: CreateSenGoalStrategyDto,
  ) {
    return this.senGoalService.createStrategy(tenant.tenant_id, id, dto);
  }

  // GET /v1/sen/goals/:id/strategies
  @Get('sen/goals/:id/strategies')
  @RequiresPermission('sen.view')
  async findStrategies(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query() _query: Record<string, never>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senGoalService.findStrategies(tenant.tenant_id, user.sub, permissions, id);
  }

  // PATCH /v1/sen/strategies/:id
  @Patch('sen/strategies/:id')
  @RequiresPermission('sen.manage')
  async updateStrategy(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSenGoalStrategySchema)) dto: UpdateSenGoalStrategyDto,
  ) {
    return this.senGoalService.updateStrategy(tenant.tenant_id, id, dto);
  }

  // DELETE /v1/sen/strategies/:id
  @Delete('sen/strategies/:id')
  @RequiresPermission('sen.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteStrategy(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.senGoalService.deleteStrategy(tenant.tenant_id, id);
  }

  private async getUserPermissions(membershipId: string | null): Promise<string[]> {
    if (!membershipId) return [];
    return this.permissionCacheService.getPermissions(membershipId);
  }
}
