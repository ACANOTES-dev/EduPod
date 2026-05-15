import { Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import type { PlatformAlertHistory } from '@prisma/client';

import { alertHistoryQuerySchema, type AlertHistoryQuery, type JwtPayload } from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
// eslint-disable-next-line school/no-cross-module-internal-import -- Platform admin routes use the existing platform-owner guard.
import { PlatformOwnerGuard } from '../tenants/guards/platform-owner.guard';

import { AlertHistoryService, type AlertHistoryRow } from './alert-history.service';

@Controller('v1/admin/alerts/history')
@UseGuards(AuthGuard, PlatformOwnerGuard)
export class AlertHistoryController {
  constructor(private readonly alertHistoryService: AlertHistoryService) {}

  // GET /v1/admin/alerts/history
  @Get()
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
  async acknowledge(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
  ): Promise<PlatformAlertHistory> {
    return this.alertHistoryService.acknowledge(id, user.sub);
  }
}
