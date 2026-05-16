import { Controller, Get, UseGuards } from '@nestjs/common';

import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';

import { HealthService } from './health.service';

@Controller('v1/admin/health')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class AdminHealthController {
  constructor(private readonly healthService: HealthService) {}

  // GET /v1/admin/health
  @Get()
  @RequiresPlatformPermission('platform.alerts.view')
  async getDashboard() {
    return this.healthService.getAdminDashboard();
  }
}
