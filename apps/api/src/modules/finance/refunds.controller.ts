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
  createRefundSchema,
  refundApprovalCommentSchema,
  refundQuerySchema,
  refundRejectionCommentSchema,
} from '@school/shared';
import type {
  CreateRefundDto,
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

import { RefundsService } from './refunds.service';

@Controller('v1/finance/refunds')
@UseGuards(AuthGuard, PermissionGuard)
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Get()
  @RequiresPermission('finance.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(refundQuerySchema))
    query: z.infer<typeof refundQuerySchema>,
  ) {
    return this.refundsService.findAll(tenant.tenant_id, query);
  }

  @Post()
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createRefundSchema)) dto: CreateRefundDto,
  ) {
    return this.refundsService.create(tenant.tenant_id, user.sub, dto);
  }

  @Post(':id/approve')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async approve(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(refundApprovalCommentSchema))
    body: z.infer<typeof refundApprovalCommentSchema>,
  ) {
    return this.refundsService.approve(tenant.tenant_id, id, user.sub, body.comment);
  }

  @Post(':id/reject')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async reject(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(refundRejectionCommentSchema))
    body: z.infer<typeof refundRejectionCommentSchema>,
  ) {
    return this.refundsService.reject(tenant.tenant_id, id, user.sub, body.comment);
  }

  @Post(':id/execute')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async execute(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.refundsService.execute(tenant.tenant_id, id);
  }
}
