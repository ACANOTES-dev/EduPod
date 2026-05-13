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

import { createScenarioSchema, type CreateScenarioDto } from './dto/create-scenario.dto';
import { updateScenarioSchema, type UpdateScenarioDto } from './dto/update-scenario.dto';
import { ScenariosService } from './scenarios.service';

@Controller('v1/budgeting/financial-models/:modelId/scenarios')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
@ModuleEnabled('budgeting')
export class ScenariosController {
  constructor(private readonly scenariosService: ScenariosService) {}

  // GET /v1/budgeting/financial-models/:modelId/scenarios
  @Get()
  @RequiresPermission('budgeting.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
  ) {
    return this.scenariosService.findAll(tenant.tenant_id, modelId);
  }

  // GET /v1/budgeting/financial-models/:modelId/scenarios/:scenarioId
  @Get(':scenarioId')
  @RequiresPermission('budgeting.view')
  async findOne(
    @CurrentTenant() tenant: TenantContext,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
  ) {
    return this.scenariosService.findOne(tenant.tenant_id, modelId, scenarioId);
  }

  // POST /v1/budgeting/financial-models/:modelId/scenarios
  @Post()
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Body(new ZodValidationPipe(createScenarioSchema)) dto: CreateScenarioDto,
  ) {
    return this.scenariosService.create(tenant.tenant_id, modelId, user.sub, dto);
  }

  // PATCH /v1/budgeting/financial-models/:modelId/scenarios/:scenarioId
  @Patch(':scenarioId')
  @RequiresPermission('budgeting.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
    @Body(new ZodValidationPipe(updateScenarioSchema)) dto: UpdateScenarioDto,
  ) {
    return this.scenariosService.update(tenant.tenant_id, modelId, scenarioId, user.sub, dto);
  }

  // DELETE /v1/budgeting/financial-models/:modelId/scenarios/:scenarioId
  @Delete(':scenarioId')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('modelId', ParseUUIDPipe) modelId: string,
    @Param('scenarioId', ParseUUIDPipe) scenarioId: string,
  ) {
    return this.scenariosService.delete(tenant.tenant_id, modelId, scenarioId, user.sub);
  }
}
