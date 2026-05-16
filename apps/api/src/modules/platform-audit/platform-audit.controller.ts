import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';

import { platformAuditLogQuerySchema, type PlatformAuditLogQuery } from '@school/shared';

import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PlatformAuditService } from './platform-audit.service';

@Controller('v1/admin/platform-audit-logs')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class PlatformAuditController {
  constructor(private readonly platformAuditService: PlatformAuditService) {}

  // GET /v1/admin/platform-audit-logs
  @Get()
  @RequiresPlatformPermission('platform.audit_log.view')
  async list(
    @Query(new ZodValidationPipe(platformAuditLogQuerySchema)) query: PlatformAuditLogQuery,
  ) {
    return this.platformAuditService.list(query);
  }

  // GET /v1/admin/platform-audit-logs/:id
  @Get(':id')
  @RequiresPlatformPermission('platform.audit_log.view')
  async get(@Param('id', ParseUUIDPipe) id: string) {
    return this.platformAuditService.get(id);
  }
}
