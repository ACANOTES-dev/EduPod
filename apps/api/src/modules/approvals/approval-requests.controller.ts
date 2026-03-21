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
  approvalCommentSchema,
  approvalRequestFilterSchema,
  paginationQuerySchema,
} from '@school/shared';
import type {
  ApprovalCommentDto,
  JwtPayload,
  TenantContext,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ApprovalRequestsService } from './approval-requests.service';

const listRequestsQuerySchema = paginationQuerySchema.merge(
  approvalRequestFilterSchema,
);

type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>;

@Controller('v1/approval-requests')
@UseGuards(AuthGuard, PermissionGuard)
export class ApprovalRequestsController {
  constructor(
    private readonly requestsService: ApprovalRequestsService,
  ) {}

  @Get()
  @RequiresPermission('approvals.view')
  async listRequests(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listRequestsQuerySchema))
    query: ListRequestsQuery,
  ) {
    return this.requestsService.listRequests(tenant.tenant_id, {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
    });
  }

  @Get(':id')
  @RequiresPermission('approvals.view')
  async getRequest(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.requestsService.getRequest(tenant.tenant_id, id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('approvals.manage')
  async approveRequest(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(approvalCommentSchema))
    dto: ApprovalCommentDto,
  ) {
    return this.requestsService.approve(
      tenant.tenant_id,
      id,
      user.sub,
      dto.comment,
    );
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('approvals.manage')
  async rejectRequest(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(approvalCommentSchema))
    dto: ApprovalCommentDto,
  ) {
    return this.requestsService.reject(
      tenant.tenant_id,
      id,
      user.sub,
      dto.comment,
    );
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('approvals.manage')
  async cancelRequest(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(approvalCommentSchema))
    dto: ApprovalCommentDto,
  ) {
    return this.requestsService.cancel(
      tenant.tenant_id,
      id,
      user.sub,
      dto.comment,
    );
  }
}
