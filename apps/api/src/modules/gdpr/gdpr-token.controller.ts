import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { TenantContext } from '@school/shared';
import { gdprTokenUsageQuerySchema, gdprTokenUsageStatsQuerySchema } from '@school/shared';
import type { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { GdprTokenService } from './gdpr-token.service';

@Controller('v1/gdpr')
@UseGuards(AuthGuard, PermissionGuard)
export class GdprTokenController {
  constructor(private readonly gdprTokenService: GdprTokenService) {}

  @Get('export-policies')
  @RequiresPermission('gdpr.view')
  async getExportPolicies() {
    return this.gdprTokenService.getExportPolicies();
  }

  @Get('token-usage')
  @RequiresPermission('gdpr.view')
  async getUsageLog(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(gdprTokenUsageQuerySchema))
    query: z.infer<typeof gdprTokenUsageQuerySchema>,
  ) {
    return this.gdprTokenService.getUsageLog(tenant.tenant_id, query);
  }

  @Get('token-usage/stats')
  @RequiresPermission('gdpr.view')
  async getUsageStats(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(gdprTokenUsageStatsQuerySchema))
    query: z.infer<typeof gdprTokenUsageStatsQuerySchema>,
  ) {
    return this.gdprTokenService.getUsageStats(tenant.tenant_id, query);
  }
}
