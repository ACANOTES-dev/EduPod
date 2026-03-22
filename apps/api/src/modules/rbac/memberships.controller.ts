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
  updateMembershipRolesSchema,
  userListQuerySchema,
} from '@school/shared';
import type {
  TenantContext,
  UpdateMembershipRolesDto,
  UserListQuery,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { MembershipsService } from './memberships.service';

@Controller('v1/users')
@UseGuards(AuthGuard, PermissionGuard)
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  @Get()
  @RequiresPermission('users.view')
  async listUsers(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(userListQuerySchema))
    query: UserListQuery,
  ) {
    return this.membershipsService.listUsers(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('users.view')
  async getUser(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.getUser(tenant.tenant_id, id);
  }

  @Patch(':id/membership')
  @RequiresPermission('users.manage')
  async updateMembershipRoles(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMembershipRolesSchema))
    dto: UpdateMembershipRolesDto,
  ) {
    return this.membershipsService.updateMembershipRoles(
      tenant.tenant_id,
      id,
      dto.role_ids,
    );
  }

  @Post(':id/suspend')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('users.manage')
  async suspendMembership(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.suspendMembership(tenant.tenant_id, id);
  }

  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('users.manage')
  async reactivateMembership(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.membershipsService.reactivateMembership(tenant.tenant_id, id);
  }
}
