import {
  Body,
  Controller,
  Get,
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

import { createSenProfileSchema, type CreateSenProfileDto } from './dto/create-sen-profile.dto';
import { listSenProfilesQuerySchema, type ListSenProfilesQuery } from './dto/list-sen-profiles.dto';
import { updateSenProfileSchema, type UpdateSenProfileDto } from './dto/update-sen-profile.dto';
import { SenProfileService } from './sen-profile.service';

// ─── Controller ─────────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('sen')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class SenProfileController {
  constructor(
    private readonly senProfileService: SenProfileService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // ─── Dashboard Overview ─────────────────────────────────────────────────────

  // GET /v1/sen/overview
  @Get('sen/overview')
  @RequiresPermission('sen.view')
  async getOverview(@CurrentTenant() tenant: TenantContext) {
    return this.senProfileService.getOverview(tenant.tenant_id);
  }

  // ─── Profile by Student ID ──────────────────────────────────────────────────

  // GET /v1/sen/students/:studentId/profile
  @Get('sen/students/:studentId/profile')
  @RequiresPermission('sen.view')
  async findByStudent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senProfileService.findByStudent(tenant.tenant_id, user.sub, permissions, studentId);
  }

  // ─── Create Profile ─────────────────────────────────────────────────────────

  // POST /v1/sen/profiles
  @Post('sen/profiles')
  @RequiresPermission('sen.manage')
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createSenProfileSchema)) dto: CreateSenProfileDto,
  ) {
    return this.senProfileService.create(tenant.tenant_id, dto);
  }

  // ─── List Profiles ────────────────────────────────────────────────────────────

  // GET /v1/sen/profiles
  @Get('sen/profiles')
  @RequiresPermission('sen.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listSenProfilesQuerySchema)) query: ListSenProfilesQuery,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senProfileService.findAll(tenant.tenant_id, user.sub, permissions, query);
  }

  // ─── Get Single Profile ───────────────────────────────────────────────────────

  // GET /v1/sen/profiles/:id
  @Get('sen/profiles/:id')
  @RequiresPermission('sen.view')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senProfileService.findOne(tenant.tenant_id, user.sub, permissions, id);
  }

  // ─── Update Profile ─────────────────────────────────────────────────────────

  // PATCH /v1/sen/profiles/:id
  @Patch('sen/profiles/:id')
  @RequiresPermission('sen.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSenProfileSchema)) dto: UpdateSenProfileDto,
  ) {
    return this.senProfileService.update(tenant.tenant_id, id, dto);
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  private async getUserPermissions(membershipId: string | null): Promise<string[]> {
    if (!membershipId) return [];
    return this.permissionCacheService.getPermissions(membershipId);
  }
}
