import { Controller, Get, UseGuards } from '@nestjs/common';

import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformOwnerGuard } from '../tenants/guards/platform-owner.guard';

import { HealthService } from './health.service';

@Controller('v1/admin/health')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class AdminHealthController {
  constructor(private readonly healthService: HealthService) {}

  // GET /v1/admin/health
  @Get()
  async getDashboard() {
    return this.healthService.getAdminDashboard();
  }
}
