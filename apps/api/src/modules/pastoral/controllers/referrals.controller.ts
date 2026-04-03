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

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  addStudentToVisitSchema,
  createNepsVisitSchema,
  createRecommendationSchema,
  createReferralSchema,
  nepsVisitFiltersSchema,
  recordReportReceivedSchema,
  referralFiltersSchema,
  scheduleAssessmentSchema,
  updateNepsVisitSchema,
  updateRecommendationSchema,
  updateReferralSchema,
  updateVisitStudentSchema,
  waitlistFiltersSchema,
  withdrawReferralSchema,
} from '@school/shared/pastoral';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';
import { NepsVisitService } from '../services/neps-visit.service';
import { ReferralPrepopulateService } from '../services/referral-prepopulate.service';
import { ReferralRecommendationService } from '../services/referral-recommendation.service';
import { ReferralService } from '../services/referral.service';

@Controller('v1')
@ModuleEnabled('pastoral')
@UseGuards(AuthGuard, ModuleEnabledGuard, PermissionGuard)
export class ReferralsController {
  constructor(
    private readonly referralService: ReferralService,
    private readonly prepopulateService: ReferralPrepopulateService,
    private readonly recommendationService: ReferralRecommendationService,
    private readonly nepsVisitService: NepsVisitService,
  ) {}

  // ═══════════════════════════════════════════════════════════════════════════
  // REFERRALS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 1. Create Referral ──────────────────────────────────────────────────

  @Post('pastoral/referrals')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createReferralSchema))
    dto: z.infer<typeof createReferralSchema>,
  ) {
    return this.referralService.create(tenant.tenant_id, user.sub, dto);
  }

  // ─── 2. List Referrals ───────────────────────────────────────────────────

  @Get('pastoral/referrals')
  @RequiresPermission('pastoral.manage_referrals')
  async list(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(referralFiltersSchema))
    query: z.infer<typeof referralFiltersSchema>,
  ) {
    return this.referralService.list(tenant.tenant_id, query);
  }

  // ─── 3. Get Waitlist (BEFORE :id to avoid param collision) ───────────────

  @Get('pastoral/referrals/waitlist')
  @RequiresPermission('pastoral.manage_referrals')
  async getWaitlist(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(waitlistFiltersSchema))
    query: z.infer<typeof waitlistFiltersSchema>,
  ) {
    return this.referralService.getWaitlist(tenant.tenant_id, query);
  }

  // ─── 4. Get Referral by ID ──────────────────────────────────────────────

  @Get('pastoral/referrals/:id')
  @RequiresPermission('pastoral.manage_referrals')
  async getById(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.referralService.get(tenant.tenant_id, id);
  }

  // ─── 5. Update Referral ─────────────────────────────────────────────────

  @Patch('pastoral/referrals/:id')
  @RequiresPermission('pastoral.manage_referrals')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateReferralSchema))
    dto: z.infer<typeof updateReferralSchema>,
  ) {
    return this.referralService.update(tenant.tenant_id, id, dto);
  }

  // ─── 6. Submit Referral ─────────────────────────────────────────────────

  @Post('pastoral/referrals/:id/submit')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.OK)
  async submit(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.referralService.submit(tenant.tenant_id, user.sub, id);
  }

  // ─── 7. Acknowledge Referral ────────────────────────────────────────────

  @Post('pastoral/referrals/:id/acknowledge')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.OK)
  async acknowledge(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.referralService.acknowledge(tenant.tenant_id, user.sub, id);
  }

  // ─── 8. Schedule Assessment ─────────────────────────────────────────────

  @Post('pastoral/referrals/:id/schedule-assessment')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.OK)
  async scheduleAssessment(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(scheduleAssessmentSchema))
    dto: z.infer<typeof scheduleAssessmentSchema>,
  ) {
    return this.referralService.scheduleAssessment(tenant.tenant_id, user.sub, id, dto);
  }

  // ─── 9. Complete Assessment ─────────────────────────────────────────────

  @Post('pastoral/referrals/:id/complete-assessment')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.OK)
  async completeAssessment(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.referralService.completeAssessment(tenant.tenant_id, user.sub, id);
  }

  // ─── 10. Receive Report ─────────────────────────────────────────────────

  @Post('pastoral/referrals/:id/receive-report')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.OK)
  async receiveReport(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordReportReceivedSchema))
    dto: z.infer<typeof recordReportReceivedSchema>,
  ) {
    return this.referralService.receiveReport(tenant.tenant_id, user.sub, id, dto);
  }

  // ─── 11. Mark Complete (Recommendations Implemented) ────────────────────

  @Post('pastoral/referrals/:id/complete')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.OK)
  async markComplete(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.referralService.markRecommendationsImplemented(tenant.tenant_id, user.sub, id);
  }

  // ─── 12. Withdraw Referral ──────────────────────────────────────────────

  @Post('pastoral/referrals/:id/withdraw')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.OK)
  async withdraw(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(withdrawReferralSchema))
    dto: z.infer<typeof withdrawReferralSchema>,
  ) {
    return this.referralService.withdraw(tenant.tenant_id, user.sub, id, dto);
  }

  // ─── 13. Pre-Populate Referral ──────────────────────────────────────────

  @Post('pastoral/referrals/:id/pre-populate')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.OK)
  async prePopulate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    const referral = await this.referralService.get(tenant.tenant_id, id);
    return this.prepopulateService.generateSnapshot(tenant.tenant_id, referral.student_id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RECOMMENDATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 14. Create Recommendation ──────────────────────────────────────────

  @Post('pastoral/referrals/:referralId/recommendations')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.CREATED)
  async createRecommendation(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('referralId', ParseUUIDPipe) referralId: string,
    @Body(new ZodValidationPipe(createRecommendationSchema))
    dto: z.infer<typeof createRecommendationSchema>,
  ) {
    return this.recommendationService.create(tenant.tenant_id, user.sub, referralId, dto);
  }

  // ─── 15. List Recommendations ───────────────────────────────────────────

  @Get('pastoral/referrals/:referralId/recommendations')
  @RequiresPermission('pastoral.manage_referrals')
  async listRecommendations(
    @CurrentTenant() tenant: TenantContext,
    @Param('referralId', ParseUUIDPipe) referralId: string,
  ) {
    return this.recommendationService.list(tenant.tenant_id, referralId);
  }

  // ─── 16. Update Recommendation ──────────────────────────────────────────

  @Patch('pastoral/referrals/:referralId/recommendations/:id')
  @RequiresPermission('pastoral.manage_referrals')
  async updateRecommendation(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('referralId', ParseUUIDPipe) _referralId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRecommendationSchema))
    dto: z.infer<typeof updateRecommendationSchema>,
  ) {
    return this.recommendationService.update(tenant.tenant_id, user.sub, id, dto);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // NEPS VISITS
  // ═══════════════════════════════════════════════════════════════════════════

  // ─── 17. Create NEPS Visit ──────────────────────────────────────────────

  @Post('pastoral/neps-visits')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.CREATED)
  async createVisit(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createNepsVisitSchema))
    dto: z.infer<typeof createNepsVisitSchema>,
  ) {
    return this.nepsVisitService.create(tenant.tenant_id, user.sub, dto);
  }

  // ─── 18. List NEPS Visits ───────────────────────────────────────────────

  @Get('pastoral/neps-visits')
  @RequiresPermission('pastoral.manage_referrals')
  async listVisits(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(nepsVisitFiltersSchema))
    query: z.infer<typeof nepsVisitFiltersSchema>,
  ) {
    return this.nepsVisitService.list(tenant.tenant_id, query);
  }

  // ─── 19. Get NEPS Visit ─────────────────────────────────────────────────

  @Get('pastoral/neps-visits/:id')
  @RequiresPermission('pastoral.manage_referrals')
  async getVisit(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.nepsVisitService.get(tenant.tenant_id, id);
  }

  // ─── 20. Update NEPS Visit ──────────────────────────────────────────────

  @Patch('pastoral/neps-visits/:id')
  @RequiresPermission('pastoral.manage_referrals')
  async updateVisit(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateNepsVisitSchema))
    dto: z.infer<typeof updateNepsVisitSchema>,
  ) {
    return this.nepsVisitService.update(tenant.tenant_id, id, dto);
  }

  // ─── 21. Remove NEPS Visit ──────────────────────────────────────────────

  @Delete('pastoral/neps-visits/:id')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeVisit(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.nepsVisitService.remove(tenant.tenant_id, id);
  }

  // ─── 22. Add Student to NEPS Visit ──────────────────────────────────────

  @Post('pastoral/neps-visits/:visitId/students')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.CREATED)
  async addVisitStudent(
    @CurrentTenant() tenant: TenantContext,
    @Param('visitId', ParseUUIDPipe) visitId: string,
    @Body(new ZodValidationPipe(addStudentToVisitSchema))
    dto: z.infer<typeof addStudentToVisitSchema>,
  ) {
    return this.nepsVisitService.addStudent(tenant.tenant_id, visitId, dto);
  }

  // ─── 23. Update Visit Student Outcome ───────────────────────────────────

  @Patch('pastoral/neps-visits/:visitId/students/:id')
  @RequiresPermission('pastoral.manage_referrals')
  async updateVisitStudent(
    @CurrentTenant() tenant: TenantContext,
    @Param('visitId', ParseUUIDPipe) _visitId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateVisitStudentSchema))
    dto: z.infer<typeof updateVisitStudentSchema>,
  ) {
    return this.nepsVisitService.updateStudentOutcome(tenant.tenant_id, id, dto);
  }

  // ─── 24. Remove Visit Student ───────────────────────────────────────────

  @Delete('pastoral/neps-visits/:visitId/students/:id')
  @RequiresPermission('pastoral.manage_referrals')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeVisitStudent(
    @CurrentTenant() tenant: TenantContext,
    @Param('visitId', ParseUUIDPipe) _visitId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.nepsVisitService.removeStudent(tenant.tenant_id, id);
  }
}
