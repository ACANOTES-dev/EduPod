import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import type { JwtPayload, TenantContext } from '@school/shared';
import { generateFeesBodySchema, type GenerateFeesBodyDto } from '@school/shared/budgeting';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { TripFeeIntegrationService } from './trip-fee-integration.service';

@Controller('v1/budgeting/event-budgets/:id')
@UseGuards(AuthGuard, PermissionGuard)
export class TripFeeIntegrationController {
  constructor(private readonly service: TripFeeIntegrationService) {}

  // GET /v1/budgeting/event-budgets/:id/generate-fees/preview
  // Dry-run. No DB writes. Returns the per-household breakdown the UI
  // shows in its confirm modal.
  @Get('generate-fees/preview')
  @RequiresPermission('budgeting.view')
  async preview(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.previewGenerateFees(tenant.tenant_id, id);
  }

  // POST /v1/budgeting/event-budgets/:id/generate-fees
  // Permission stack: budgeting.generate_fees (decorator) + finance.manage
  // + budgeting.view re-checked in the service body via PermissionCacheService.
  // The decorator gates the lightest path; the service double-checks all three.
  @Post('generate-fees')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('budgeting.generate_fees')
  async generateFees(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(generateFeesBodySchema)) body: GenerateFeesBodyDto,
  ) {
    return this.service.generateFees(tenant.tenant_id, user.membership_id, user.sub, id, body);
  }

  // POST /v1/budgeting/event-budgets/:id/mark-school-funded
  // Used when household_share_pct = 0 — the trip is school-paid and no
  // households are invoiced.
  @Post('mark-school-funded')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('budgeting.generate_fees')
  async markSchoolFunded(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.markSchoolFunded(tenant.tenant_id, user.membership_id, user.sub, id);
  }
}
