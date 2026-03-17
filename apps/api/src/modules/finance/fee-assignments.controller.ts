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
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createFeeAssignmentSchema,
  feeAssignmentQuerySchema,
  updateFeeAssignmentSchema,
} from '@school/shared';
import type {
  CreateFeeAssignmentDto,
  TenantContext,
  UpdateFeeAssignmentDto,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { FeeAssignmentsService } from './fee-assignments.service';

@Controller('v1/finance/fee-assignments')
@UseGuards(AuthGuard, PermissionGuard)
export class FeeAssignmentsController {
  constructor(private readonly feeAssignmentsService: FeeAssignmentsService) {}

  @Get()
  @RequiresPermission('finance.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(feeAssignmentQuerySchema))
    query: z.infer<typeof feeAssignmentQuerySchema>,
  ) {
    return this.feeAssignmentsService.findAll(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('finance.view')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.feeAssignmentsService.findOne(tenant.tenant_id, id);
  }

  @Post()
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createFeeAssignmentSchema)) dto: CreateFeeAssignmentDto,
  ) {
    return this.feeAssignmentsService.create(tenant.tenant_id, dto);
  }

  @Patch(':id')
  @RequiresPermission('finance.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateFeeAssignmentSchema)) dto: UpdateFeeAssignmentDto,
  ) {
    return this.feeAssignmentsService.update(tenant.tenant_id, id, dto);
  }

  @Post(':id/end')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async endAssignment(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.feeAssignmentsService.endAssignment(tenant.tenant_id, id);
  }
}
