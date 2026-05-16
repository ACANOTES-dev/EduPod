import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  alertMaintenanceWindowQuerySchema,
  type AlertMaintenanceWindowQuery,
  cancelAlertMaintenanceWindowSchema,
  type CancelAlertMaintenanceWindowDto,
  createAlertMaintenanceWindowSchema,
  type CreateAlertMaintenanceWindowDto,
  type JwtPayload,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import {
  MaintenanceWindowService,
  type PlatformMaintenanceWindowRow,
} from './maintenance-window.service';

@Controller('v1/admin/alert-maintenance-windows')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class MaintenanceWindowsController {
  constructor(private readonly maintenanceWindowService: MaintenanceWindowService) {}

  // GET /v1/admin/alert-maintenance-windows
  @Get()
  @RequiresPlatformPermission('platform.alerts.view')
  async list(
    @Query(new ZodValidationPipe(alertMaintenanceWindowQuerySchema))
    query: AlertMaintenanceWindowQuery,
  ): Promise<PlatformMaintenanceWindowRow[]> {
    return this.maintenanceWindowService.list(query);
  }

  // POST /v1/admin/alert-maintenance-windows
  @Post()
  @RequiresPlatformPermission('platform.alerts.silence')
  async create(
    @Body(new ZodValidationPipe(createAlertMaintenanceWindowSchema))
    dto: CreateAlertMaintenanceWindowDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<PlatformMaintenanceWindowRow> {
    return this.maintenanceWindowService.create(
      dto,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }

  // DELETE /v1/admin/alert-maintenance-windows/:id
  @Delete(':id')
  @RequiresPlatformPermission('platform.alerts.silence')
  async cancel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelAlertMaintenanceWindowSchema))
    dto: CancelAlertMaintenanceWindowDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<PlatformMaintenanceWindowRow> {
    return this.maintenanceWindowService.cancel(
      id,
      dto,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }
}
