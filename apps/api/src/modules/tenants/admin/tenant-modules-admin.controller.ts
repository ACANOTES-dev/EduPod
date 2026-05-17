import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';

import { RequiresPlatformPermission } from '../../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../../common/guards/platform-role.guard';

import { TenantModulesAdminService } from './tenant-modules-admin.service';

@Controller('v1/admin/tenants')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class TenantModulesAdminController {
  constructor(private readonly service: TenantModulesAdminService) {}

  // GET /v1/admin/tenants/:id/modules
  @Get(':id/modules')
  @RequiresPlatformPermission('platform.tenants.view')
  async getModules(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getModulesView(id);
  }
}
