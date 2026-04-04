import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import {
  applyCurveSchema,
  bulkImportStandardsSchema,
  computeGpaSchema,
  createAssessmentFromTemplateSchema,
  createAssessmentTemplateSchema,
  createCompetencyScaleSchema,
  createCurriculumStandardSchema,
  createRubricTemplateSchema,
  listAssessmentTemplatesQuerySchema,
  listRubricTemplatesQuerySchema,
  listStandardsQuerySchema,
  mapAssessmentStandardsSchema,
  saveRubricGradesSchema,
  setDefaultGradeSchema,
  undoCurveSchema,
  updateAssessmentTemplateSchema,
  updateCompetencyScaleSchema,
  updateRubricTemplateSchema,
} from '@school/shared';
import type { JwtPayload } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { apiError } from '../../common/errors/api-error';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';

import { AssessmentTemplateService } from './assessments/assessment-template.service';
import { GradeCurveService } from './assessments/grade-curve.service';
import { GradesService } from './grades.service';
import { CompetencyScaleService } from './grading/competency-scale.service';
import { GpaService } from './grading/gpa.service';
import { RubricService } from './grading/rubric.service';
import { StandardsService } from './grading/standards.service';

// ─── Query Schemas ────────────────────────────────────────────────────────

const studentGpaQuerySchema = z.object({
  academic_period_id: z.string().uuid().optional(),
});

const studentCompetencyQuerySchema = z.object({
  academic_period_id: z.string().uuid().optional(),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class GradebookAdvancedController {
  constructor(
    private readonly rubricService: RubricService,
    private readonly standardsService: StandardsService,
    private readonly competencyScaleService: CompetencyScaleService,
    private readonly gpaService: GpaService,
    private readonly gradeCurveService: GradeCurveService,
    private readonly assessmentTemplateService: AssessmentTemplateService,
    private readonly gradesService: GradesService,
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  // ─── C1: Rubric Templates ────────────────────────────────────────────────

  @Post('gradebook/rubric-templates')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async createRubricTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createRubricTemplateSchema))
    dto: z.infer<typeof createRubricTemplateSchema>,
  ) {
    return this.rubricService.createTemplate(tenant.tenant_id, user.sub, dto);
  }

  @Get('gradebook/rubric-templates')
  @RequiresPermission('gradebook.view')
  async listRubricTemplates(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listRubricTemplatesQuerySchema))
    query: z.infer<typeof listRubricTemplatesQuerySchema>,
  ) {
    return this.rubricService.listTemplates(tenant.tenant_id, query);
  }

  @Get('gradebook/rubric-templates/:id')
  @RequiresPermission('gradebook.view')
  async getRubricTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.rubricService.getTemplate(tenant.tenant_id, id);
  }

  @Patch('gradebook/rubric-templates/:id')
  @RequiresPermission('gradebook.manage')
  async updateRubricTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateRubricTemplateSchema))
    dto: z.infer<typeof updateRubricTemplateSchema>,
  ) {
    return this.rubricService.updateTemplate(tenant.tenant_id, id, dto);
  }

  @Delete('gradebook/rubric-templates/:id')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRubricTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.rubricService.deleteTemplate(tenant.tenant_id, id);
  }

  @Post('gradebook/grades/:gradeId/rubric-grades')
  @RequiresPermission('gradebook.enter_grades')
  @HttpCode(HttpStatus.CREATED)
  async saveRubricGrades(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('gradeId', ParseUUIDPipe) gradeId: string,
    @Body(new ZodValidationPipe(saveRubricGradesSchema))
    dto: z.infer<typeof saveRubricGradesSchema>,
  ) {
    return this.rubricService.saveRubricGrades(tenant.tenant_id, gradeId, dto);
  }

  // ─── C2: Curriculum Standards ────────────────────────────────────────────

  @Post('gradebook/curriculum-standards')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async createCurriculumStandard(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createCurriculumStandardSchema))
    dto: z.infer<typeof createCurriculumStandardSchema>,
  ) {
    return this.standardsService.createStandard(tenant.tenant_id, dto);
  }

  @Get('gradebook/curriculum-standards')
  @RequiresPermission('gradebook.view')
  async listCurriculumStandards(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listStandardsQuerySchema))
    query: z.infer<typeof listStandardsQuerySchema>,
  ) {
    return this.standardsService.listStandards(tenant.tenant_id, query);
  }

  @Delete('gradebook/curriculum-standards/:id')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCurriculumStandard(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.standardsService.deleteStandard(tenant.tenant_id, id);
  }

  @Post('gradebook/curriculum-standards/import')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async bulkImportStandards(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkImportStandardsSchema))
    dto: z.infer<typeof bulkImportStandardsSchema>,
  ) {
    return this.standardsService.bulkImportStandards(tenant.tenant_id, dto);
  }

  @Put('gradebook/assessments/:id/standards')
  @RequiresPermission('gradebook.enter_grades')
  async mapAssessmentStandards(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(mapAssessmentStandardsSchema))
    dto: z.infer<typeof mapAssessmentStandardsSchema>,
  ) {
    return this.standardsService.mapAssessmentStandards(tenant.tenant_id, id, dto);
  }

  @Get('gradebook/students/:studentId/competency-snapshots')
  @RequiresPermission('gradebook.view')
  async getCompetencySnapshots(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(studentCompetencyQuerySchema))
    query: z.infer<typeof studentCompetencyQuerySchema>,
  ) {
    return this.standardsService.getCompetencySnapshots(
      tenant.tenant_id,
      studentId,
      query.academic_period_id,
    );
  }

  // ─── C2: Competency Scales ───────────────────────────────────────────────

  @Post('gradebook/competency-scales')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async createCompetencyScale(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createCompetencyScaleSchema))
    dto: z.infer<typeof createCompetencyScaleSchema>,
  ) {
    return this.competencyScaleService.create(tenant.tenant_id, dto);
  }

  @Get('gradebook/competency-scales')
  @RequiresPermission('gradebook.view')
  async listCompetencyScales(@CurrentTenant() tenant: { tenant_id: string }) {
    return this.competencyScaleService.list(tenant.tenant_id);
  }

  @Get('gradebook/competency-scales/:id')
  @RequiresPermission('gradebook.view')
  async getCompetencyScale(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.competencyScaleService.findOne(tenant.tenant_id, id);
  }

  @Patch('gradebook/competency-scales/:id')
  @RequiresPermission('gradebook.manage')
  async updateCompetencyScale(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCompetencyScaleSchema))
    dto: z.infer<typeof updateCompetencyScaleSchema>,
  ) {
    return this.competencyScaleService.update(tenant.tenant_id, id, dto);
  }

  @Delete('gradebook/competency-scales/:id')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCompetencyScale(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.competencyScaleService.delete(tenant.tenant_id, id);
  }

  // ─── C3: GPA ─────────────────────────────────────────────────────────────

  @Get('gradebook/students/:studentId/gpa')
  @RequiresPermission('gradebook.view')
  async getStudentGpa(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(studentGpaQuerySchema))
    query: z.infer<typeof studentGpaQuerySchema>,
  ) {
    if (query.academic_period_id) {
      const snapshot = await this.gpaService.getGpaSnapshot(
        tenant.tenant_id,
        studentId,
        query.academic_period_id,
      );
      return snapshot;
    }

    return this.gpaService.getCumulativeGpa(tenant.tenant_id, studentId);
  }

  @Post('gradebook/period-grades/compute-gpa')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async computeGpa(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(computeGpaSchema))
    dto: z.infer<typeof computeGpaSchema>,
  ) {
    return this.gpaService.computeGpa(tenant.tenant_id, dto.student_id, dto.academic_period_id);
  }

  // ─── C5: Grade Curve ─────────────────────────────────────────────────────

  @Post('gradebook/assessments/:id/curve')
  @RequiresPermission('gradebook.apply_curve')
  @HttpCode(HttpStatus.CREATED)
  async applyCurve(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(applyCurveSchema))
    dto: z.infer<typeof applyCurveSchema>,
  ) {
    return this.gradeCurveService.applyCurve(tenant.tenant_id, id, user.sub, dto);
  }

  @Delete('gradebook/assessments/:id/curve')
  @RequiresPermission('gradebook.apply_curve')
  @HttpCode(HttpStatus.OK)
  async undoCurve(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(undoCurveSchema))
    dto: z.infer<typeof undoCurveSchema>,
  ) {
    return this.gradeCurveService.undoCurve(tenant.tenant_id, id, dto);
  }

  @Get('gradebook/assessments/:id/curve-history')
  @RequiresPermission('gradebook.view')
  async getCurveHistory(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.gradeCurveService.getCurveHistory(tenant.tenant_id, id);
  }

  // ─── C6: Assessment Templates ─────────────────────────────────────────────

  @Post('gradebook/assessment-templates')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async createAssessmentTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createAssessmentTemplateSchema))
    dto: z.infer<typeof createAssessmentTemplateSchema>,
  ) {
    return this.assessmentTemplateService.create(tenant.tenant_id, user.sub, dto);
  }

  @Get('gradebook/assessment-templates')
  @RequiresPermission('gradebook.view')
  async listAssessmentTemplates(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listAssessmentTemplatesQuerySchema))
    query: z.infer<typeof listAssessmentTemplatesQuerySchema>,
  ) {
    return this.assessmentTemplateService.list(tenant.tenant_id, query);
  }

  @Get('gradebook/assessment-templates/:id')
  @RequiresPermission('gradebook.view')
  async getAssessmentTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessmentTemplateService.findOne(tenant.tenant_id, id);
  }

  @Patch('gradebook/assessment-templates/:id')
  @RequiresPermission('gradebook.manage')
  async updateAssessmentTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAssessmentTemplateSchema))
    dto: z.infer<typeof updateAssessmentTemplateSchema>,
  ) {
    return this.assessmentTemplateService.update(tenant.tenant_id, id, dto);
  }

  @Delete('gradebook/assessment-templates/:id')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAssessmentTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.assessmentTemplateService.delete(tenant.tenant_id, id);
  }

  @Post('gradebook/assessment-templates/:id/create-assessment')
  @RequiresPermission('gradebook.enter_grades')
  @HttpCode(HttpStatus.CREATED)
  async createAssessmentFromTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createAssessmentFromTemplateSchema))
    dto: z.infer<typeof createAssessmentFromTemplateSchema>,
  ) {
    return this.assessmentTemplateService.createAssessmentFromTemplate(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
  }

  // ─── C7: Batch Default Grades ─────────────────────────────────────────────

  @Post('gradebook/assessments/:id/default-grade')
  @RequiresPermission('gradebook.enter_grades')
  @HttpCode(HttpStatus.CREATED)
  async setDefaultGrade(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) assessmentId: string,
    @Body(new ZodValidationPipe(setDefaultGradeSchema))
    dto: z.infer<typeof setDefaultGradeSchema>,
  ) {
    // Find assessment with class and max_score
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, tenant_id: tenant.tenant_id },
      select: { id: true, class_id: true, max_score: true, status: true },
    });

    if (!assessment) {
      throw new NotFoundException(
        apiError('ASSESSMENT_NOT_FOUND', `Assessment with id "${assessmentId}" not found`),
      );
    }

    if (dto.default_score > Number(assessment.max_score)) {
      throw new NotFoundException(
        apiError(
          'SCORE_EXCEEDS_MAX',
          `Default score ${dto.default_score} exceeds max score ${assessment.max_score}`,
        ),
      );
    }

    // Load enrolled students
    const enrolledStudentIds = await this.classesReadFacade.findEnrolledStudentIds(tenant.tenant_id, assessment.class_id);
    const enrolments = enrolledStudentIds.map((id) => ({ student_id: id }));

    if (enrolments.length === 0) {
      return { filled: 0, message: 'No enrolled students found' };
    }

    // Load existing grades
    const existingGrades = await this.prisma.grade.findMany({
      where: {
        tenant_id: tenant.tenant_id,
        assessment_id: assessmentId,
        raw_score: { not: null },
      },
      select: { student_id: true },
    });

    const alreadyGradedIds = new Set(existingGrades.map((g) => g.student_id));

    // Only fill students without a grade
    const studentsToFill = enrolments
      .map((e) => e.student_id)
      .filter((id) => !alreadyGradedIds.has(id));

    if (studentsToFill.length === 0) {
      return { filled: 0, message: 'All students already have grades' };
    }

    // Use the bulk upsert through grades service
    const upsertResult = await this.gradesService.bulkUpsert(
      tenant.tenant_id,
      assessmentId,
      user.sub,
      {
        grades: studentsToFill.map((studentId) => ({
          student_id: studentId,
          raw_score: dto.default_score,
          is_missing: false,
          comment: null,
        })),
      },
    );

    return {
      filled: (upsertResult.data as unknown[]).length,
      data: upsertResult.data,
    };
  }
}
