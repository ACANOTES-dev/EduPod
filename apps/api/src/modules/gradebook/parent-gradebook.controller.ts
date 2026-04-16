import {
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';

import type { JwtPayload } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { apiError } from '../../common/errors/api-error';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AcademicPeriodsService } from '../academics/academic-periods.service';
import { ParentReadFacade } from '../parents/parent-read.facade';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { StudentReadFacade } from '../students/student-read.facade';
import { TenantReadFacade } from '../tenants/tenant-read.facade';

import { GradesService } from './grades.service';
import { ReportCardAcknowledgmentService } from './report-cards/report-card-acknowledgment.service';
import { ReportCardsQueriesService } from './report-cards/report-cards-queries.service';
import { TranscriptsService } from './transcripts.service';

// ─── Query Schemas ────────────────────────────────────────────────────────

const parentGradesQuerySchema = z.object({
  class_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  academic_period_id: z.string().uuid().optional(),
});

const parentReportCardsQuerySchema = z.object({
  academic_period_id: z.string().uuid().optional(),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class ParentGradebookController {
  constructor(
    private readonly gradesService: GradesService,
    private readonly acknowledgmentService: ReportCardAcknowledgmentService,
    private readonly reportCardsQueriesService: ReportCardsQueriesService,
    private readonly transcriptsService: TranscriptsService,
    private readonly pdfRenderingService: PdfRenderingService,
    private readonly academicPeriodsService: AcademicPeriodsService,
    private readonly parentReadFacade: ParentReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly tenantReadFacade: TenantReadFacade,
  ) {}

  @Get('parent/academic-periods')
  @RequiresPermission('parent.view_grades')
  async getAcademicPeriods(@CurrentTenant() tenant: { tenant_id: string }) {
    return this.academicPeriodsService.findAll(tenant.tenant_id, 50);
  }

  @Get('parent/students/:studentId/grades')
  @RequiresPermission('parent.view_grades')
  async getStudentGrades(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(parentGradesQuerySchema))
    query: z.infer<typeof parentGradesQuerySchema>,
  ) {
    await this.verifyParentStudentLink(user.sub, tenant.tenant_id, studentId);

    return this.gradesService.findByStudent(tenant.tenant_id, studentId, query);
  }

  @Get('parent/students/:studentId/report-cards')
  @RequiresPermission('parent.view_grades')
  async getStudentReportCards(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(parentReportCardsQuerySchema))
    query: z.infer<typeof parentReportCardsQuerySchema>,
  ) {
    await this.verifyParentStudentLink(user.sub, tenant.tenant_id, studentId);

    // Only return published report cards for parents
    return this.reportCardsQueriesService.findAll(tenant.tenant_id, {
      page: 1,
      pageSize: 100,
      student_id: studentId,
      academic_period_id: query.academic_period_id,
      status: 'published',
      include_revisions: false,
    });
  }

  @Get('parent/students/:studentId/report-cards/:reportCardId/pdf')
  @RequiresPermission('parent.view_grades')
  async getStudentReportCardPdf(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Param('reportCardId', ParseUUIDPipe) reportCardId: string,
    @Res() res: Response,
  ) {
    await this.verifyParentStudentLink(user.sub, tenant.tenant_id, studentId);

    // Load the report card and verify it belongs to the student and is published
    const reportCard = await this.reportCardsQueriesService.findOne(tenant.tenant_id, reportCardId);

    if (reportCard.student_id !== studentId) {
      throw new ForbiddenException(
        apiError(
          'NOT_LINKED_TO_STUDENT',
          'This report card does not belong to the specified student',
        ),
      );
    }

    if (reportCard.status !== 'published') {
      throw new ForbiddenException(
        apiError('REPORT_CARD_NOT_PUBLISHED', 'This report card is not yet published'),
      );
    }

    const branding = await this.loadBranding(tenant.tenant_id);

    const pdfBuffer = await this.pdfRenderingService.renderPdf(
      'report-card',
      reportCard.template_locale,
      reportCard.snapshot_payload_json,
      branding,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="report-card.pdf"',
    });
    res.send(pdfBuffer);
  }

  @Get('parent/students/:studentId/transcript/pdf')
  @RequiresPermission('parent.view_transcripts')
  async getStudentTranscriptPdf(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Res() res: Response,
  ) {
    await this.verifyParentStudentLink(user.sub, tenant.tenant_id, studentId);

    const transcriptData = await this.transcriptsService.getTranscriptData(
      tenant.tenant_id,
      studentId,
    );

    const branding = await this.loadBranding(tenant.tenant_id);

    // Determine locale from tenant default
    const locale = await this.tenantReadFacade.findDefaultLocale(tenant.tenant_id);

    const pdfBuffer = await this.pdfRenderingService.renderPdf(
      'transcript',
      locale,
      transcriptData,
      branding,
    );

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="transcript.pdf"',
    });
    res.send(pdfBuffer);
  }

  // POST /v1/parent/report-cards/:reportCardId/acknowledge
  @Post('parent/report-cards/:reportCardId/acknowledge')
  @RequiresPermission('parent.view_grades')
  @HttpCode(HttpStatus.OK)
  async acknowledgeReportCard(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('reportCardId', ParseUUIDPipe) reportCardId: string,
    @Req() req: Request,
  ) {
    const ipAddress =
      (req.headers['x-forwarded-for'] as string | undefined) ??
      req.socket.remoteAddress ??
      undefined;
    return this.acknowledgmentService.acknowledge(
      tenant.tenant_id,
      reportCardId,
      user.sub,
      ipAddress,
    );
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  /**
   * Verify that the current user is a parent linked to the specified student.
   */
  private async verifyParentStudentLink(
    userId: string,
    tenantId: string,
    studentId: string,
  ): Promise<void> {
    const parent = await this.parentReadFacade.findByUserId(tenantId, userId);

    if (!parent) {
      throw new NotFoundException(
        apiError('PARENT_NOT_FOUND', 'No parent profile found for the current user'),
      );
    }

    const isLinked = await this.studentReadFacade.isParentLinked(tenantId, studentId, parent.id);

    if (!isLinked) {
      throw new ForbiddenException(
        apiError('NOT_LINKED_TO_STUDENT', 'You are not linked to this student'),
      );
    }
  }

  private async loadBranding(tenantId: string) {
    const tenantName = await this.tenantReadFacade.findNameById(tenantId);
    const branding = await this.tenantReadFacade.findBranding(tenantId);

    return {
      school_name: tenantName ?? '',
      school_name_ar: branding?.school_name_ar ?? undefined,
      logo_url: branding?.logo_url ?? undefined,
      primary_color: branding?.primary_color ?? undefined,
    };
  }
}
