import { Controller, Get, UseGuards } from '@nestjs/common';

import type { TenantContext } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';

import { TenantsService } from './tenants.service';

@Controller('v1/tenants')
@UseGuards(AuthGuard)
export class TenantSelfController {
  constructor(private readonly tenantsService: TenantsService) {}

  // GET /v1/tenants/me
  @Get('me')
  async getCurrentTenant(@CurrentTenant() tenant: TenantContext) {
    return this.tenantsService.getTenantLocaleConfig(tenant.tenant_id);
  }
}
