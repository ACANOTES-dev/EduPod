import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';

import {
  createAlertChannelSchema,
  type CreateAlertChannelDto,
  type JwtPayload,
  updateAlertChannelSchema,
  type UpdateAlertChannelDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import { AlertChannelsService, type AlertChannelResponse } from './alert-channels.service';

@Controller('v1/admin/alerts/channels')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class AlertChannelsController {
  constructor(private readonly channelsService: AlertChannelsService) {}

  // GET /v1/admin/alerts/channels
  @Get()
  @RequiresPlatformPermission('platform.alerts.view')
  async listChannels(): Promise<AlertChannelResponse[]> {
    return this.channelsService.listChannels();
  }

  // POST /v1/admin/alerts/channels
  @Post()
  @RequiresPlatformPermission('platform.alerts.silence')
  async createChannel(
    @Body(new ZodValidationPipe(createAlertChannelSchema)) dto: CreateAlertChannelDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<AlertChannelResponse> {
    return this.channelsService.createChannel(dto, auditContextFromRequest(user, request));
  }

  // PATCH /v1/admin/alerts/channels/:id
  @Patch(':id')
  @RequiresPlatformPermission('platform.alerts.silence')
  async updateChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAlertChannelSchema)) dto: UpdateAlertChannelDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<AlertChannelResponse> {
    return this.channelsService.updateChannel(id, dto, auditContextFromRequest(user, request));
  }

  // DELETE /v1/admin/alerts/channels/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPlatformPermission('platform.alerts.silence')
  async deleteChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<void> {
    await this.channelsService.deleteChannel(id, auditContextFromRequest(user, request));
  }

  // POST /v1/admin/alerts/channels/:id/test
  @Post(':id/test')
  @HttpCode(HttpStatus.OK)
  @RequiresPlatformPermission('platform.alerts.silence')
  async testChannel(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<{ success: boolean; message: string }> {
    return this.channelsService.testChannel(id, auditContextFromRequest(user, request));
  }
}
