import {
  Body,
  Controller,
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

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  completeInterventionSchema,
  createInterventionSchema,
  createReviewSchema,
  interventionStatusTransitionSchema,
  listInterventionsQuerySchema,
  outcomeAnalyticsQuerySchema,
  updateInterventionSchema,
} from '@school/shared/behaviour';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';

import { BehaviourInterventionsService } from './behaviour-interventions.service';

// ─── Local Query Schemas ─────────────────────────────────────────────────────

const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class BehaviourInterventionsController {
  constructor(
    private readonly interventionsService: BehaviourInterventionsService,
    private readonly permissionCacheService: PermissionCacheService,
  ) {}

  // ─── Create ──────────────────────────────────────────────────────────────────

  @Post('behaviour/interventions')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createInterventionSchema))
    dto: z.infer<typeof createInterventionSchema>,
  ) {
    return this.interventionsService.create(tenant.tenant_id, user.sub, dto);
  }

  // ─── List ────────────────────────────────────────────────────────────────────

  @Get('behaviour/interventions')
  @RequiresPermission('behaviour.manage')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listInterventionsQuerySchema))
    query: z.infer<typeof listInterventionsQuerySchema>,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    const hasSensitivePermission = permissions.includes('behaviour.view_sensitive');
    return this.interventionsService.list(tenant.tenant_id, query, hasSensitivePermission);
  }

  // ─── Static routes ABOVE :id param routes ────────────────────────────────────

  @Get('behaviour/interventions/overdue')
  @RequiresPermission('behaviour.manage')
  async listOverdue(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.interventionsService.listOverdue(tenant.tenant_id, query.page, query.pageSize);
  }

  @Get('behaviour/interventions/my')
  @RequiresPermission('behaviour.manage')
  async listMy(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.interventionsService.listMy(tenant.tenant_id, user.sub, query.page, query.pageSize);
  }

  @Get('behaviour/interventions/outcomes')
  @RequiresPermission('behaviour.manage')
  async getOutcomeAnalytics(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(outcomeAnalyticsQuerySchema))
    query: z.infer<typeof outcomeAnalyticsQuerySchema>,
  ) {
    return this.interventionsService.getOutcomeAnalytics(tenant.tenant_id, query);
  }

  // ─── Parameterised :id routes ────────────────────────────────────────────────

  @Get('behaviour/interventions/:id')
  @RequiresPermission('behaviour.manage')
  async getDetail(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const permissions = await this.getUserPermissions(user.membership_id);
    const hasSensitivePermission = permissions.includes('behaviour.view_sensitive');
    return this.interventionsService.getDetail(tenant.tenant_id, id, hasSensitivePermission);
  }

  @Patch('behaviour/interventions/:id')
  @RequiresPermission('behaviour.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateInterventionSchema))
    dto: z.infer<typeof updateInterventionSchema>,
  ) {
    return this.interventionsService.update(tenant.tenant_id, id, user.sub, dto);
  }

  @Patch('behaviour/interventions/:id/status')
  @RequiresPermission('behaviour.manage')
  async transitionStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(interventionStatusTransitionSchema))
    dto: z.infer<typeof interventionStatusTransitionSchema>,
  ) {
    return this.interventionsService.transitionStatus(tenant.tenant_id, id, user.sub, dto);
  }

  // ─── Reviews ─────────────────────────────────────────────────────────────────

  @Post('behaviour/interventions/:id/reviews')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.CREATED)
  async createReview(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createReviewSchema))
    dto: z.infer<typeof createReviewSchema>,
  ) {
    return this.interventionsService.createReview(tenant.tenant_id, id, user.sub, dto);
  }

  @Get('behaviour/interventions/:id/reviews')
  @RequiresPermission('behaviour.manage')
  async listReviews(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(paginationQuerySchema))
    query: z.infer<typeof paginationQuerySchema>,
  ) {
    return this.interventionsService.listReviews(tenant.tenant_id, id, query.page, query.pageSize);
  }

  // ─── Auto-Populate ───────────────────────────────────────────────────────────

  @Get('behaviour/interventions/:id/auto-populate')
  @RequiresPermission('behaviour.manage')
  async getAutoPopulateData(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.interventionsService.getAutoPopulateData(tenant.tenant_id, id);
  }

  // ─── Complete (shorthand) ────────────────────────────────────────────────────

  @Post('behaviour/interventions/:id/complete')
  @RequiresPermission('behaviour.manage')
  @HttpCode(HttpStatus.OK)
  async complete(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(completeInterventionSchema))
    dto: z.infer<typeof completeInterventionSchema>,
  ) {
    return this.interventionsService.complete(tenant.tenant_id, id, user.sub, dto);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private async getUserPermissions(membershipId: string | null): Promise<string[]> {
    if (!membershipId) return [];
    return this.permissionCacheService.getPermissions(membershipId);
  }
}
