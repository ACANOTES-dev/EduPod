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
import { dsarReviewDecisionRefinedSchema, dsarReviewFiltersSchema } from '@school/shared';
import type { DsarReviewDecisionDto, DsarReviewFilters, JwtPayload, TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { PastoralDsarService } from '../services/pastoral-dsar.service';

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class PastoralDsarController {
  constructor(private readonly dsarService: PastoralDsarService) {}

  // ─── 1. List Reviews ────────────────────────────────────────────────────────

  @Get('pastoral/dsar-reviews')
  @RequiresPermission('pastoral.dsar_review')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(dsarReviewFiltersSchema)) filters: DsarReviewFilters,
  ) {
    return this.dsarService.listReviews(tenant.tenant_id, user.sub, filters);
  }

  // ─── 2. Reviews by Request (BEFORE :id to avoid param collision) ────────────

  @Get('pastoral/dsar-reviews/by-request/:complianceRequestId/summary')
  @RequiresPermission('pastoral.dsar_review')
  async summary(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('complianceRequestId', ParseUUIDPipe) complianceRequestId: string,
  ) {
    const [reviews, allComplete] = await Promise.all([
      this.dsarService.getReviewsByRequest(tenant.tenant_id, user.sub, complianceRequestId),
      this.dsarService.allReviewsComplete(tenant.tenant_id, complianceRequestId),
    ]);

    const total = reviews.length;
    const pending = reviews.filter((r) => r.decision === null).length;
    const included = reviews.filter((r) => r.decision === 'include').length;
    const redacted = reviews.filter((r) => r.decision === 'redact').length;
    const excluded = reviews.filter((r) => r.decision === 'exclude').length;

    return { total, pending, included, redacted, excluded, all_complete: allComplete };
  }

  @Get('pastoral/dsar-reviews/by-request/:complianceRequestId')
  @RequiresPermission('pastoral.dsar_review')
  async byRequest(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('complianceRequestId', ParseUUIDPipe) complianceRequestId: string,
  ) {
    return this.dsarService.getReviewsByRequest(tenant.tenant_id, user.sub, complianceRequestId);
  }

  // ─── 3. Get Single Review ───────────────────────────────────────────────────

  @Get('pastoral/dsar-reviews/:id')
  @RequiresPermission('pastoral.dsar_review')
  async getOne(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.dsarService.getReview(tenant.tenant_id, user.sub, id);
  }

  // ─── 4. Submit Decision ─────────────────────────────────────────────────────

  @Post('pastoral/dsar-reviews/:id/decide')
  @RequiresPermission('pastoral.dsar_review')
  @HttpCode(HttpStatus.OK)
  async decide(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(dsarReviewDecisionRefinedSchema))
    body: z.infer<typeof dsarReviewDecisionRefinedSchema>,
  ) {
    const dto: DsarReviewDecisionDto = body;
    return this.dsarService.submitDecision(tenant.tenant_id, user.sub, id, dto);
  }
}
