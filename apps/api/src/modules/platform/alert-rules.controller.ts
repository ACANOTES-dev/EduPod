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
import type { PlatformAlertRule } from '@prisma/client';
import type { Request } from 'express';

import {
  createAlertRuleSchema,
  type CreateAlertRuleDto,
  type JwtPayload,
  updateAlertRuleSchema,
  type UpdateAlertRuleDto,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import { AlertRulesService } from './alert-rules.service';

@Controller('v1/admin/alerts/rules')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class AlertRulesController {
  constructor(private readonly alertRulesService: AlertRulesService) {}

  // GET /v1/admin/alerts/rules
  @Get()
  @RequiresPlatformPermission('platform.alerts.view')
  async list(): Promise<PlatformAlertRule[]> {
    return this.alertRulesService.list();
  }

  // POST /v1/admin/alerts/rules
  @Post()
  @RequiresPlatformPermission('platform.alerts.silence')
  async create(
    @Body(new ZodValidationPipe(createAlertRuleSchema)) dto: CreateAlertRuleDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<PlatformAlertRule> {
    return this.alertRulesService.create(dto, auditContextFromRequest(user, request));
  }

  // PATCH /v1/admin/alerts/rules/:id
  @Patch(':id')
  @RequiresPlatformPermission('platform.alerts.silence')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAlertRuleSchema)) dto: UpdateAlertRuleDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<PlatformAlertRule> {
    return this.alertRulesService.update(id, dto, auditContextFromRequest(user, request));
  }

  // DELETE /v1/admin/alerts/rules/:id
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequiresPlatformPermission('platform.alerts.silence')
  async remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<void> {
    await this.alertRulesService.remove(id, auditContextFromRequest(user, request));
  }
}
