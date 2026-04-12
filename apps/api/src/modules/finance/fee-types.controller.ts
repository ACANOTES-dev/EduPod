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
import { z } from 'zod';

import { createFeeTypeSchema, feeTypeQuerySchema, updateFeeTypeSchema } from '@school/shared';
import type { CreateFeeTypeDto, TenantContext, UpdateFeeTypeDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { FeeTypesService } from './fee-types.service';

@Controller('v1/finance/fee-types')
@UseGuards(AuthGuard, PermissionGuard)
export class FeeTypesController {
  constructor(private readonly feeTypesService: FeeTypesService) {}

  // GET /v1/finance/fee-types
  @Get()
  @RequiresPermission('finance.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(feeTypeQuerySchema))
    query: z.infer<typeof feeTypeQuerySchema>,
  ) {
    return this.feeTypesService.findAll(tenant.tenant_id, query);
  }

  // GET /v1/finance/fee-types/:id
  @Get(':id')
  @RequiresPermission('finance.view')
  async findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.feeTypesService.findOne(tenant.tenant_id, id);
  }

  // POST /v1/finance/fee-types
  @Post()
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createFeeTypeSchema)) dto: CreateFeeTypeDto,
  ) {
    return this.feeTypesService.create(tenant.tenant_id, dto);
  }

  // PATCH /v1/finance/fee-types/:id
  @Patch(':id')
  @RequiresPermission('finance.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateFeeTypeSchema)) dto: UpdateFeeTypeDto,
  ) {
    return this.feeTypesService.update(tenant.tenant_id, id, dto);
  }

  // DELETE /v1/finance/fee-types/:id
  @Delete(':id')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async deactivate(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.feeTypesService.deactivate(tenant.tenant_id, id);
  }
}
