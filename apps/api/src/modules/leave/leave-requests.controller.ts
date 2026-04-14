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

import type { JwtPayload } from '@school/shared';
import {
  createLeaveRequestSchema,
  leaveRequestQuerySchema,
  reviewLeaveRequestSchema,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { LeaveRequestsService } from './leave-requests.service';
import { LeaveTypesService } from './leave-types.service';

@Controller('v1/leave')
@UseGuards(AuthGuard, PermissionGuard)
export class LeaveController {
  constructor(
    private readonly leaveRequestsService: LeaveRequestsService,
    private readonly leaveTypesService: LeaveTypesService,
  ) {}

  // ─── Leave Types ──────────────────────────────────────────────────────────

  // Readable by any teacher submitting a request or admin reviewing one.
  @Get('types')
  @RequiresPermission('leave.submit_request')
  async listTypes(@CurrentTenant() tenant: { tenant_id: string }) {
    return this.leaveTypesService.list(tenant.tenant_id);
  }

  // ─── Submit ───────────────────────────────────────────────────────────────

  @Post('requests')
  @RequiresPermission('leave.submit_request')
  @HttpCode(HttpStatus.CREATED)
  async submit(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createLeaveRequestSchema))
    dto: z.infer<typeof createLeaveRequestSchema>,
  ) {
    return this.leaveRequestsService.submit(tenant.tenant_id, user.sub, dto);
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  // Admin queue — all requests in the tenant.
  @Get('requests')
  @RequiresPermission('leave.approve_requests')
  async listAdmin(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(leaveRequestQuerySchema))
    query: z.infer<typeof leaveRequestQuerySchema>,
  ) {
    return this.leaveRequestsService.listForAdmin(tenant.tenant_id, query);
  }

  // Teacher's own requests.
  @Get('requests/my')
  @RequiresPermission('leave.submit_request')
  async listMine(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(leaveRequestQuerySchema))
    query: z.infer<typeof leaveRequestQuerySchema>,
  ) {
    return this.leaveRequestsService.listForStaff(tenant.tenant_id, user.sub, query);
  }

  // ─── Approve / Reject / Withdraw ──────────────────────────────────────────

  @Post('requests/:id/approve')
  @RequiresPermission('leave.approve_requests')
  @HttpCode(HttpStatus.OK)
  async approve(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewLeaveRequestSchema))
    dto: z.infer<typeof reviewLeaveRequestSchema>,
  ) {
    return this.leaveRequestsService.approve(tenant.tenant_id, user.sub, id, dto);
  }

  @Post('requests/:id/reject')
  @RequiresPermission('leave.approve_requests')
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewLeaveRequestSchema))
    dto: z.infer<typeof reviewLeaveRequestSchema>,
  ) {
    return this.leaveRequestsService.reject(tenant.tenant_id, user.sub, id, dto);
  }

  @Post('requests/:id/withdraw')
  @RequiresPermission('leave.submit_request')
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.leaveRequestsService.withdraw(tenant.tenant_id, user.sub, id);
  }
}
