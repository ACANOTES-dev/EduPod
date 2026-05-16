import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { PlatformAlertHistory } from '@prisma/client';
import type { Request } from 'express';

import { alertHistoryQuerySchema, type AlertHistoryQuery, type JwtPayload } from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import { AlertHistoryService, type AlertHistoryRow } from './alert-history.service';

@Controller('v1/admin/alerts/history')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class AlertHistoryController {
  constructor(private readonly alertHistoryService: AlertHistoryService) {}

  // GET /v1/admin/alerts/history
  @Get()
  @RequiresPlatformPermission('platform.alerts.view')
  async list(
    @Query(new ZodValidationPipe(alertHistoryQuerySchema)) query: AlertHistoryQuery,
  ): Promise<{
    data: AlertHistoryRow[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    return this.alertHistoryService.list(query);
  }

  // PATCH /v1/admin/alerts/history/:id/acknowledge
  @Patch(':id/acknowledge')
  @RequiresPlatformPermission('platform.alerts.acknowledge')
  async acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<PlatformAlertHistory> {
    return this.alertHistoryService.acknowledge(
      id,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }
}
