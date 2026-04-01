import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { z } from 'zod';

import type { TenantContext } from '@school/shared';
import { auditLogFilterSchema, platformAuditLogFilterSchema } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PlatformOwnerGuard } from '../tenants/guards/platform-owner.guard';

import { AuditLogService } from './audit-log.service';

@Controller('v1/audit-logs')
@UseGuards(AuthGuard, PermissionGuard)
export class AuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  @RequiresPermission('analytics.view')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(auditLogFilterSchema))
    query: z.infer<typeof auditLogFilterSchema>,
  ) {
    return this.auditLogService.list(tenant.tenant_id, query);
  }
}

@Controller('v1/admin/audit-logs')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class PlatformAuditLogController {
  constructor(private readonly auditLogService: AuditLogService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(platformAuditLogFilterSchema))
    query: z.infer<typeof platformAuditLogFilterSchema>,
  ) {
    return this.auditLogService.listPlatform(query);
  }
}
