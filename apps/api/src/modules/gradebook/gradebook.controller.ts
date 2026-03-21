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
import { FileInterceptor } from '@nestjs/platform-express';
import {
  upsertGradeConfigSchema,
  createAssessmentSchema,
  updateAssessmentSchema,
  transitionAssessmentStatusSchema,
  bulkUpsertGradesSchema,
  computePeriodGradesSchema,
  overridePeriodGradeSchema,
  importProcessSchema,
} from '@school/shared';
import type { JwtPayload } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { PrismaService } from '../prisma/prisma.service';

import { AssessmentsService } from './assessments.service';
import { BulkImportService } from './bulk-import.service';
import { ClassGradeConfigsService } from './class-grade-configs.service';
import { GradesService } from './grades.service';
import { PeriodGradeComputationService } from './period-grade-computation.service';

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
  academic_period_id: z.string().uuid().optional(),
  category_id: z.string().uuid().optional(),
  status: z.enum(['draft', 'open', 'closed', 'locked']).optional(),
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
    private readonly bulkImportService: BulkImportService,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly prisma: PrismaService,
  ) {}

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
    return this.classGradeConfigsService.upsert(
      tenant.tenant_id,
      classId,
      subjectId,
      dto,
    );
  }

  @Get('gradebook/classes/:classId/grade-configs')
  @RequiresPermission('gradebook.view')
  async findGradeConfigsByClass(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
  ) {
    return this.classGradeConfigsService.findByClass(
      tenant.tenant_id,
      classId,
    );
  }

  @Get('gradebook/classes/:classId/subjects/:subjectId/grade-config')
  @RequiresPermission('gradebook.view')
  async findOneGradeConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
  ) {
    return this.classGradeConfigsService.findOne(
      tenant.tenant_id,
      classId,
      subjectId,
    );
  }

  @Delete('gradebook/classes/:classId/subjects/:subjectId/grade-config')
  @RequiresPermission('gradebook.manage')
  async deleteGradeConfig(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('subjectId', ParseUUIDPipe) subjectId: string,
  ) {
    return this.classGradeConfigsService.delete(
      tenant.tenant_id,
      classId,
      subjectId,
    );
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
    const { permissions, staffProfileId } = await this.getUserContext(
      user,
      tenant.tenant_id,
    );
    const hasManage = permissions.includes('gradebook.manage');

    // If user has enter_grades but NOT manage, filter to their assigned classes
    let assignedClassIds: string[] | undefined;
    if (!hasManage && staffProfileId) {
      const assignments = await this.prisma.classStaff.findMany({
        where: { staff_profile_id: staffProfileId, tenant_id: tenant.tenant_id },
        select: { class_id: true },
      });
      assignedClassIds = assignments.map((a) => a.class_id);
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
    return this.gradesService.bulkUpsert(
      tenant.tenant_id,
      assessmentId,
      user.sub,
      dto,
    );
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
      orderBy: [
        { academic_period: { start_date: 'desc' } },
        { subject: { name: 'asc' } },
      ],
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
      throw new NotFoundException({
        code: 'PERIOD_GRADE_NOT_FOUND',
        message: `Period grade snapshot with id "${id}" not found`,
      });
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

  // ─── Import ─────────────────────────────────────────────────────────────

  @Post('gradebook/import/validate')
  @RequiresPermission('gradebook.manage')
  @UseInterceptors(FileInterceptor('file'))
  async validateImport(
    @CurrentTenant() tenant: { tenant_id: string },
    @UploadedFile() file: UploadedFileShape | undefined,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'EMPTY_FILE',
        message: 'No file uploaded',
      });
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
    return this.bulkImportService.processImport(
      tenant.tenant_id,
      user.sub,
      dto.rows,
    );
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

    const staffProfile = await this.prisma.staffProfile.findFirst({
      where: { user_id: user.sub, tenant_id: tenantId },
      select: { id: true },
    });

    return {
      permissions,
      staffProfileId: staffProfile?.id,
    };
  }
}
