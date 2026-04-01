import { Controller, Get, Query, UseGuards } from '@nestjs/common';

import type { RoleTier } from '@school/shared';

import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';

import { RolesService } from './roles.service';

@Controller('v1/permissions')
@UseGuards(AuthGuard, PermissionGuard)
export class PermissionsController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequiresPermission('roles.manage')
  async listPermissions(@Query('tier') tier?: string) {
    const validTiers = ['platform', 'admin', 'staff', 'parent'];
    const roleTier = tier && validTiers.includes(tier) ? (tier as RoleTier) : undefined;
    return this.rolesService.listPermissions(roleTier);
  }
}
