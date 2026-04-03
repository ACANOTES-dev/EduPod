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
import { z } from 'zod';

import {
  approvalCommentSchema,
  approvalRequestFilterSchema,
  bulkRetryCallbacksSchema,
  paginationQuerySchema,
} from '@school/shared';
import type {
  ApprovalCommentDto,
  BulkRetryCallbacksDto,
  JwtPayload,
  TenantContext,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ApprovalRequestsService } from './approval-requests.service';

const listRequestsQuerySchema = paginationQuerySchema.merge(approvalRequestFilterSchema);

type ListRequestsQuery = z.infer<typeof listRequestsQuerySchema>;

@Controller('v1/approval-requests')
@UseGuards(AuthGuard, PermissionGuard)
export class ApprovalRequestsController {
  constructor(private readonly requestsService: ApprovalRequestsService) {}

  // GET /v1/approval-requests
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
      callback_status: query.callback_status,
    });
  }

  // GET /v1/approval-requests/callback-health
  @Get('callback-health')
  @RequiresPermission('approvals.manage')
  async getCallbackHealth(@CurrentTenant() tenant: TenantContext) {
    return this.requestsService.getCallbackHealth(tenant.tenant_id);
  }

  // POST /v1/approval-requests/bulk-retry-callbacks
  @Post('bulk-retry-callbacks')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('approvals.manage')
  async bulkRetryCallbacks(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(bulkRetryCallbacksSchema))
    dto: BulkRetryCallbacksDto,
  ) {
    return this.requestsService.bulkRetryCallbacks(
      tenant.tenant_id,
      dto.status_filter,
      dto.max_count,
    );
  }

  // GET /v1/approval-requests/:id
  @Get(':id')
  @RequiresPermission('approvals.view')
  async getRequest(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.requestsService.getRequest(tenant.tenant_id, id);
  }

  // POST /v1/approval-requests/:id/approve
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
    return this.requestsService.approve(tenant.tenant_id, id, user.sub, dto.comment);
  }

  // POST /v1/approval-requests/:id/reject
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
    return this.requestsService.reject(tenant.tenant_id, id, user.sub, dto.comment);
  }

  // POST /v1/approval-requests/:id/cancel
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
    return this.requestsService.cancel(tenant.tenant_id, id, user.sub, dto.comment);
  }

  // POST /v1/approval-requests/:id/retry-callback
  @Post(':id/retry-callback')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('approvals.manage')
  async retryCallback(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.requestsService.retryCallback(tenant.tenant_id, id);
  }
}
