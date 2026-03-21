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
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  assignPermissionsSchema,
  createRoleSchema,
  updateRoleSchema,
} from '@school/shared';
import type {
  AssignPermissionsDto,
  CreateRoleDto,
  UpdateRoleDto,
} from '@school/shared';
import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { RolesService } from './roles.service';

@Controller('v1/roles')
@UseGuards(AuthGuard, PermissionGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequiresPermission('roles.manage')
  async listRoles(@CurrentTenant() tenant: TenantContext) {
    return this.rolesService.listRoles(tenant.tenant_id);
  }

  @Post()
  @RequiresPermission('roles.manage')
  async createRole(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createRoleSchema)) dto: CreateRoleDto,
  ) {
    return this.rolesService.createRole(tenant.tenant_id, dto);
  }

  @Get(':id')
  @RequiresPermission('roles.manage')
  async getRole(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rolesService.getRole(tenant.tenant_id, id);
  }

  @Patch(':id')
  @RequiresPermission('roles.manage')
  async updateRole(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) dto: UpdateRoleDto,
  ) {
    return this.rolesService.updateRole(tenant.tenant_id, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('roles.manage')
  async deleteRole(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rolesService.deleteRole(tenant.tenant_id, id);
  }

  @Put(':id/permissions')
  @RequiresPermission('roles.manage')
  async assignPermissions(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignPermissionsSchema))
    dto: AssignPermissionsDto,
  ) {
    return this.rolesService.assignPermissions(
      tenant.tenant_id,
      id,
      dto.permission_ids,
    );
  }
}
