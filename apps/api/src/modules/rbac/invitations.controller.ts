import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import {
  acceptInvitationSchema,
  createInvitationSchema,
  paginationQuerySchema,
} from '@school/shared';
import type {
  AcceptInvitationDto,
  CreateInvitationDto,
  JwtPayload,
  PaginationQuery,
  TenantContext,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { InvitationsService } from './invitations.service';

@Controller('v1/invitations')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post()
  @UseGuards(AuthGuard, PermissionGuard)
  @RequiresPermission('users.invite')
  async createInvitation(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createInvitationSchema))
    dto: CreateInvitationDto,
  ) {
    return this.invitationsService.createInvitation(tenant.tenant_id, user.sub, dto);
  }

  @Get()
  @UseGuards(AuthGuard, PermissionGuard)
  @RequiresPermission('users.invite')
  async listInvitations(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: PaginationQuery,
  ) {
    return this.invitationsService.listInvitations(tenant.tenant_id, query.page, query.pageSize);
  }

  @Post(':id/revoke')
  @HttpCode(HttpStatus.OK)
  @UseGuards(AuthGuard, PermissionGuard)
  @RequiresPermission('users.invite')
  async revokeInvitation(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.invitationsService.revokeInvitation(tenant.tenant_id, id);
  }

  /**
   * Accept an invitation. This endpoint is PUBLIC (no AuthGuard).
   * Tenant context comes from the invitation record, not from middleware.
   */
  @Post('accept')
  @HttpCode(HttpStatus.OK)
  async acceptInvitation(
    @Body(new ZodValidationPipe(acceptInvitationSchema))
    dto: AcceptInvitationDto,
  ) {
    return this.invitationsService.acceptInvitation(dto.token, {
      first_name: dto.first_name,
      last_name: dto.last_name,
      password: dto.password,
      phone: dto.phone,
    });
  }
}
