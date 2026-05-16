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
  alertSilenceQuerySchema,
  type AlertSilenceQuery,
  createAlertSilenceSchema,
  type CreateAlertSilenceDto,
  type JwtPayload,
  removeAlertSilenceSchema,
  type RemoveAlertSilenceDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import { AlertSilenceService, type PlatformAlertSilenceRow } from './alert-silence.service';

@Controller('v1/admin/alert-silences')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class AlertSilencesController {
  constructor(private readonly alertSilenceService: AlertSilenceService) {}

  // GET /v1/admin/alert-silences
  @Get()
  @RequiresPlatformPermission('platform.alerts.view')
  async list(
    @Query(new ZodValidationPipe(alertSilenceQuerySchema)) query: AlertSilenceQuery,
  ): Promise<PlatformAlertSilenceRow[]> {
    return this.alertSilenceService.list(query);
  }

  // POST /v1/admin/alert-silences
  @Post()
  @RequiresPlatformPermission('platform.alerts.silence')
  async create(
    @Body(new ZodValidationPipe(createAlertSilenceSchema)) dto: CreateAlertSilenceDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<PlatformAlertSilenceRow> {
    return this.alertSilenceService.create(dto, user.sub, auditContextFromRequest(user, request));
  }

  // DELETE /v1/admin/alert-silences/:id
  @Delete(':id')
  @RequiresPlatformPermission('platform.alerts.silence')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(removeAlertSilenceSchema)) dto: RemoveAlertSilenceDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<PlatformAlertSilenceRow> {
    return this.alertSilenceService.remove(
      id,
      dto,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }
}
