import {
  Body,
  Controller,
  forwardRef,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  admissionsAnalyticsSchema,
  createApplicationNoteSchema,
  listApplicationsSchema,
  listApprovedApplicationsSchema,
  listConditionalApprovalQueueSchema,
  listRejectedApplicationsSchema,
  manualPromoteApplicationSchema,
  regenerateAdmissionsPaymentLinkSchema,
  reviewApplicationSchema,
} from '@school/shared';
import type {
  AdmissionsAnalyticsQuery,
  CreateApplicationNoteDto,
  JwtPayload,
  ListApplicationsQuery,
  ListApprovedApplicationsQuery,
  ListConditionalApprovalQueueQuery,
  ListRejectedApplicationsQuery,
  ManualPromoteApplicationDto,
  RegenerateAdmissionsPaymentLinkDto,
  ReviewApplicationDto,
  TenantContext,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { StripeService } from '../finance/stripe.service';

import { ApplicationNotesService } from './application-notes.service';
import { ApplicationsService } from './applications.service';

@Controller('v1/applications')
@UseGuards(AuthGuard, PermissionGuard)
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
    private readonly applicationNotesService: ApplicationNotesService,
    @Inject(forwardRef(() => StripeService))
    private readonly stripeService: StripeService,
    private readonly configService: ConfigService,
  ) {}

  private buildDefaultCheckoutUrls(
    tenantId: string,
    applicationId: string,
  ): { success_url: string; cancel_url: string } {
    const appUrl =
      this.configService.get<string>('APP_URL') ?? process.env.APP_URL ?? 'https://app.edupod.app';
    const base = appUrl.replace(/\/$/, '');
    return {
      success_url: `${base}/en/apply/payment-success?application=${applicationId}&tenant=${tenantId}`,
      cancel_url: `${base}/en/apply/payment-cancelled?application=${applicationId}&tenant=${tenantId}`,
    };
  }

  @Get()
  @RequiresPermission('admissions.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listApplicationsSchema))
    query: ListApplicationsQuery,
  ) {
    return this.applicationsService.findAll(tenant.tenant_id, query);
  }

  // GET /v1/applications/queues/ready-to-admit
  @Get('queues/ready-to-admit')
  @RequiresPermission('admissions.view')
  async getReadyToAdmitQueue(@CurrentTenant() tenant: TenantContext) {
    return this.applicationsService.getReadyToAdmitQueue(tenant.tenant_id);
  }

  // GET /v1/applications/queues/waiting-list
  @Get('queues/waiting-list')
  @RequiresPermission('admissions.view')
  async getWaitingListQueue(@CurrentTenant() tenant: TenantContext) {
    return this.applicationsService.getWaitingListQueue(tenant.tenant_id);
  }

  // GET /v1/applications/queues/conditional-approval
  @Get('queues/conditional-approval')
  @RequiresPermission('admissions.view')
  async getConditionalApprovalQueue(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listConditionalApprovalQueueSchema))
    query: ListConditionalApprovalQueueQuery,
  ) {
    return this.applicationsService.getConditionalApprovalQueue(tenant.tenant_id, query);
  }

  // GET /v1/applications/queues/approved
  @Get('queues/approved')
  @RequiresPermission('admissions.view')
  async getApprovedQueue(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listApprovedApplicationsSchema))
    query: ListApprovedApplicationsQuery,
  ) {
    return this.applicationsService.getApprovedQueue(tenant.tenant_id, query);
  }

  // GET /v1/applications/queues/rejected
  @Get('queues/rejected')
  @RequiresPermission('admissions.view')
  async getRejectedArchive(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listRejectedApplicationsSchema))
    query: ListRejectedApplicationsQuery,
  ) {
    return this.applicationsService.getRejectedArchive(tenant.tenant_id, query);
  }

  @Get('analytics')
  @RequiresPermission('admissions.view')
  async getAnalytics(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(admissionsAnalyticsSchema))
    query: AdmissionsAnalyticsQuery,
  ) {
    return this.applicationsService.getAnalytics(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('admissions.view')
  async findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.applicationsService.findOne(tenant.tenant_id, id);
  }

  @Get(':id/preview')
  @RequiresPermission('admissions.view')
  async preview(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.applicationsService.preview(tenant.tenant_id, id);
  }

  @Post(':id/review')
  @RequiresPermission('admissions.manage')
  async review(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewApplicationSchema))
    dto: ReviewApplicationDto,
  ) {
    return this.applicationsService.review(tenant.tenant_id, id, dto, user.sub);
  }

  @Post(':id/withdraw')
  @RequiresPermission('admissions.manage')
  async withdraw(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.applicationsService.withdraw(
      tenant.tenant_id,
      id,
      user.sub,
      false, // isParent = false (staff withdrawal)
    );
  }

  @Get(':applicationId/notes')
  @RequiresPermission('admissions.view')
  async getNotes(
    @CurrentTenant() tenant: TenantContext,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
  ) {
    return this.applicationNotesService.findByApplication(
      tenant.tenant_id,
      applicationId,
      true, // includeInternal = true for staff
    );
  }

  @Post(':applicationId/notes')
  @RequiresPermission('admissions.manage')
  async createNote(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('applicationId', ParseUUIDPipe) applicationId: string,
    @Body(new ZodValidationPipe(createApplicationNoteSchema))
    dto: CreateApplicationNoteDto,
  ) {
    return this.applicationNotesService.create(tenant.tenant_id, applicationId, user.sub, dto);
  }

  // POST /v1/applications/:id/manual-promote
  @Post(':id/manual-promote')
  @RequiresPermission('admissions.manage')
  async manualPromote(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(manualPromoteApplicationSchema))
    dto: ManualPromoteApplicationDto,
  ) {
    return this.applicationsService.manuallyPromote(tenant.tenant_id, id, {
      actingUserId: user.sub,
      justification: dto.justification,
    });
  }

  // POST /v1/applications/:id/payment-link/regenerate
  @Post(':id/payment-link/regenerate')
  @RequiresPermission('admissions.manage')
  async regeneratePaymentLink(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(regenerateAdmissionsPaymentLinkSchema))
    dto: RegenerateAdmissionsPaymentLinkDto,
  ) {
    const defaults = this.buildDefaultCheckoutUrls(tenant.tenant_id, id);
    const successUrl = dto?.success_url ?? defaults.success_url;
    const cancelUrl = dto?.cancel_url ?? defaults.cancel_url;
    const session = await this.stripeService.createAdmissionsCheckoutSession(
      tenant.tenant_id,
      id,
      successUrl,
      cancelUrl,
    );

    // ADM-011: write an internal audit note so spammed regenerates leave a
    // trail of who did it and which session was issued. Suffix only — full
    // session id has no PII but is unnecessary in the audit body.
    const sessionSuffix = session.session_id ? session.session_id.slice(-8) : 'unknown';
    try {
      await this.applicationNotesService.create(tenant.tenant_id, id, user.sub, {
        note: `Regenerated payment link. New checkout session …${sessionSuffix}.`,
        is_internal: true,
      });
    } catch (err) {
      // Audit-trail failure should not block the regenerate response — log
      // and continue. The note write is a best-effort companion to the
      // primary side effect (a new Stripe session).
      // eslint-disable-next-line no-console
      console.error('[ApplicationsController.regeneratePaymentLink audit]', err);
    }

    return session;
  }
}
