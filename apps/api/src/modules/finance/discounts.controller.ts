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

import { createDiscountSchema, discountQuerySchema, updateDiscountSchema } from '@school/shared';
import type { CreateDiscountDto, TenantContext, UpdateDiscountDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { DiscountsService } from './discounts.service';

@Controller('v1/finance/discounts')
@UseGuards(AuthGuard, PermissionGuard)
export class DiscountsController {
  constructor(private readonly discountsService: DiscountsService) {}

  @Get()
  @RequiresPermission('finance.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(discountQuerySchema))
    query: z.infer<typeof discountQuerySchema>,
  ) {
    return this.discountsService.findAll(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('finance.view')
  async findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.discountsService.findOne(tenant.tenant_id, id);
  }

  @Post()
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createDiscountSchema)) dto: CreateDiscountDto,
  ) {
    return this.discountsService.create(tenant.tenant_id, dto);
  }

  @Patch(':id')
  @RequiresPermission('finance.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDiscountSchema)) dto: UpdateDiscountDto,
  ) {
    return this.discountsService.update(tenant.tenant_id, id, dto);
  }

  @Delete(':id')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async deactivate(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.discountsService.deactivate(tenant.tenant_id, id);
  }
}
