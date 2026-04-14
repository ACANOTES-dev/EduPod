import {
  BadRequestException,
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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { z } from 'zod';

import {
  bulkUpsertGradesSchema,
  computePeriodGradesSchema,
  copyYearGroupGradeWeightsSchema,
  createAssessmentSchema,
  createTeacherGradingWeightSchema,
  createUnlockRequestSchema,
  crossPeriodGradesQuerySchema,
  crossSubjectGradesQuerySchema,
  importProcessSchema,
  overridePeriodGradeSchema,
  propagateWeightsSchema,
  reviewConfigSchema,
  reviewUnlockRequestSchema,
  saveResultsMatrixSchema,
  transitionAssessmentStatusSchema,
  updateAssessmentSchema,
  updateTeacherGradingWeightSchema,
  upsertGradeConfigSchema,
  upsertPeriodWeightsSchema,
  upsertSubjectWeightsSchema,
  upsertYearGroupGradeWeightSchema,
  yearOverviewGradesQuerySchema,
} from '@school/shared';
import type { JwtPayload } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { apiError } from '../../common/errors/api-error';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import {
  createFileInterceptor,
  FILE_UPLOAD_PRESETS,
} from '../../common/interceptors/file-upload.interceptor';
import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { AssessmentsService } from './assessments/assessments.service';
import { BulkImportService } from './bulk-import.service';
import { ClassGradeConfigsService } from './class-grade-configs.service';
import { GradesService } from './grades.service';
import { PeriodGradeComputationService } from './grading/period-grade-computation.service';
import { ResultsMatrixService } from './results-matrix.service';
import { TeacherGradingWeightsService } from './teacher-grading-weights.service';
import { TeachingAllocationsService } from './teaching-allocations.service';
import { UnlockRequestService } from './unlock-request.service';
import { WeightConfigService } from './weight-config.service';
import { YearGroupGradeWeightsService } from './year-group-grade-weights.service';

// ─── Types ────────────────────────────────────────────────────────────────

interface UploadedFileShape {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

// ─── Query Schemas ────────────────────────────────────────────────────────

const listAssessmentsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  class_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  academic_year_id: z.string().uuid().optional(),
  academic_period_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  status: z.enum(['draft', 'open', 'closed', 'locked']).optional(),
  exclude_cancelled: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
});

const listUnlockRequestsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const listPeriodGradesQuerySchema = z.object({
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class GradebookController {
  constructor(
    private readonly classGradeConfigsService: ClassGradeConfigsService,
    private readonly assessmentsService: AssessmentsService,
    private readonly gradesService: GradesService,
    private readonly periodGradeComputationService: PeriodGradeComputationService,
    private readonly resultsMatrixService: ResultsMatrixService,
    private readonly bulkImportService: BulkImportService,
    private readonly yearGroupGradeWeightsService: YearGroupGradeWeightsService,
    private readonly teachingAllocationsService: TeachingAllocationsService,
    private readonly teacherGradingWeightsService: TeacherGradingWeightsService,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly prisma: PrismaService,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly unlockRequestService: UnlockRequestService,
    private readonly weightConfigService: WeightConfigService,
  ) {}

  // ─── Teaching Allocations ──────────────────────────────────────────────

  // GET /v1/gradebook/teaching-allocations
  @Get('gradebook/teaching-allocations')
  @RequiresPermission('gradebook.view')
  async getMyAllocations(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
  ) {
    return this.teachingAllocationsService.getMyAllocations(tenant.tenant_id, user.sub);
  }

  // GET /v1/gradebook/teaching-allocations/all
  @Get('gradebook/teaching-allocations/all')
  @RequiresPermission('gradebook.manage')
  async getAllAllocations(@CurrentTenant() tenant: { tenant_id: string }) {
    return this.teachingAllocationsService.getAllAllocations(tenant.tenant_id);
  }

  // GET /v1/gradebook/classes/:classId/allocations
  @Get('gradebook/classes/:classId/allocations')
  @RequiresPermission('gradebook.view')
  async getClassAllocations(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.teachingAllocationsService.getClassAllocations(tenant.tenant_id, classId);
  }

  // ─── Grade Configs ──────────────────────────────────────────────────────

  @Put('gradebook/classes/:classId/subjects/:subjectId/grade-config')
  @RequiresPermission('gradebook.manage')
  async upsertGradeConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
    @Body(new ZodValidationPipe(upsertGradeConfigSchema))
    dto: z.infer<typeof upsertGradeConfigSchema>,
  ) {
    return this.classGradeConfigsService.upsert(tenant.tenant_id, classId, subjectId, dto);
  }

  @Get('gradebook/classes/:classId/grade-configs')
  @RequiresPermission('gradebook.view')
  async findGradeConfigsByClass(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.classGradeConfigsService.findByClass(tenant.tenant_id, classId);
  }

  @Get('gradebook/classes/:classId/subjects/:subjectId/grade-config')
  @RequiresPermission('gradebook.view')
  async findOneGradeConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
  ) {
    return this.classGradeConfigsService.findOne(tenant.tenant_id, classId, subjectId);
  }

  @Delete('gradebook/classes/:classId/subjects/:subjectId/grade-config')
  @RequiresPermission('gradebook.manage')
  async deleteGradeConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
  ) {
    return this.classGradeConfigsService.delete(tenant.tenant_id, classId, subjectId);
  }

  // ─── Assessments ────────────────────────────────────────────────────────

  @Post('gradebook/assessments')
  @RequiresPermission('gradebook.enter_grades')
  @HttpCode(HttpStatus.CREATED)
  async createAssessment(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createAssessmentSchema))
    dto: z.infer<typeof createAssessmentSchema>,
  ) {
    return this.assessmentsService.create(tenant.tenant_id, user.sub, dto);
  }

  @Get('gradebook/assessments')
  @RequiresPermission('gradebook.view')
  async findAllAssessments(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listAssessmentsQuerySchema))
    query: z.infer<typeof listAssessmentsQuerySchema>,
  ) {
    const { permissions, staffProfileId } = await this.getUserContext(user, tenant.tenant_id);
    const hasManage = permissions.includes('gradebook.manage');

    // If user has enter_grades but NOT manage, filter to their assigned classes
    let assignedClassIds: string[] | undefined;
    if (!hasManage && staffProfileId) {
      const classStaffRows = await this.classesReadFacade.findClassesByStaff(
        tenant.tenant_id,
        staffProfileId,
      );
      assignedClassIds = classStaffRows.map((a) => a.class_id);
    }

    return this.assessmentsService.findAll(tenant.tenant_id, {
      ...query,
      assignedClassIds,
    });
  }

  @Get('gradebook/assessments/:id')
  @RequiresPermission('gradebook.view')
  async findOneAssessment(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessmentsService.findOne(tenant.tenant_id, id);
  }

  @Patch('gradebook/assessments/:id')
  @RequiresPermission('gradebook.enter_grades')
  async updateAssessment(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAssessmentSchema))
    dto: z.infer<typeof updateAssessmentSchema>,
  ) {
    return this.assessmentsService.update(tenant.tenant_id, id, dto);
  }

  @Patch('gradebook/assessments/:id/status')
  @RequiresPermission('gradebook.enter_grades')
  async transitionAssessmentStatus(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transitionAssessmentStatusSchema))
    dto: z.infer<typeof transitionAssessmentStatusSchema>,
  ) {
    return this.assessmentsService.transitionStatus(tenant.tenant_id, id, dto);
  }

  // POST /v1/gradebook/assessments/:id/duplicate
  @Post('gradebook/assessments/:id/duplicate')
  @RequiresPermission('gradebook.enter_grades')
  @HttpCode(HttpStatus.CREATED)
  async duplicateAssessment(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessmentsService.duplicate(tenant.tenant_id, id);
  }

  @Delete('gradebook/assessments/:id')
  @RequiresPermission('gradebook.manage')
  async deleteAssessment(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.assessmentsService.delete(tenant.tenant_id, id);
  }

  // ─── Grades ─────────────────────────────────────────────────────────────

  @Put('gradebook/assessments/:assessmentId/grades')
  @RequiresPermission('gradebook.enter_grades')
  async bulkUpsertGrades(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
    @Body(new ZodValidationPipe(bulkUpsertGradesSchema))
    dto: z.infer<typeof bulkUpsertGradesSchema>,
  ) {
    return this.gradesService.bulkUpsert(tenant.tenant_id, assessmentId, user.sub, dto);
  }

  @Get('gradebook/assessments/:assessmentId/grades')
  @RequiresPermission('gradebook.view')
  async findGradesByAssessment(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('assessmentId', ParseUUIDPipe) assessmentId: string,
  ) {
    return this.gradesService.findByAssessment(tenant.tenant_id, assessmentId);
  }

  // ─── Period Grades ──────────────────────────────────────────────────────

  @Post('gradebook/period-grades/compute')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async computePeriodGrades(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(computePeriodGradesSchema))
    dto: z.infer<typeof computePeriodGradesSchema>,
  ) {
    return this.periodGradeComputationService.compute(
      tenant.tenant_id,
      dto.class_id,
      dto.subject_id,
      dto.academic_period_id,
    );
  }

  @Get('gradebook/period-grades')
  @RequiresPermission('gradebook.view')
  async findPeriodGrades(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listPeriodGradesQuerySchema))
    query: z.infer<typeof listPeriodGradesQuerySchema>,
  ) {
    const data = await this.prisma.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenant.tenant_id,
        class_id: query.class_id,
        subject_id: query.subject_id,
        academic_period_id: query.academic_period_id,
      },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
          },
        },
      },
      orderBy: { student: { last_name: 'asc' } },
    });

    return { data };
  }

  @Get('gradebook/students/:studentId/period-grades')
  @RequiresPermission('gradebook.view')
  async findStudentPeriodGrades(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    const data = await this.prisma.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenant.tenant_id,
        student_id: studentId,
      },
      include: {
        subject: {
          select: { id: true, name: true, code: true },
        },
        academic_period: {
          select: { id: true, name: true },
        },
        class_entity: {
          select: { id: true, name: true },
        },
      },
      orderBy: [{ academic_period: { start_date: 'desc' } }, { subject: { name: 'asc' } }],
    });

    return { data };
  }

  @Post('gradebook/period-grades/:id/override')
  @RequiresPermission('gradebook.override_final_grade')
  async overridePeriodGrade(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(overridePeriodGradeSchema))
    dto: z.infer<typeof overridePeriodGradeSchema>,
  ) {
    const snapshot = await this.prisma.periodGradeSnapshot.findFirst({
      where: { id, tenant_id: tenant.tenant_id },
      select: { id: true },
    });

    if (!snapshot) {
      throw new NotFoundException(
        apiError('PERIOD_GRADE_NOT_FOUND', `Period grade snapshot with id "${id}" not found`),
      );
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenant.tenant_id });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as typeof this.prisma;
      return db.periodGradeSnapshot.update({
        where: { id },
        data: {
          overridden_value: dto.overridden_value,
          override_reason: dto.override_reason,
          override_actor_user_id: user.sub,
        },
      });
    });
  }

  // ─── Cross-Aggregation (All Subjects / All Periods) ─────────────────────

  // GET /v1/gradebook/period-grades/cross-subject
  @Get('gradebook/period-grades/cross-subject')
  @RequiresPermission('gradebook.view')
  async getCrossSubjectGrades(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(crossSubjectGradesQuerySchema))
    query: z.infer<typeof crossSubjectGradesQuerySchema>,
  ) {
    return this.periodGradeComputationService.computeCrossSubject(
      tenant.tenant_id,
      query.class_id,
      query.academic_period_id,
    );
  }

  // GET /v1/gradebook/period-grades/cross-period
  @Get('gradebook/period-grades/cross-period')
  @RequiresPermission('gradebook.view')
  async getCrossPeriodGrades(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(crossPeriodGradesQuerySchema))
    query: z.infer<typeof crossPeriodGradesQuerySchema>,
  ) {
    return this.periodGradeComputationService.computeCrossPeriod(
      tenant.tenant_id,
      query.class_id,
      query.subject_id,
      query.academic_year_id,
    );
  }

  // GET /v1/gradebook/period-grades/year-overview
  @Get('gradebook/period-grades/year-overview')
  @RequiresPermission('gradebook.view')
  async getYearOverviewGrades(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(yearOverviewGradesQuerySchema))
    query: z.infer<typeof yearOverviewGradesQuerySchema>,
  ) {
    return this.periodGradeComputationService.computeYearOverview(
      tenant.tenant_id,
      query.class_id,
      query.academic_year_id,
    );
  }

  // ─── Results Matrix ────────────────────────────────────────────────────

  @Get('gradebook/classes/:classId/results-matrix')
  @RequiresPermission('gradebook.view')
  async getResultsMatrix(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Query('academic_period_id') academicPeriodId?: string,
  ) {
    return this.resultsMatrixService.getMatrix(tenant.tenant_id, classId, academicPeriodId);
  }

  @Put('gradebook/classes/:classId/results-matrix')
  @RequiresPermission('gradebook.enter_grades')
  async saveResultsMatrix(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('classId', ParseUUIDPipe) classId: string,
    @Body(new ZodValidationPipe(saveResultsMatrixSchema))
    dto: z.infer<typeof saveResultsMatrixSchema>,
  ) {
    return this.resultsMatrixService.saveMatrix(tenant.tenant_id, classId, user.sub, dto.grades);
  }

  // ─── Year Group Grade Weights ───────────────────────────────────────────

  @Put('gradebook/year-group-weights')
  @RequiresPermission('gradebook.manage')
  async upsertYearGroupGradeWeight(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(upsertYearGroupGradeWeightSchema))
    dto: z.infer<typeof upsertYearGroupGradeWeightSchema>,
  ) {
    return this.yearGroupGradeWeightsService.upsert(tenant.tenant_id, dto);
  }

  @Get('gradebook/year-group-weights/:yearGroupId')
  @RequiresPermission('gradebook.view')
  async findYearGroupGradeWeights(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('yearGroupId', ParseUUIDPipe) yearGroupId: string,
  ) {
    return this.yearGroupGradeWeightsService.findByYearGroup(tenant.tenant_id, yearGroupId);
  }

  @Post('gradebook/year-group-weights/copy')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.OK)
  async copyYearGroupGradeWeights(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(copyYearGroupGradeWeightsSchema))
    dto: z.infer<typeof copyYearGroupGradeWeightsSchema>,
  ) {
    return this.yearGroupGradeWeightsService.copyFromYearGroup(tenant.tenant_id, dto);
  }

  // ─── Teacher Grading Weights ──────────────────────────────────────────

  // POST /v1/gradebook/teacher-grading-weights
  @Post('gradebook/teacher-grading-weights')
  @RequiresPermission('gradebook.manage_own_config')
  @HttpCode(HttpStatus.CREATED)
  async createTeacherWeight(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createTeacherGradingWeightSchema))
    dto: z.infer<typeof createTeacherGradingWeightSchema>,
  ) {
    return this.teacherGradingWeightsService.create(tenant.tenant_id, user.sub, dto);
  }

  // GET /v1/gradebook/teacher-grading-weights
  @Get('gradebook/teacher-grading-weights')
  @RequiresPermission('gradebook.view')
  async listTeacherWeights(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query('subject_id') subjectId?: string,
    @Query('year_group_id') yearGroupId?: string,
    @Query('academic_period_id') periodId?: string,
    @Query('status') status?: string,
  ) {
    // Check if user has gradebook.manage — if so, they see all
    const permissions = user.membership_id
      ? await this.permissionCacheService.getPermissions(user.membership_id)
      : [];
    const isLeadership = permissions.includes('gradebook.manage');
    return this.teacherGradingWeightsService.findAll(
      tenant.tenant_id,
      isLeadership ? null : user.sub,
      { subject_id: subjectId, year_group_id: yearGroupId, academic_period_id: periodId, status },
    );
  }

  // GET /v1/gradebook/teacher-grading-weights/:id
  @Get('gradebook/teacher-grading-weights/:id')
  @RequiresPermission('gradebook.view')
  async getTeacherWeight(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.teacherGradingWeightsService.findOne(tenant.tenant_id, id);
  }

  // PATCH /v1/gradebook/teacher-grading-weights/:id
  @Patch('gradebook/teacher-grading-weights/:id')
  @RequiresPermission('gradebook.manage_own_config')
  async updateTeacherWeight(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTeacherGradingWeightSchema))
    dto: z.infer<typeof updateTeacherGradingWeightSchema>,
  ) {
    return this.teacherGradingWeightsService.update(tenant.tenant_id, id, user.sub, dto);
  }

  // DELETE /v1/gradebook/teacher-grading-weights/:id
  @Delete('gradebook/teacher-grading-weights/:id')
  @RequiresPermission('gradebook.manage_own_config')
  async deleteTeacherWeight(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.teacherGradingWeightsService.delete(tenant.tenant_id, id, user.sub);
  }

  // POST /v1/gradebook/teacher-grading-weights/:id/submit
  @Post('gradebook/teacher-grading-weights/:id/submit')
  @RequiresPermission('gradebook.manage_own_config')
  async submitTeacherWeight(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.teacherGradingWeightsService.submitForApproval(tenant.tenant_id, id, user.sub);
  }

  // POST /v1/gradebook/teacher-grading-weights/:id/review
  @Post('gradebook/teacher-grading-weights/:id/review')
  @RequiresPermission('gradebook.approve_config')
  async reviewTeacherWeight(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewConfigSchema))
    dto: z.infer<typeof reviewConfigSchema>,
  ) {
    return this.teacherGradingWeightsService.review(tenant.tenant_id, id, user.sub, dto);
  }

  // ─── Unlock Requests ──────────────────────────────────────────────────

  // POST /v1/gradebook/assessments/:id/unlock-request
  @Post('gradebook/assessments/:id/unlock-request')
  @RequiresPermission('gradebook.request_unlock')
  @HttpCode(HttpStatus.CREATED)
  async createUnlockRequest(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createUnlockRequestSchema))
    dto: z.infer<typeof createUnlockRequestSchema>,
  ) {
    return this.unlockRequestService.create(tenant.tenant_id, id, user.sub, dto.reason);
  }

  // GET /v1/gradebook/unlock-requests
  @Get('gradebook/unlock-requests')
  @RequiresPermission('gradebook.approve_unlock')
  async listPendingUnlockRequests(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listUnlockRequestsQuerySchema))
    query: z.infer<typeof listUnlockRequestsQuerySchema>,
  ) {
    return this.unlockRequestService.findPending(tenant.tenant_id, query);
  }

  // GET /v1/gradebook/assessments/:id/unlock-requests
  @Get('gradebook/assessments/:id/unlock-requests')
  @RequiresPermission('gradebook.view')
  async listAssessmentUnlockRequests(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.unlockRequestService.findByAssessment(tenant.tenant_id, id);
  }

  // POST /v1/gradebook/unlock-requests/:id/review
  @Post('gradebook/unlock-requests/:id/review')
  @RequiresPermission('gradebook.approve_unlock')
  async reviewUnlockRequest(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reviewUnlockRequestSchema))
    dto: z.infer<typeof reviewUnlockRequestSchema>,
  ) {
    return this.unlockRequestService.review(tenant.tenant_id, id, user.sub, dto);
  }

  // ─── Import ─────────────────────────────────────────────────────────────

  @Get('gradebook/import/template')
  @RequiresPermission('gradebook.manage')
  async downloadImportTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query('class_id') classId?: string,
    @Query('academic_period_id') periodId?: string,
  ) {
    return this.bulkImportService.generateTemplate(tenant.tenant_id, classId, periodId);
  }

  @Post('gradebook/import/validate')
  @RequiresPermission('gradebook.manage')
  @UseInterceptors(createFileInterceptor({ allowedMimes: FILE_UPLOAD_PRESETS.SPREADSHEET }))
  async validateImport(
    @CurrentTenant() tenant: { tenant_id: string },
    @UploadedFile() file: UploadedFileShape | undefined,
  ) {
    if (!file) {
      throw new BadRequestException(apiError('EMPTY_FILE', 'No file uploaded'));
    }

    // Support both CSV and XLSX
    const ext = (file.originalname ?? '').split('.').pop()?.toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      return this.bulkImportService.validateXlsx(tenant.tenant_id, file.buffer);
    }
    return this.bulkImportService.validateCsv(tenant.tenant_id, file.buffer);
  }

  @Post('gradebook/import/process')
  @RequiresPermission('gradebook.manage')
  @HttpCode(HttpStatus.CREATED)
  async processImport(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(importProcessSchema))
    dto: z.infer<typeof importProcessSchema>,
  ) {
    return this.bulkImportService.processImport(tenant.tenant_id, user.sub, dto.rows);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  /**
   * Resolve the current user's permissions and staff profile ID.
   */
  private async getUserContext(
    user: JwtPayload,
    tenantId: string,
  ): Promise<{ permissions: string[]; staffProfileId?: string }> {
    const permissions = user.membership_id
      ? await this.permissionCacheService.getPermissions(user.membership_id)
      : [];

    const staffProfile = await this.staffProfileReadFacade.findByUserId(tenantId, user.sub);

    return {
      permissions,
      staffProfileId: staffProfile?.id,
    };
  }

  // ─── Weight Configuration (cross-subject / cross-period) ──────────────────

  // GET /v1/gradebook/weight-config/subject-weights?academic_year_id=...&academic_period_id=...
  @Get('gradebook/weight-config/subject-weights')
  @RequiresPermission('gradebook.manage')
  async getSubjectWeights(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query('academic_year_id', ParseUUIDPipe) academicYearId: string,
    @Query('academic_period_id') academicPeriodId?: string,
  ) {
    return this.weightConfigService.getSubjectWeights(
      tenant.tenant_id,
      academicYearId,
      academicPeriodId,
    );
  }

  // PUT /v1/gradebook/weight-config/subject-weights
  @Put('gradebook/weight-config/subject-weights')
  @RequiresPermission('gradebook.manage')
  async upsertSubjectWeights(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(upsertSubjectWeightsSchema))
    dto: z.infer<typeof upsertSubjectWeightsSchema>,
  ) {
    return this.weightConfigService.upsertSubjectWeights(tenant.tenant_id, dto);
  }

  // GET /v1/gradebook/weight-config/period-weights?academic_year_id=...
  @Get('gradebook/weight-config/period-weights')
  @RequiresPermission('gradebook.manage')
  async getPeriodWeights(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query('academic_year_id', ParseUUIDPipe) academicYearId: string,
  ) {
    return this.weightConfigService.getPeriodWeights(tenant.tenant_id, academicYearId);
  }

  // PUT /v1/gradebook/weight-config/period-weights
  @Put('gradebook/weight-config/period-weights')
  @RequiresPermission('gradebook.manage')
  async upsertPeriodWeights(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(upsertPeriodWeightsSchema))
    dto: z.infer<typeof upsertPeriodWeightsSchema>,
  ) {
    return this.weightConfigService.upsertPeriodWeights(tenant.tenant_id, dto);
  }

  // POST /v1/gradebook/weight-config/subject-weights/propagate
  @Post('gradebook/weight-config/subject-weights/propagate')
  @RequiresPermission('gradebook.manage')
  async propagateSubjectWeights(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(propagateWeightsSchema))
    dto: z.infer<typeof propagateWeightsSchema>,
  ) {
    return this.weightConfigService.propagateSubjectWeightsToClasses(
      tenant.tenant_id,
      dto.academic_year_id,
      dto.academic_period_id ?? '',
      dto.year_group_id,
    );
  }

  // POST /v1/gradebook/weight-config/period-weights/propagate
  @Post('gradebook/weight-config/period-weights/propagate')
  @RequiresPermission('gradebook.manage')
  async propagatePeriodWeights(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(propagateWeightsSchema))
    dto: z.infer<typeof propagateWeightsSchema>,
  ) {
    return this.weightConfigService.propagatePeriodWeightsToClasses(
      tenant.tenant_id,
      dto.academic_year_id,
      dto.year_group_id,
    );
  }
}
