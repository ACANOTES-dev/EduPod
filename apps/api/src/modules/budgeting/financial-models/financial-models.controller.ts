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

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import {
  createFinancialModelSchema,
  type CreateFinancialModelDto,
} from './dto/create-financial-model.dto';
import {
  listFinancialModelsQuerySchema,
  type ListFinancialModelsQueryDto,
} from './dto/list-financial-models.dto';
import {
  updateFinancialModelSchema,
  type UpdateFinancialModelDto,
} from './dto/update-financial-model.dto';
import { FinancialModelsService } from './financial-models.service';

@Controller('v1/budgeting/financial-models')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
@ModuleEnabled('budgeting')
export class FinancialModelsController {
  constructor(private readonly financialModelsService: FinancialModelsService) {}

  // GET /v1/budgeting/financial-models
  @Get()
  @RequiresPermission('budgeting.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listFinancialModelsQuerySchema))
    query: ListFinancialModelsQueryDto,
  ) {
    return this.financialModelsService.findAll(tenant.tenant_id, query);
  }

  // GET /v1/budgeting/financial-models/:id
  @Get(':id')
  @RequiresPermission('budgeting.view')
  async findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.financialModelsService.findOne(tenant.tenant_id, id);
  }

  // POST /v1/budgeting/financial-models
  @Post()
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createFinancialModelSchema)) dto: CreateFinancialModelDto,
  ) {
    return this.financialModelsService.create(tenant.tenant_id, user.sub, dto);
  }

  // PATCH /v1/budgeting/financial-models/:id
  @Patch(':id')
  @RequiresPermission('budgeting.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateFinancialModelSchema)) dto: UpdateFinancialModelDto,
  ) {
    return this.financialModelsService.update(tenant.tenant_id, id, user.sub, dto);
  }

  // DELETE /v1/budgeting/financial-models/:id  (soft archive)
  @Delete(':id')
  @RequiresPermission('budgeting.archive')
  @HttpCode(HttpStatus.OK)
  async archive(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.financialModelsService.archive(tenant.tenant_id, id, user.sub);
  }

  // POST /v1/budgeting/financial-models/:id/restore
  @Post(':id/restore')
  @RequiresPermission('budgeting.archive')
  async restore(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.financialModelsService.restore(tenant.tenant_id, id, user.sub);
  }
}
