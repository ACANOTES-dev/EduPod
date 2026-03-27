import { Controller, Get, UseGuards } from '@nestjs/common';
import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { ResourceService } from '../services/resource.service';

// ─── Controller ──────────────────────────────────────────────────────────────

@Controller('v1')
@ModuleEnabled('staff_wellbeing')
@UseGuards(AuthGuard, ModuleEnabledGuard)
export class ResourceController {
  constructor(private readonly resourceService: ResourceService) {}

  @Get('staff-wellbeing/resources')
  async getResources(@CurrentTenant() tenant: TenantContext) {
    return this.resourceService.getResources(tenant.tenant_id);
  }
}
