import {
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload } from '@school/shared';
import type { Response } from 'express';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { AcademicPeriodsService } from '../academics/academic-periods.service';
import { PdfRenderingService } from '../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../prisma/prisma.service';

import { GradesService } from './grades.service';
import { ReportCardsService } from './report-cards.service';
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
    private readonly reportCardsService: ReportCardsService,
    private readonly transcriptsService: TranscriptsService,
    private readonly pdfRenderingService: PdfRenderingService,
    private readonly prisma: PrismaService,
    private readonly academicPeriodsService: AcademicPeriodsService,
  ) {}

  @Get('parent/academic-periods')
  @RequiresPermission('parent.view_grades')
  async getAcademicPeriods(
    @CurrentTenant() tenant: { tenant_id: string },
  ) {
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
    return this.reportCardsService.findAll(tenant.tenant_id, {
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
    const reportCard = await this.reportCardsService.findOne(
      tenant.tenant_id,
      reportCardId,
    );

    if (reportCard.student_id !== studentId) {
      throw new ForbiddenException({
        code: 'NOT_LINKED_TO_STUDENT',
        message: 'This report card does not belong to the specified student',
      });
    }

    if (reportCard.status !== 'published') {
      throw new ForbiddenException({
        code: 'REPORT_CARD_NOT_PUBLISHED',
        message: 'This report card is not yet published',
      });
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
    const tenantRecord = await this.prisma.tenant.findFirst({
      where: { id: tenant.tenant_id },
      select: { default_locale: true },
    });
    const locale = tenantRecord?.default_locale ?? 'en';

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

  // ─── Private Helpers ────────────────────────────────────────────────────

  /**
   * Verify that the current user is a parent linked to the specified student.
   */
  private async verifyParentStudentLink(
    userId: string,
    tenantId: string,
    studentId: string,
  ): Promise<void> {
    const parent = await this.prisma.parent.findFirst({
      where: { user_id: userId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!parent) {
      throw new NotFoundException({
        code: 'PARENT_NOT_FOUND',
        message: 'No parent profile found for the current user',
      });
    }

    const link = await this.prisma.studentParent.findUnique({
      where: {
        student_id_parent_id: {
          student_id: studentId,
          parent_id: parent.id,
        },
      },
    });

    if (!link || link.tenant_id !== tenantId) {
      throw new ForbiddenException({
        code: 'NOT_LINKED_TO_STUDENT',
        message: 'You are not linked to this student',
      });
    }
  }

  private async loadBranding(tenantId: string) {
    const tenant = await this.prisma.tenant.findFirst({
      where: { id: tenantId },
      select: { name: true },
    });

    const branding = await this.prisma.tenantBranding.findFirst({
      where: { tenant_id: tenantId },
      select: {
        school_name_ar: true,
        logo_url: true,
        primary_color: true,
      },
    });

    return {
      school_name: tenant?.name ?? '',
      school_name_ar: branding?.school_name_ar ?? undefined,
      logo_url: branding?.logo_url ?? undefined,
      primary_color: branding?.primary_color ?? undefined,
    };
  }
}
