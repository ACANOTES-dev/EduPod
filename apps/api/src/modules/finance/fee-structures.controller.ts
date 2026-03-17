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
  createFeeStructureSchema,
  feeStructureQuerySchema,
  updateFeeStructureSchema,
} from '@school/shared';
import type {
  CreateFeeStructureDto,
  TenantContext,
  UpdateFeeStructureDto,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { FeeStructuresService } from './fee-structures.service';

@Controller('v1/finance/fee-structures')
@UseGuards(AuthGuard, PermissionGuard)
export class FeeStructuresController {
  constructor(private readonly feeStructuresService: FeeStructuresService) {}

  @Get()
  @RequiresPermission('finance.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(feeStructureQuerySchema))
    query: z.infer<typeof feeStructureQuerySchema>,
  ) {
    return this.feeStructuresService.findAll(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('finance.view')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.feeStructuresService.findOne(tenant.tenant_id, id);
  }

  @Post()
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createFeeStructureSchema)) dto: CreateFeeStructureDto,
  ) {
    return this.feeStructuresService.create(tenant.tenant_id, dto);
  }

  @Patch(':id')
  @RequiresPermission('finance.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateFeeStructureSchema)) dto: UpdateFeeStructureDto,
  ) {
    return this.feeStructuresService.update(tenant.tenant_id, id, dto);
  }

  @Delete(':id')
  @RequiresPermission('finance.manage')
  @HttpCode(HttpStatus.OK)
  async deactivate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.feeStructuresService.deactivate(tenant.tenant_id, id);
  }
}
