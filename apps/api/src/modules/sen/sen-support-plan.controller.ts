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

import { cloneSupportPlanSchema, type CloneSupportPlanDto } from './dto/clone-support-plan.dto';
import { createSupportPlanSchema, type CreateSupportPlanDto } from './dto/create-support-plan.dto';
import {
  listSupportPlansQuerySchema,
  type ListSupportPlansQuery,
} from './dto/list-support-plans.dto';
import {
  supportPlanStatusTransitionSchema,
  type SupportPlanStatusTransitionDto,
} from './dto/support-plan-status-transition.dto';
import { updateSupportPlanSchema, type UpdateSupportPlanDto } from './dto/update-support-plan.dto';
import { SenSupportPlanService } from './sen-support-plan.service';

@Controller('v1')
@ModuleEnabled('sen')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class SenSupportPlanController {
  constructor(
    private readonly senSupportPlanService: SenSupportPlanService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // POST /v1/sen/profiles/:profileId/plans
  @Post('sen/profiles/:profileId/plans')
  @RequiresPermission('sen.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Body(new ZodValidationPipe(createSupportPlanSchema)) dto: CreateSupportPlanDto,
  ) {
    return this.senSupportPlanService.create(tenant.tenant_id, profileId, dto, user.sub);
  }

  // GET /v1/sen/profiles/:profileId/plans
  @Get('sen/profiles/:profileId/plans')
  @RequiresPermission('sen.view')
  async findAllByProfile(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('profileId', ParseUUIDPipe) profileId: string,
    @Query(new ZodValidationPipe(listSupportPlansQuerySchema)) query: ListSupportPlansQuery,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senSupportPlanService.findAllByProfile(
      tenant.tenant_id,
      user.sub,
      permissions,
      profileId,
      query,
    );
  }

  // GET /v1/sen/plans/:id
  @Get('sen/plans/:id')
  @RequiresPermission('sen.view')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senSupportPlanService.findOne(tenant.tenant_id, user.sub, permissions, id);
  }

  // PATCH /v1/sen/plans/:id
  @Patch('sen/plans/:id')
  @RequiresPermission('sen.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSupportPlanSchema)) dto: UpdateSupportPlanDto,
  ) {
    return this.senSupportPlanService.update(tenant.tenant_id, id, dto);
  }

  // PATCH /v1/sen/plans/:id/status
  @Patch('sen/plans/:id/status')
  @RequiresPermission('sen.manage')
  async transitionStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(supportPlanStatusTransitionSchema))
    dto: SupportPlanStatusTransitionDto,
  ) {
    return this.senSupportPlanService.transitionStatus(tenant.tenant_id, id, dto, user.sub);
  }

  // POST /v1/sen/plans/:id/clone
  @Post('sen/plans/:id/clone')
  @RequiresPermission('sen.manage')
  @HttpCode(HttpStatus.CREATED)
  async clone(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cloneSupportPlanSchema)) dto: CloneSupportPlanDto,
  ) {
    return this.senSupportPlanService.clone(tenant.tenant_id, id, dto, user.sub);
  }

  private async getUserPermissions(membershipId: string | null): Promise<string[]> {
    if (!membershipId) return [];
    return this.permissionCacheService.getPermissions(membershipId);
  }
}
