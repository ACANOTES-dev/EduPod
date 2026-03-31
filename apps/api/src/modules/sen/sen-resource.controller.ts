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

import {
  createResourceAllocationSchema,
  type CreateResourceAllocationDto,
} from './dto/create-resource-allocation.dto';
import {
  createSenStudentHoursSchema,
  type CreateSenStudentHoursDto,
} from './dto/create-student-hours.dto';
import {
  listResourceAllocationsQuerySchema,
  type ListResourceAllocationsQuery,
} from './dto/list-resource-allocations.dto';
import {
  listSenStudentHoursQuerySchema,
  type ListSenStudentHoursQuery,
} from './dto/list-student-hours.dto';
import {
  resourceUtilisationQuerySchema,
  type ResourceUtilisationQuery,
} from './dto/resource-utilisation-query.dto';
import {
  updateResourceAllocationSchema,
  type UpdateResourceAllocationDto,
} from './dto/update-resource-allocation.dto';
import {
  updateSenStudentHoursSchema,
  type UpdateSenStudentHoursDto,
} from './dto/update-student-hours.dto';
import { SenResourceService } from './sen-resource.service';

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('sen')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class SenResourceController {
  constructor(
    private readonly senResourceService: SenResourceService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // ─── Resource allocations ─────────────────────────────────────────────────

  // POST /v1/sen/resource-allocations
  @Post('sen/resource-allocations')
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('sen.manage_resources')
  async createAllocation(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createResourceAllocationSchema)) dto: CreateResourceAllocationDto,
  ) {
    return this.senResourceService.createAllocation(tenant.tenant_id, dto);
  }

  // GET /v1/sen/resource-allocations
  @Get('sen/resource-allocations')
  @RequiresPermission('sen.view')
  async findAllAllocations(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listResourceAllocationsQuerySchema))
    query: ListResourceAllocationsQuery,
  ) {
    return this.senResourceService.findAllAllocations(tenant.tenant_id, query);
  }

  // PATCH /v1/sen/resource-allocations/:id
  @Patch('sen/resource-allocations/:id')
  @RequiresPermission('sen.manage_resources')
  async updateAllocation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateResourceAllocationSchema)) dto: UpdateResourceAllocationDto,
  ) {
    return this.senResourceService.updateAllocation(tenant.tenant_id, id, dto);
  }

  // ─── Student hours ────────────────────────────────────────────────────────

  // POST /v1/sen/student-hours
  @Post('sen/student-hours')
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('sen.manage_resources')
  async assignStudentHours(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createSenStudentHoursSchema)) dto: CreateSenStudentHoursDto,
  ) {
    return this.senResourceService.assignStudentHours(tenant.tenant_id, dto);
  }

  // GET /v1/sen/student-hours
  @Get('sen/student-hours')
  @RequiresPermission('sen.view')
  async findStudentHours(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listSenStudentHoursQuerySchema)) query: ListSenStudentHoursQuery,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    return this.senResourceService.findStudentHours(tenant.tenant_id, user.sub, permissions, query);
  }

  // PATCH /v1/sen/student-hours/:id
  @Patch('sen/student-hours/:id')
  @RequiresPermission('sen.manage_resources')
  async updateStudentHours(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSenStudentHoursSchema)) dto: UpdateSenStudentHoursDto,
  ) {
    return this.senResourceService.updateStudentHours(tenant.tenant_id, id, dto);
  }

  // ─── Utilisation ──────────────────────────────────────────────────────────

  // GET /v1/sen/resource-utilisation
  @Get('sen/resource-utilisation')
  @RequiresPermission('sen.view')
  async getUtilisation(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(resourceUtilisationQuerySchema)) query: ResourceUtilisationQuery,
  ) {
    return this.senResourceService.getUtilisation(tenant.tenant_id, query);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async getUserPermissions(membershipId: string | null): Promise<string[]> {
    if (!membershipId) return [];
    return this.permissionCacheService.getPermissions(membershipId);
  }
}
