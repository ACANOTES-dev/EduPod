import { InjectQueue } from '@nestjs/bullmq';
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
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Request } from 'express';
import { z } from 'zod';

import type { JwtPayload } from '@school/shared';
import {
  acknowledgeReportCardSchema,
  analyticsQuerySchema,
  batchPdfSchema,
  bulkApproveSchema,
  bulkDeliverSchema,
  bulkGenerateSchema,
  bulkPublishSchema,
  createApprovalConfigSchema,
  createCustomFieldDefSchema,
  createGradeThresholdConfigSchema,
  createReportCardTemplateSchema,
  getPendingApprovalsQuerySchema,
  listReportCardTemplatesQuerySchema,
  rejectApprovalSchema,
  saveCustomFieldValuesSchema,
  updateApprovalConfigSchema,
  updateCustomFieldDefSchema,
  updateGradeThresholdConfigSchema,
  updateReportCardTemplateSchema,
} from '@school/shared';

import { CurrentTenant } from '../../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { PermissionGuard } from '../../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../../common/pipes/zod-validation.pipe';

import { GradeThresholdService } from './grade-threshold.service';
import { ReportCardAcknowledgmentService } from './report-card-acknowledgment.service';
import { ReportCardAnalyticsService } from './report-card-analytics.service';
import { ReportCardApprovalService } from './report-card-approval.service';
import { ReportCardCustomFieldsService } from './report-card-custom-fields.service';
import { ReportCardDeliveryService } from './report-card-delivery.service';
import { ReportCardTemplateService } from './report-card-template.service';
import { ReportCardVerificationService } from './report-card-verification.service';
import { ReportCardsQueriesService } from './report-cards-queries.service';
import { ReportCardsService } from './report-cards.service';

// ─── Public Verification Controller ──────────────────────────────────────────

/**
 * Public controller for QR code verification.
 * No auth required — accessible by anyone with the token.
 */
@Controller('v1')
export class ReportCardVerificationController {
  constructor(private readonly verificationService: ReportCardVerificationService) {}

  @Get('verify/:token')
  async verify(@Param('token') token: string) {
    return this.verificationService.verify(token);
  }
}

// ─── Enhanced Report Cards Controller ────────────────────────────────────────

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class ReportCardsEnhancedController {
  constructor(
    private readonly templateService: ReportCardTemplateService,
    private readonly approvalService: ReportCardApprovalService,
    private readonly deliveryService: ReportCardDeliveryService,
    private readonly customFieldsService: ReportCardCustomFieldsService,
    private readonly thresholdService: GradeThresholdService,
    private readonly verificationService: ReportCardVerificationService,
    private readonly acknowledgmentService: ReportCardAcknowledgmentService,
    private readonly analyticsService: ReportCardAnalyticsService,
    private readonly reportCardsService: ReportCardsService,
    private readonly reportCardsQueriesService: ReportCardsQueriesService,
    @InjectQueue('gradebook') private readonly gradebookQueue: Queue,
  ) {}

  // ─── Template CRUD (R1) ──────────────────────────────────────────────────

  @Post('report-cards/templates')
  @RequiresPermission('report_cards.manage_templates')
  @HttpCode(HttpStatus.CREATED)
  async createTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createReportCardTemplateSchema))
    dto: z.infer<typeof createReportCardTemplateSchema>,
  ) {
    return this.templateService.create(tenant.tenant_id, user.sub, dto);
  }

  @Get('report-cards/templates')
  @RequiresPermission('gradebook.view')
  async listTemplates(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listReportCardTemplatesQuerySchema))
    query: z.infer<typeof listReportCardTemplatesQuerySchema>,
  ) {
    return this.templateService.findAll(tenant.tenant_id, query);
  }

  // Static route `content-scopes` MUST come before the dynamic `:id` route
  // so NestJS matches it first.
  @Get('report-cards/templates/content-scopes')
  @RequiresPermission('report_cards.view')
  async listTemplateContentScopes(@CurrentTenant() tenant: { tenant_id: string }) {
    const data = await this.templateService.listContentScopes(tenant.tenant_id);
    return { data };
  }

  @Get('report-cards/templates/:id')
  @RequiresPermission('gradebook.view')
  async getTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templateService.findOne(tenant.tenant_id, id);
  }

  @Patch('report-cards/templates/:id')
  @RequiresPermission('report_cards.manage_templates')
  async updateTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateReportCardTemplateSchema))
    dto: z.infer<typeof updateReportCardTemplateSchema>,
  ) {
    return this.templateService.update(tenant.tenant_id, id, dto);
  }

  @Delete('report-cards/templates/:id')
  @RequiresPermission('report_cards.manage_templates')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.templateService.remove(tenant.tenant_id, id);
  }

  // ─── AI Template Conversion (R2) ─────────────────────────────────────────

  @Post('report-cards/templates/convert-from-image')
  @RequiresPermission('report_cards.manage_templates')
  @HttpCode(HttpStatus.CREATED)
  async convertTemplateFromImage(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Req() req: Request,
  ) {
    // Expect raw binary body (image buffer)
    const buffer = req.body as Buffer;
    const mimeType = req.headers['content-type'] ?? 'image/jpeg';
    return this.templateService.convertFromImage(tenant.tenant_id, user.sub, buffer, mimeType);
  }

  // ─── Approval Config CRUD (R3) ───────────────────────────────────────────

  @Post('report-cards/approval-configs')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async createApprovalConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createApprovalConfigSchema))
    dto: z.infer<typeof createApprovalConfigSchema>,
  ) {
    return this.approvalService.createConfig(tenant.tenant_id, dto);
  }

  @Get('report-cards/approval-configs')
  @RequiresPermission('gradebook.view')
  async listApprovalConfigs(@CurrentTenant() tenant: { tenant_id: string }) {
    return this.approvalService.findAllConfigs(tenant.tenant_id);
  }

  @Get('report-cards/approval-configs/:id')
  @RequiresPermission('gradebook.view')
  async getApprovalConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.approvalService.findOneConfig(tenant.tenant_id, id);
  }

  @Patch('report-cards/approval-configs/:id')
  @RequiresPermission('gradebook.manage')
  async updateApprovalConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateApprovalConfigSchema))
    dto: z.infer<typeof updateApprovalConfigSchema>,
  ) {
    return this.approvalService.updateConfig(tenant.tenant_id, id, dto);
  }

  @Delete('report-cards/approval-configs/:id')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteApprovalConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.approvalService.removeConfig(tenant.tenant_id, id);
  }

  // ─── Approval Actions (R3) ───────────────────────────────────────────────

  @Post('report-cards/:id/submit-approval')
  @RequiresPermission('gradebook.manage')
  async submitForApproval(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.approvalService.submitForApproval(tenant.tenant_id, id);
  }

  @Post('report-cards/approvals/:id/approve')
  @RequiresPermission('report_cards.approve')
  async approveReportCard(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.approvalService.approve(tenant.tenant_id, id, user.sub);
  }

  @Post('report-cards/approvals/:id/reject')
  @RequiresPermission('report_cards.approve')
  async rejectReportCard(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rejectApprovalSchema))
    dto: z.infer<typeof rejectApprovalSchema>,
  ) {
    return this.approvalService.reject(tenant.tenant_id, id, user.sub, dto.reason);
  }

  @Get('report-cards/approvals/pending')
  @RequiresPermission('report_cards.approve')
  async getPendingApprovals(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(getPendingApprovalsQuerySchema))
    query: z.infer<typeof getPendingApprovalsQuerySchema>,
  ) {
    return this.approvalService.getPendingApprovals(tenant.tenant_id, user.sub, query.role_key, {
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Post('report-cards/approvals/bulk-approve')
  @RequiresPermission('report_cards.approve')
  async bulkApprove(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(bulkApproveSchema))
    dto: z.infer<typeof bulkApproveSchema>,
  ) {
    return this.approvalService.bulkApprove(tenant.tenant_id, dto.approval_ids, user.sub);
  }

  // ─── Delivery (R5) ───────────────────────────────────────────────────────

  @Post('report-cards/:id/deliver')
  @RequiresPermission('gradebook.publish_report_cards')
  async deliverReportCard(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveryService.deliver(tenant.tenant_id, id);
  }

  @Get('report-cards/:id/delivery-status')
  @RequiresPermission('gradebook.view')
  async getDeliveryStatus(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.deliveryService.getDeliveryStatus(tenant.tenant_id, id);
  }

  // ─── Custom Fields CRUD (R8) ─────────────────────────────────────────────

  @Post('report-cards/custom-fields')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async createCustomField(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createCustomFieldDefSchema))
    dto: z.infer<typeof createCustomFieldDefSchema>,
  ) {
    return this.customFieldsService.createFieldDef(tenant.tenant_id, dto);
  }

  @Get('report-cards/custom-fields')
  @RequiresPermission('gradebook.view')
  async listCustomFields(@CurrentTenant() tenant: { tenant_id: string }) {
    return this.customFieldsService.findAllFieldDefs(tenant.tenant_id);
  }

  @Get('report-cards/custom-fields/:id')
  @RequiresPermission('gradebook.view')
  async getCustomField(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customFieldsService.findOneFieldDef(tenant.tenant_id, id);
  }

  @Patch('report-cards/custom-fields/:id')
  @RequiresPermission('gradebook.manage')
  async updateCustomField(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCustomFieldDefSchema))
    dto: z.infer<typeof updateCustomFieldDefSchema>,
  ) {
    return this.customFieldsService.updateFieldDef(tenant.tenant_id, id, dto);
  }

  @Delete('report-cards/custom-fields/:id')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCustomField(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customFieldsService.removeFieldDef(tenant.tenant_id, id);
  }

  @Put('report-cards/:id/custom-field-values')
  @RequiresPermission('gradebook.manage')
  async saveCustomFieldValues(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(saveCustomFieldValuesSchema))
    dto: z.infer<typeof saveCustomFieldValuesSchema>,
  ) {
    return this.customFieldsService.saveFieldValues(tenant.tenant_id, id, user.sub, dto.values);
  }

  @Get('report-cards/:id/custom-field-values')
  @RequiresPermission('gradebook.view')
  async getCustomFieldValues(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.customFieldsService.getFieldValues(tenant.tenant_id, id);
  }

  // ─── Grade Thresholds CRUD (R11) ─────────────────────────────────────────

  @Post('report-cards/grade-thresholds')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async createThreshold(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createGradeThresholdConfigSchema))
    dto: z.infer<typeof createGradeThresholdConfigSchema>,
  ) {
    return this.thresholdService.create(tenant.tenant_id, dto);
  }

  @Get('report-cards/grade-thresholds')
  @RequiresPermission('gradebook.view')
  async listThresholds(@CurrentTenant() tenant: { tenant_id: string }) {
    return this.thresholdService.findAll(tenant.tenant_id);
  }

  @Get('report-cards/grade-thresholds/:id')
  @RequiresPermission('gradebook.view')
  async getThreshold(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.thresholdService.findOne(tenant.tenant_id, id);
  }

  @Patch('report-cards/grade-thresholds/:id')
  @RequiresPermission('gradebook.manage')
  async updateThreshold(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateGradeThresholdConfigSchema))
    dto: z.infer<typeof updateGradeThresholdConfigSchema>,
  ) {
    return this.thresholdService.update(tenant.tenant_id, id, dto);
  }

  @Delete('report-cards/grade-thresholds/:id')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteThreshold(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.thresholdService.remove(tenant.tenant_id, id);
  }

  // ─── Acknowledgment (R13) ────────────────────────────────────────────────

  @Post('report-cards/:id/acknowledge')
  @RequiresPermission('gradebook.view')
  async acknowledgeReportCard(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(acknowledgeReportCardSchema))
    dto: z.infer<typeof acknowledgeReportCardSchema>,
    @Req() req: Request,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined) ??
      req.socket.remoteAddress ??
      undefined;
    return this.acknowledgmentService.acknowledge(tenant.tenant_id, id, dto.parent_id, ipAddress);
  }

  @Get('report-cards/:id/acknowledgment-status')
  @RequiresPermission('gradebook.view')
  async getAcknowledgmentStatus(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.acknowledgmentService.getAcknowledgmentStatus(tenant.tenant_id, id);
  }

  // ─── Analytics (R10) ─────────────────────────────────────────────────────

  @Get('report-cards/analytics/dashboard')
  @RequiresPermission('gradebook.view_analytics')
  async getAnalyticsDashboard(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(analyticsQuerySchema))
    query: z.infer<typeof analyticsQuerySchema>,
  ) {
    return this.analyticsService.getDashboard(tenant.tenant_id, query.academic_period_id);
  }

  @Get('report-cards/analytics/class-comparison')
  @RequiresPermission('gradebook.view_analytics')
  async getClassComparison(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(analyticsQuerySchema))
    query: z.infer<typeof analyticsQuerySchema>,
  ) {
    const periodId = query.academic_period_id ?? '';
    return this.analyticsService.getClassComparison(tenant.tenant_id, periodId);
  }

  // ─── Bulk Operations (R4) ────────────────────────────────────────────────

  @Post('report-cards/bulk/generate')
  @RequiresPermission('report_cards.bulk_operations')
  @HttpCode(HttpStatus.CREATED)
  async bulkGenerate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkGenerateSchema))
    dto: z.infer<typeof bulkGenerateSchema>,
  ) {
    return this.reportCardsService.generateBulkDrafts(
      tenant.tenant_id,
      dto.class_id,
      dto.academic_period_id,
    );
  }

  @Post('report-cards/bulk/publish')
  @RequiresPermission('report_cards.bulk_operations')
  async bulkPublish(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(bulkPublishSchema))
    dto: z.infer<typeof bulkPublishSchema>,
  ) {
    return this.reportCardsService.publishBulk(tenant.tenant_id, dto.report_card_ids, user.sub);
  }

  @Post('report-cards/bulk/deliver')
  @RequiresPermission('report_cards.bulk_operations')
  async bulkDeliver(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkDeliverSchema))
    dto: z.infer<typeof bulkDeliverSchema>,
  ) {
    return this.deliveryService.bulkDeliver(tenant.tenant_id, dto.report_card_ids);
  }

  // ─── Transcript (R9) ─────────────────────────────────────────────────────

  @Get('report-cards/students/:studentId/transcript')
  @RequiresPermission('transcripts.generate')
  async getTranscript(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.reportCardsQueriesService.generateTranscript(tenant.tenant_id, studentId);
  }

  // ─── Verification Token (R15) ────────────────────────────────────────────

  @Post('report-cards/:id/verification-token')
  @RequiresPermission('gradebook.manage')
  async generateVerificationToken(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.verificationService.generateToken(tenant.tenant_id, id);
  }

  // ─── Batch PDF (R6) ──────────────────────────────────────────────────────

  @Post('report-cards/batch-pdf')
  @RequiresPermission('report_cards.bulk_operations')
  @HttpCode(HttpStatus.ACCEPTED)
  async enqueueBatchPdf(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(batchPdfSchema))
    dto: z.infer<typeof batchPdfSchema>,
  ) {
    await this.gradebookQueue.add('gradebook:batch-pdf', {
      tenant_id: tenant.tenant_id,
      class_id: dto.class_id,
      academic_period_id: dto.academic_period_id,
      template_id: dto.template_id ?? null,
      requested_by_user_id: user.sub,
    });

    return { message: 'Batch PDF generation queued', status: 'queued' };
  }
}
