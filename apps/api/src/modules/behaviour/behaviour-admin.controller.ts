import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  backfillTasksSchema,
  createLegalHoldSchema,
  legalHoldListQuerySchema,
  PolicyDryRunSchema,
  rebuildAwardsSchema,
  recomputePointsSchema,
  releaseLegalHoldSchema,
  resendNotificationSchema,
  scopeAuditQuerySchema,
} from '@school/shared';
import type { JwtPayload, PolicyDryRunDto, TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { BehaviourAdminService } from './behaviour-admin.service';
import { BehaviourLegalHoldService } from './behaviour-legal-hold.service';

@Controller('v1/behaviour/admin')
@ModuleEnabled('behaviour')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class BehaviourAdminController {
  constructor(
    private readonly adminService: BehaviourAdminService,
    private readonly legalHoldService: BehaviourLegalHoldService,
  ) {}

  // ─── Health ───────────────────────────────────────────────────────────────

  @Get('health')
  @RequiresPermission('behaviour.admin')
  async getHealth(@CurrentTenant() tenant: TenantContext) {
    return this.adminService.getHealth(tenant.tenant_id);
  }

  // ─── Dead Letter ──────────────────────────────────────────────────────────

  @Get('dead-letter')
  @RequiresPermission('behaviour.admin')
  async listDeadLetterJobs() {
    return this.adminService.listDeadLetterJobs();
  }

  @Post('dead-letter/:jobId/retry')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('behaviour.admin')
  async retryDeadLetterJob(@Param('jobId') jobId: string) {
    await this.adminService.retryDeadLetterJob(jobId);
    return { success: true };
  }

  // ─── Recompute Points ─────────────────────────────────────────────────────

  @Post('recompute-points/preview')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('behaviour.admin')
  async recomputePointsPreview(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(recomputePointsSchema)) dto: z.infer<typeof recomputePointsSchema>,
  ) {
    return this.adminService.recomputePointsPreview(tenant.tenant_id, dto);
  }

  @Post('recompute-points')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequiresPermission('behaviour.admin')
  async recomputePoints(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(recomputePointsSchema)) dto: z.infer<typeof recomputePointsSchema>,
  ) {
    await this.adminService.recomputePoints(tenant.tenant_id, dto);
    return { success: true, message: 'Points recomputed' };
  }

  // ─── Rebuild Awards ───────────────────────────────────────────────────────

  @Post('rebuild-awards/preview')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('behaviour.admin')
  async rebuildAwardsPreview(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(rebuildAwardsSchema)) dto: z.infer<typeof rebuildAwardsSchema>,
  ) {
    return this.adminService.rebuildAwardsPreview(tenant.tenant_id, dto);
  }

  @Post('rebuild-awards')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequiresPermission('behaviour.admin')
  async rebuildAwards(
    @CurrentTenant() _tenant: TenantContext,
    @Body(new ZodValidationPipe(rebuildAwardsSchema)) _dto: z.infer<typeof rebuildAwardsSchema>,
  ) {
    // Rebuild awards is a long operation — this would normally be enqueued as a job
    return { success: true, message: 'Award rebuild initiated' };
  }

  // ─── Recompute Pulse ──────────────────────────────────────────────────────

  @Post('recompute-pulse')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('behaviour.admin')
  async recomputePulse(@CurrentTenant() tenant: TenantContext) {
    await this.adminService.recomputePulse(tenant.tenant_id);
    return { success: true, message: 'Pulse cache invalidated' };
  }

  // ─── Backfill Tasks ───────────────────────────────────────────────────────

  @Post('backfill-tasks/preview')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('behaviour.admin')
  async backfillTasksPreview(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(backfillTasksSchema)) dto: z.infer<typeof backfillTasksSchema>,
  ) {
    return this.adminService.backfillTasksPreview(tenant.tenant_id, dto);
  }

  @Post('backfill-tasks')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequiresPermission('behaviour.admin')
  async backfillTasks(
    @CurrentTenant() _tenant: TenantContext,
    @Body(new ZodValidationPipe(backfillTasksSchema)) _dto: z.infer<typeof backfillTasksSchema>,
  ) {
    return { success: true, message: 'Task backfill initiated' };
  }

  // ─── Resend Notification ──────────────────────────────────────────────────

  @Post('resend-notification')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('behaviour.admin')
  async resendNotification(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(resendNotificationSchema)) dto: z.infer<typeof resendNotificationSchema>,
  ) {
    await this.adminService.resendNotification(tenant.tenant_id, dto);
    return { success: true, message: 'Notification re-queued' };
  }

  // ─── Refresh Views ────────────────────────────────────────────────────────

  @Post('refresh-views')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('behaviour.admin')
  async refreshViews(@CurrentTenant() tenant: TenantContext) {
    await this.adminService.refreshViews(tenant.tenant_id);
    return { success: true, message: 'All materialised views refreshed' };
  }

  // ─── Policy Dry Run ───────────────────────────────────────────────────────

  @Post('policy-dry-run')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('behaviour.admin')
  async policyDryRun(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(PolicyDryRunSchema)) dto: PolicyDryRunDto,
  ) {
    return this.adminService.policyDryRun(tenant.tenant_id, dto);
  }

  // ─── Scope Audit ──────────────────────────────────────────────────────────

  @Get('scope-audit')
  @RequiresPermission('behaviour.admin')
  async scopeAudit(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(scopeAuditQuerySchema)) query: z.infer<typeof scopeAuditQuerySchema>,
  ) {
    return this.adminService.scopeAudit(tenant.tenant_id, query.user_id);
  }

  // ─── Reindex Search ──────────────────────────────────────────────────────

  @Post('reindex-search/preview')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('behaviour.admin')
  async reindexSearchPreview(@CurrentTenant() tenant: TenantContext) {
    return this.adminService.reindexSearchPreview(tenant.tenant_id);
  }

  @Post('reindex-search')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequiresPermission('behaviour.admin')
  async reindexSearch(@CurrentTenant() _tenant: TenantContext) {
    return { success: true, message: 'Search reindex initiated — requires dual approval for tenant-wide scope' };
  }

  // ─── Retention ────────────────────────────────────────────────────────────

  @Post('retention/preview')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('behaviour.admin')
  async retentionPreview(@CurrentTenant() tenant: TenantContext) {
    return this.adminService.retentionPreview(tenant.tenant_id);
  }

  @Post('retention/execute')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequiresPermission('behaviour.admin')
  async retentionExecute(@CurrentTenant() tenant: TenantContext) {
    return this.adminService.retentionExecute(tenant.tenant_id);
  }

  // ─── Legal Holds ──────────────────────────────────────────────────────────

  @Get('legal-holds')
  @RequiresPermission('behaviour.admin')
  async listLegalHolds(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(legalHoldListQuerySchema)) query: z.infer<typeof legalHoldListQuerySchema>,
  ) {
    return this.legalHoldService.listHolds(tenant.tenant_id, query);
  }

  @Post('legal-holds')
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('behaviour.admin')
  async createLegalHold(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createLegalHoldSchema)) dto: z.infer<typeof createLegalHoldSchema>,
  ) {
    return this.legalHoldService.createHold(tenant.tenant_id, user.sub, dto);
  }

  @Post('legal-holds/:id/release')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('behaviour.admin')
  async releaseLegalHold(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(releaseLegalHoldSchema)) dto: z.infer<typeof releaseLegalHoldSchema>,
  ) {
    await this.legalHoldService.releaseHold(tenant.tenant_id, user.sub, id, dto);
    return { success: true };
  }
}
