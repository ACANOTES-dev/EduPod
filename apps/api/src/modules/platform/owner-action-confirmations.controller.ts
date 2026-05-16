import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';

import {
  ownerActionConfirmationQuerySchema,
  type OwnerActionConfirmationQuery,
  ownerActionConfirmationSchema,
  type OwnerActionConfirmationDto,
  type JwtPayload,
} from '@school/shared';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPlatformPermission } from '../../common/decorators/requires-platform-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { auditContextFromRequest } from '../platform-audit/audit-request-context';

import {
  OwnerActionConfirmationService,
  type OwnerActionConfirmationRow,
} from './owner-action-confirmation.service';

@Controller('v1/admin/action-confirmations')
@UseGuards(AuthGuard, PlatformRoleGuard)
export class OwnerActionConfirmationsController {
  constructor(private readonly ownerActionConfirmationService: OwnerActionConfirmationService) {}

  // GET /v1/admin/action-confirmations
  @Get()
  @RequiresPlatformPermission('platform.audit_log.view')
  async list(
    @Query(new ZodValidationPipe(ownerActionConfirmationQuerySchema))
    query: OwnerActionConfirmationQuery,
  ): Promise<{
    data: OwnerActionConfirmationRow[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    return this.ownerActionConfirmationService.list(query);
  }

  // POST /v1/admin/action-confirmations
  @Post()
  @RequiresPlatformPermission('platform.tenants.view')
  async confirmAndExecute(
    @Body(new ZodValidationPipe(ownerActionConfirmationSchema))
    dto: OwnerActionConfirmationDto,
    @CurrentUser() user: JwtPayload,
    @Req() request: Request,
  ): Promise<{ confirmation_id: string; execution_status: 'executed' | 'failed' }> {
    return this.ownerActionConfirmationService.confirmAndExecute(
      dto,
      user.sub,
      auditContextFromRequest(user, request),
    );
  }
}
