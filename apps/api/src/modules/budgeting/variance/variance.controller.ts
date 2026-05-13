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

import type { JwtPayload, TenantContext } from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { manualActualEntrySchema, type ManualActualEntryDto } from './dto/manual-actual-entry.dto';
import { varianceQuerySchema, type VarianceQueryDto } from './dto/variance-query.dto';
import { VarianceService } from './variance.service';

@Controller('v1/budgeting/financial-models/:id/variance')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
@ModuleEnabled('budgeting')
export class VarianceController {
  constructor(private readonly variance: VarianceService) {}

  // GET /v1/budgeting/financial-models/:id/variance
  @Get()
  @RequiresPermission('budgeting.view')
  async getVariance(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) modelId: string,
    @Query(new ZodValidationPipe(varianceQuerySchema)) query: VarianceQueryDto,
  ) {
    return this.variance.getVariance(
      tenant.tenant_id,
      modelId,
      query.period_type,
      query.period_label,
    );
  }

  // POST /v1/budgeting/financial-models/:id/variance/refresh
  @Post('refresh')
  @RequiresPermission('budgeting.view')
  @HttpCode(HttpStatus.ACCEPTED)
  async refresh(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) modelId: string,
  ) {
    return this.variance.enqueueRefresh(tenant.tenant_id, modelId);
  }

  // POST /v1/budgeting/financial-models/:id/variance/manual-actuals
  @Post('manual-actuals')
  @RequiresPermission('budgeting.manage')
  @HttpCode(HttpStatus.OK)
  async upsertManual(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) modelId: string,
    @Body(new ZodValidationPipe(manualActualEntrySchema)) dto: ManualActualEntryDto,
  ) {
    return this.variance.upsertManualActual(tenant.tenant_id, modelId, user.sub, dto);
  }
}
