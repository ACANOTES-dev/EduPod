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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { z } from 'zod';

import type { JwtPayload, TenantContext } from '@school/shared';
import {
  approveSealSchema,
  assignSafeguardingConcernSchema,
  completeBreakGlassReviewSchema,
  gardaReferralSchema,
  grantBreakGlassSchema,
  initiateSealSchema,
  listSafeguardingActionsQuerySchema,
  listSafeguardingConcernsQuerySchema,
  myReportsQuerySchema,
  recordSafeguardingActionSchema,
  reportSafeguardingConcernSchema,
  safeguardingStatusTransitionSchema,
  tuslaReferralSchema,
  updateSafeguardingConcernSchema,
  uploadSafeguardingAttachmentSchema,
} from '@school/shared/behaviour';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { SafeguardingAttachmentService } from './safeguarding-attachment.service';
import { SafeguardingBreakGlassService } from './safeguarding-break-glass.service';
import { SafeguardingService } from './safeguarding.service';

@Controller('v1/safeguarding')
@UseGuards(AuthGuard, PermissionGuard)
export class SafeguardingController {
  constructor(
    private readonly safeguardingService: SafeguardingService,
    private readonly attachmentService: SafeguardingAttachmentService,
    private readonly breakGlassService: SafeguardingBreakGlassService,
  ) {}

  // ─── Concern CRUD ───────────────────────────────────────────────────────

  @Post('concerns')
  @RequiresPermission('safeguarding.report')
  @HttpCode(HttpStatus.CREATED)
  async reportConcern(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(reportSafeguardingConcernSchema))
    dto: z.infer<typeof reportSafeguardingConcernSchema>,
  ) {
    return this.safeguardingService.reportConcern(tenant.tenant_id, user.sub, dto);
  }

  @Get('my-reports')
  @RequiresPermission('safeguarding.report')
  async getMyReports(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(myReportsQuerySchema))
    query: z.infer<typeof myReportsQuerySchema>,
  ) {
    return this.safeguardingService.getMyReports(tenant.tenant_id, user.sub, query);
  }

  @Get('concerns')
  @RequiresPermission('safeguarding.view')
  async listConcerns(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listSafeguardingConcernsQuerySchema))
    query: z.infer<typeof listSafeguardingConcernsQuerySchema>,
  ) {
    return this.safeguardingService.listConcerns(
      tenant.tenant_id,
      user.sub,
      user.membership_id ?? '',
      query,
    );
  }

  @Get('concerns/:id')
  @RequiresPermission('safeguarding.view')
  async getConcernDetail(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.safeguardingService.getConcernDetail(
      tenant.tenant_id,
      user.sub,
      user.membership_id ?? '',
      id,
    );
  }

  @Patch('concerns/:id')
  @RequiresPermission('safeguarding.manage')
  async updateConcern(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSafeguardingConcernSchema))
    dto: z.infer<typeof updateSafeguardingConcernSchema>,
  ) {
    return this.safeguardingService.updateConcern(tenant.tenant_id, user.sub, id, dto);
  }

  @Patch('concerns/:id/status')
  @RequiresPermission('safeguarding.manage')
  async transitionStatus(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(safeguardingStatusTransitionSchema))
    dto: z.infer<typeof safeguardingStatusTransitionSchema>,
  ) {
    return this.safeguardingService.transitionStatus(tenant.tenant_id, user.sub, id, dto);
  }

  @Post('concerns/:id/assign')
  @RequiresPermission('safeguarding.manage')
  async assignConcern(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignSafeguardingConcernSchema))
    dto: z.infer<typeof assignSafeguardingConcernSchema>,
  ) {
    return this.safeguardingService.assignConcern(tenant.tenant_id, user.sub, id, dto);
  }

  // ─── Actions ────────────────────────────────────────────────────────────

  @Post('concerns/:id/actions')
  @RequiresPermission('safeguarding.manage')
  @HttpCode(HttpStatus.CREATED)
  async recordAction(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordSafeguardingActionSchema))
    dto: z.infer<typeof recordSafeguardingActionSchema>,
  ) {
    return this.safeguardingService.recordAction(tenant.tenant_id, user.sub, id, dto);
  }

  @Get('concerns/:id/actions')
  @RequiresPermission('safeguarding.view')
  async getActions(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Query(new ZodValidationPipe(listSafeguardingActionsQuerySchema))
    query: z.infer<typeof listSafeguardingActionsQuerySchema>,
  ) {
    return this.safeguardingService.getActions(
      tenant.tenant_id,
      user.sub,
      user.membership_id ?? '',
      id,
      query,
    );
  }

  // ─── Referrals ──────────────────────────────────────────────────────────

  @Post('concerns/:id/tusla-referral')
  @RequiresPermission('safeguarding.manage')
  async recordTuslaReferral(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(tuslaReferralSchema))
    dto: z.infer<typeof tuslaReferralSchema>,
  ) {
    return this.safeguardingService.recordTuslaReferral(tenant.tenant_id, user.sub, id, dto);
  }

  @Post('concerns/:id/garda-referral')
  @RequiresPermission('safeguarding.manage')
  async recordGardaReferral(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(gardaReferralSchema))
    dto: z.infer<typeof gardaReferralSchema>,
  ) {
    return this.safeguardingService.recordGardaReferral(tenant.tenant_id, user.sub, id, dto);
  }

  // ─── Attachments ────────────────────────────────────────────────────────

  @Post('concerns/:id/attachments')
  @RequiresPermission('safeguarding.manage')
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttachment(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
    @Body(new ZodValidationPipe(uploadSafeguardingAttachmentSchema))
    dto: z.infer<typeof uploadSafeguardingAttachmentSchema>,
  ) {
    return this.attachmentService.uploadAttachment(tenant.tenant_id, user.sub, id, file, dto);
  }

  @Get('concerns/:id/attachments/:aid/download')
  @RequiresPermission('safeguarding.view')
  async downloadAttachment(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('aid', ParseUUIDPipe) aid: string,
  ) {
    return this.attachmentService.generateDownloadUrl(
      tenant.tenant_id,
      user.sub,
      user.membership_id ?? '',
      id,
      aid,
      (userId, tenantId, membershipId, concernId) =>
        this.safeguardingService.checkEffectivePermission(
          userId,
          tenantId,
          membershipId,
          concernId,
        ),
    );
  }

  // ─── Case File PDF ──────────────────────────────────────────────────────

  @Post('concerns/:id/case-file')
  @RequiresPermission('safeguarding.manage')
  @HttpCode(HttpStatus.OK)
  async generateCaseFile(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.safeguardingService.generateCaseFile(tenant.tenant_id, id, false);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="case-file-${id.slice(0, 8)}.pdf"`,
    });
    res.send(buffer);
  }

  @Post('concerns/:id/case-file/redacted')
  @RequiresPermission('safeguarding.manage')
  @HttpCode(HttpStatus.OK)
  async generateRedactedCaseFile(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.safeguardingService.generateCaseFile(tenant.tenant_id, id, true);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="case-file-redacted-${id.slice(0, 8)}.pdf"`,
    });
    res.send(buffer);
  }

  // ─── Seal ───────────────────────────────────────────────────────────────

  @Post('concerns/:id/seal/initiate')
  @RequiresPermission('safeguarding.seal')
  async initiateSeal(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(initiateSealSchema))
    dto: z.infer<typeof initiateSealSchema>,
  ) {
    return this.safeguardingService.initiateSeal(tenant.tenant_id, user.sub, id, dto);
  }

  @Post('concerns/:id/seal/approve')
  @RequiresPermission('safeguarding.seal')
  async approveSeal(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approveSealSchema))
    _dto: z.infer<typeof approveSealSchema>,
  ) {
    return this.safeguardingService.approveSeal(tenant.tenant_id, user.sub, id);
  }

  // ─── Dashboard ──────────────────────────────────────────────────────────

  @Get('dashboard')
  @RequiresPermission('safeguarding.view')
  async getDashboard(@CurrentTenant() tenant: TenantContext) {
    return this.safeguardingService.getDashboard(tenant.tenant_id);
  }

  // ─── Break-Glass ────────────────────────────────────────────────────────

  @Post('break-glass')
  @RequiresPermission('safeguarding.seal')
  @HttpCode(HttpStatus.CREATED)
  async grantBreakGlass(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(grantBreakGlassSchema))
    dto: z.infer<typeof grantBreakGlassSchema>,
  ) {
    return this.breakGlassService.grantAccess(tenant.tenant_id, user.sub, dto);
  }

  @Get('break-glass')
  @RequiresPermission('safeguarding.seal')
  async listBreakGlassGrants(@CurrentTenant() tenant: TenantContext) {
    return this.breakGlassService.listActiveGrants(tenant.tenant_id);
  }

  @Post('break-glass/:id/review')
  @RequiresPermission('safeguarding.manage')
  async completeBreakGlassReview(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(completeBreakGlassReviewSchema))
    dto: z.infer<typeof completeBreakGlassReviewSchema>,
  ) {
    return this.breakGlassService.completeReview(tenant.tenant_id, user.sub, id, dto);
  }
}
