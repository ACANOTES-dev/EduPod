import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  createAiGradingInstructionSchema,
  generateAiCommentsSchema,
  generateProgressReportsSchema,
  nlQuerySchema,
  publishGradesSchema,
  reviewAiGradingInstructionSchema,
  sendProgressReportSchema,
  updateProgressReportEntrySchema,
} from '@school/shared';
import type { JwtPayload } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { AiCommentsService } from './ai-comments.service';
import { AiGradingInstructionService } from './ai-grading-instruction.service';
import { AiGradingService } from './ai-grading.service';
import { AiProgressSummaryService } from './ai-progress-summary.service';
import { AnalyticsService } from './analytics.service';
import { GradePublishingService } from './grade-publishing.service';
import { NlQueryService } from './nl-query.service';
import { ProgressReportService } from './progress-report.service';

// ─── Uploaded File Shape ──────────────────────────────────────────────────────

interface UploadedFileShape {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

// ─── Query Schemas ────────────────────────────────────────────────────────────

const analyticsDistributionQuerySchema = z.object({
  class_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  period_id: z.string().uuid().optional(),
});

const studentTrendQuerySchema = z.object({
  subject_id: z.string().uuid().optional(),
});

const classTrendQuerySchema = z.object({
  subject_id: z.string().uuid(),
  period_id: z.string().uuid().optional(),
});

const teacherConsistencyQuerySchema = z.object({
  subject_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid().optional(),
});

const benchmarkQuerySchema = z.object({
  year_group_id: z.string().uuid(),
  subject_id: z.string().uuid().optional(),
  period_id: z.string().uuid().optional(),
});

const aiGradeInlineQuerySchema = z.object({
  assessment_id: z.string().uuid(),
  student_id: z.string().uuid(),
});

const listInstructionsQuerySchema = z.object({
  class_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  status: z
    .enum(['draft', 'pending_approval', 'active', 'rejected'])
    .optional(),
});

const createReferenceSchema = z.object({
  assessment_id: z.string().uuid(),
  file_url: z.string().url(),
  file_type: z.string().min(1).max(50),
  auto_approve: z.boolean().default(false),
});

const publishPeriodSchema = z.object({
  class_id: z.string().uuid(),
  period_id: z.string().uuid(),
});

const listProgressReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  class_id: z.string().uuid().optional(),
  academic_period_id: z.string().uuid().optional(),
  status: z.enum(['draft', 'sent']).optional(),
});

const progressSummaryQuerySchema = z.object({
  student_id: z.string().uuid(),
  period_id: z.string().uuid(),
  locale: z.string().min(1).max(10).default('en'),
});

const nlQueryHistoryQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// ─── Controller ───────────────────────────────────────────────────────────────

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class GradebookInsightsController {
  constructor(
    private readonly analyticsService: AnalyticsService,
    private readonly aiCommentsService: AiCommentsService,
    private readonly aiGradingService: AiGradingService,
    private readonly aiGradingInstructionService: AiGradingInstructionService,
    private readonly aiProgressSummaryService: AiProgressSummaryService,
    private readonly nlQueryService: NlQueryService,
    private readonly gradePublishingService: GradePublishingService,
    private readonly progressReportService: ProgressReportService,
  ) {}

  // ─── A: Analytics ──────────────────────────────────────────────────────────

  @Get('gradebook/analytics/distribution/:assessmentId')
  @RequiresPermission('gradebook.view_analytics')
  async getAssessmentDistribution(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    return this.analyticsService.getGradeDistribution(
      tenant.tenant_id,
      assessmentId,
    );
  }

  @Get('gradebook/analytics/period-distribution')
  @RequiresPermission('gradebook.view_analytics')
  async getPeriodDistribution(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(analyticsDistributionQuerySchema))
    query: z.infer<typeof analyticsDistributionQuerySchema>,
  ) {
    if (!query.class_id || !query.subject_id || !query.period_id) {
      throw new BadRequestException({
        error: {
          code: 'MISSING_PARAMS',
          message: 'class_id, subject_id, and period_id are required',
        },
      });
    }

    return this.analyticsService.getPeriodDistribution(
      tenant.tenant_id,
      query.class_id,
      query.subject_id,
      query.period_id,
    );
  }

  @Get('gradebook/analytics/students/:studentId/trend')
  @RequiresPermission('gradebook.view')
  async getStudentTrend(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(studentTrendQuerySchema))
    query: z.infer<typeof studentTrendQuerySchema>,
  ) {
    return this.analyticsService.getStudentTrend(
      tenant.tenant_id,
      studentId,
      query.subject_id,
    );
  }

  @Get('gradebook/analytics/classes/:classId/trend')
  @RequiresPermission('gradebook.view_analytics')
  async getClassTrend(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query(new ZodValidationPipe(classTrendQuerySchema))
    query: z.infer<typeof classTrendQuerySchema>,
  ) {
    return this.analyticsService.getClassTrend(
      tenant.tenant_id,
      classId,
      query.subject_id,
      query.period_id,
    );
  }

  @Get('gradebook/analytics/teacher-consistency')
  @RequiresPermission('gradebook.view_analytics')
  async getTeacherConsistency(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(teacherConsistencyQuerySchema))
    query: z.infer<typeof teacherConsistencyQuerySchema>,
  ) {
    return this.analyticsService.getTeacherConsistency(
      tenant.tenant_id,
      query.subject_id,
      query.year_group_id,
    );
  }

  @Get('gradebook/analytics/benchmark')
  @RequiresPermission('gradebook.view_analytics')
  async getBenchmark(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(benchmarkQuerySchema))
    query: z.infer<typeof benchmarkQuerySchema>,
  ) {
    return this.analyticsService.getBenchmark(
      tenant.tenant_id,
      query.year_group_id,
      query.subject_id,
      query.period_id,
    );
  }

  // ─── B1: AI Comments ────────────────────────────────────────────────────────

  @Post('gradebook/ai/generate-comment/:reportCardId')
  @RequiresPermission('gradebook.enter_grades')
  @HttpCode(HttpStatus.OK)
  async generateComment(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('reportCardId', ParseUUIDPipe) reportCardId: string,
  ) {
    return this.aiCommentsService.generateComment(
      tenant.tenant_id,
      reportCardId,
    );
  }

  @Post('gradebook/ai/generate-comments')
  @RequiresPermission('gradebook.enter_grades')
  @HttpCode(HttpStatus.OK)
  async generateBatchComments(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(generateAiCommentsSchema))
    dto: z.infer<typeof generateAiCommentsSchema>,
  ) {
    return this.aiCommentsService.generateBatchComments(
      tenant.tenant_id,
      dto.report_card_ids,
    );
  }

  // ─── B2: AI Grading ─────────────────────────────────────────────────────────

  @Post('gradebook/ai/grade-inline')
  @RequiresPermission('gradebook.enter_grades')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async gradeInline(
    @CurrentTenant() tenant: { tenant_id: string },
    @UploadedFile() file: UploadedFileShape | undefined,
    @Query(new ZodValidationPipe(aiGradeInlineQuerySchema))
    query: z.infer<typeof aiGradeInlineQuerySchema>,
  ) {
    if (!file) {
      throw new BadRequestException({
        error: { code: 'EMPTY_FILE', message: 'No file uploaded' },
      });
    }

    if (!AiGradingService.isAllowedMimeType(file.mimetype)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_MIME_TYPE',
          message: `File type "${file.mimetype}" is not supported`,
        },
      });
    }

    return this.aiGradingService.gradeInline(
      tenant.tenant_id,
      query.assessment_id,
      query.student_id,
      file.buffer,
      file.mimetype,
    );
  }

  // ─── B2: AI Grading Instructions ───────────────────────────────────────────

  @Post('gradebook/ai/grading-instructions')
  @RequiresPermission('gradebook.manage_ai_grading')
  @HttpCode(HttpStatus.CREATED)
  async upsertGradingInstruction(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createAiGradingInstructionSchema))
    dto: z.infer<typeof createAiGradingInstructionSchema>,
  ) {
    return this.aiGradingInstructionService.upsertInstruction(
      tenant.tenant_id,
      user.sub,
      dto,
    );
  }

  @Get('gradebook/ai/grading-instructions')
  @RequiresPermission('gradebook.view')
  async listGradingInstructions(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listInstructionsQuerySchema))
    query: z.infer<typeof listInstructionsQuerySchema>,
  ) {
    return this.aiGradingInstructionService.listInstructions(
      tenant.tenant_id,
      query,
    );
  }

  @Get('gradebook/ai/grading-instructions/:id')
  @RequiresPermission('gradebook.view')
  async getGradingInstruction(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.aiGradingInstructionService.findOneInstruction(
      tenant.tenant_id,
      id,
    );
  }

  @Post('gradebook/ai/grading-instructions/:id/approve')
  @RequiresPermission('gradebook.approve_ai_grading')
  @HttpCode(HttpStatus.OK)
  async reviewGradingInstruction(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewAiGradingInstructionSchema))
    dto: z.infer<typeof reviewAiGradingInstructionSchema>,
  ) {
    return this.aiGradingInstructionService.reviewInstruction(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
  }

  @Delete('gradebook/ai/grading-instructions/:id')
  @RequiresPermission('gradebook.manage_ai_grading')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGradingInstruction(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.aiGradingInstructionService.deleteInstruction(
      tenant.tenant_id,
      id,
      user.sub,
    );
  }

  // ─── B2: AI Grading References ─────────────────────────────────────────────

  @Post('gradebook/ai/grading-references')
  @RequiresPermission('gradebook.manage_ai_grading')
  @HttpCode(HttpStatus.CREATED)
  async createGradingReference(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createReferenceSchema))
    dto: z.infer<typeof createReferenceSchema>,
  ) {
    return this.aiGradingInstructionService.createReference(
      tenant.tenant_id,
      user.sub,
      dto,
    );
  }

  @Get('gradebook/ai/grading-references/:assessmentId')
  @RequiresPermission('gradebook.view')
  async listGradingReferences(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    return this.aiGradingInstructionService.listReferences(
      tenant.tenant_id,
      assessmentId,
    );
  }

  @Post('gradebook/ai/grading-references/:id/approve')
  @RequiresPermission('gradebook.approve_ai_grading')
  @HttpCode(HttpStatus.OK)
  async reviewGradingReference(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewAiGradingInstructionSchema))
    dto: z.infer<typeof reviewAiGradingInstructionSchema>,
  ) {
    return this.aiGradingInstructionService.reviewReference(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
  }

  @Delete('gradebook/ai/grading-references/:id')
  @RequiresPermission('gradebook.manage_ai_grading')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteGradingReference(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.aiGradingInstructionService.deleteReference(
      tenant.tenant_id,
      id,
    );
  }

  // ─── B5: Natural Language Query ────────────────────────────────────────────

  @Post('gradebook/ai/query')
  @RequiresPermission('gradebook.view_analytics')
  @HttpCode(HttpStatus.OK)
  async nlQuery(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(nlQuerySchema))
    dto: z.infer<typeof nlQuerySchema>,
  ) {
    return this.nlQueryService.processQuery(
      tenant.tenant_id,
      user.sub,
      dto.question,
    );
  }

  @Get('gradebook/ai/query/history')
  @RequiresPermission('gradebook.view_analytics')
  async getNlQueryHistory(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(nlQueryHistoryQuerySchema))
    query: z.infer<typeof nlQueryHistoryQuerySchema>,
  ) {
    return this.nlQueryService.getQueryHistory(
      tenant.tenant_id,
      user.sub,
      query.page,
      query.pageSize,
    );
  }

  // ─── B6: AI Progress Summary ──────────────────────────────────────────────

  @Get('gradebook/ai/progress-summary')
  @RequiresPermission('gradebook.view')
  async getProgressSummary(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(progressSummaryQuerySchema))
    query: z.infer<typeof progressSummaryQuerySchema>,
  ) {
    return this.aiProgressSummaryService.generateSummary(
      tenant.tenant_id,
      query.student_id,
      query.period_id,
      query.locale,
    );
  }

  // ─── D1: Grade Publishing ──────────────────────────────────────────────────

  @Get('gradebook/publishing/readiness')
  @RequiresPermission('gradebook.publish_grades_to_parents')
  async getReadinessDashboard(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(analyticsDistributionQuerySchema))
    query: z.infer<typeof analyticsDistributionQuerySchema>,
  ) {
    return this.gradePublishingService.getReadinessDashboard(
      tenant.tenant_id,
      {
        period_id: query.period_id,
        class_id: query.class_id,
      },
    );
  }

  @Post('gradebook/publishing/publish')
  @RequiresPermission('gradebook.publish_grades_to_parents')
  @HttpCode(HttpStatus.OK)
  async publishGrades(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(publishGradesSchema))
    dto: z.infer<typeof publishGradesSchema>,
  ) {
    return this.gradePublishingService.publishGrades(
      tenant.tenant_id,
      user.sub,
      dto.assessment_ids,
    );
  }

  @Post('gradebook/publishing/publish-period')
  @RequiresPermission('gradebook.publish_grades_to_parents')
  @HttpCode(HttpStatus.OK)
  async publishPeriodGrades(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(publishPeriodSchema))
    dto: z.infer<typeof publishPeriodSchema>,
  ) {
    return this.gradePublishingService.publishPeriodGrades(
      tenant.tenant_id,
      user.sub,
      dto.class_id,
      dto.period_id,
    );
  }

  // ─── D2: Progress Reports ──────────────────────────────────────────────────

  @Post('gradebook/progress-reports')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async generateProgressReports(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(generateProgressReportsSchema))
    dto: z.infer<typeof generateProgressReportsSchema>,
  ) {
    return this.progressReportService.generate(
      tenant.tenant_id,
      user.sub,
      { class_id: dto.class_id, academic_period_id: dto.academic_period_id },
    );
  }

  @Get('gradebook/progress-reports')
  @RequiresPermission('gradebook.view')
  async listProgressReports(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listProgressReportsQuerySchema))
    query: z.infer<typeof listProgressReportsQuerySchema>,
  ) {
    return this.progressReportService.list(tenant.tenant_id, query);
  }

  @Patch('gradebook/progress-reports/entries/:entryId')
  @RequiresPermission('gradebook.enter_grades')
  async updateProgressReportEntry(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('entryId', ParseUUIDPipe) entryId: string,
    @Body(new ZodValidationPipe(updateProgressReportEntrySchema))
    dto: z.infer<typeof updateProgressReportEntrySchema>,
  ) {
    return this.progressReportService.updateEntry(
      tenant.tenant_id,
      entryId,
      dto.teacher_note ?? null,
    );
  }

  @Post('gradebook/progress-reports/send')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.OK)
  async sendProgressReports(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(sendProgressReportSchema))
    dto: z.infer<typeof sendProgressReportSchema>,
  ) {
    return this.progressReportService.send(
      tenant.tenant_id,
      user.sub,
      [dto.progress_report_id],
    );
  }
}
