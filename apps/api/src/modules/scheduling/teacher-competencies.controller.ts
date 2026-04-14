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

import {
  bulkCreateTeacherCompetenciesSchema,
  copyCompetenciesToYearsSchema,
  createTeacherCompetencySchema,
  listTeacherCompetenciesQuerySchema,
  updateTeacherCompetencySchema,
} from '@school/shared';
import type {
  BulkCreateTeacherCompetenciesDto,
  CopyCompetenciesToYearsDto,
  CreateTeacherCompetencyDto,
  ListTeacherCompetenciesQuery,
  UpdateTeacherCompetencyDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { TeacherCompetenciesService } from './teacher-competencies.service';

const listBySubjectQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
});

const simpleAcademicYearQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
});

const copyBodySchema = z.object({
  source_academic_year_id: z.string().uuid(),
  target_academic_year_id: z.string().uuid(),
});

@Controller('v1/scheduling/teacher-competencies')
@UseGuards(AuthGuard, PermissionGuard)
export class TeacherCompetenciesController {
  constructor(private readonly service: TeacherCompetenciesService) {}

  // GET /v1/scheduling/teacher-competencies
  @Get()
  @RequiresPermission('schedule.configure_requirements')
  async list(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listTeacherCompetenciesQuerySchema))
    query: ListTeacherCompetenciesQuery,
  ) {
    return this.service.list(tenant.tenant_id, query);
  }

  // GET /v1/scheduling/teacher-competencies/coverage
  @Get('coverage')
  @RequiresPermission('schedule.configure_requirements')
  async getCoverage(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(simpleAcademicYearQuerySchema))
    query: z.infer<typeof simpleAcademicYearQuerySchema>,
  ) {
    return this.service.getCoverage(tenant.tenant_id, query.academic_year_id);
  }

  // GET /v1/scheduling/teacher-competencies/by-teacher/:staffProfileId
  @Get('by-teacher/:staffProfileId')
  @RequiresPermission('schedule.configure_requirements')
  async listByTeacher(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('staffProfileId', ParseUUIDPipe) staffProfileId: string,
    @Query(new ZodValidationPipe(simpleAcademicYearQuerySchema))
    query: z.infer<typeof simpleAcademicYearQuerySchema>,
  ) {
    return this.service.listByTeacher(tenant.tenant_id, query.academic_year_id, staffProfileId);
  }

  // GET /v1/scheduling/teacher-competencies/by-subject
  @Get('by-subject')
  @RequiresPermission('schedule.configure_requirements')
  async listBySubject(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listBySubjectQuerySchema))
    query: z.infer<typeof listBySubjectQuerySchema>,
  ) {
    return this.service.listBySubjectYear(
      tenant.tenant_id,
      query.academic_year_id,
      query.subject_id,
      query.year_group_id,
    );
  }

  // POST /v1/scheduling/teacher-competencies
  @Post()
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createTeacherCompetencySchema))
    dto: CreateTeacherCompetencyDto,
  ) {
    return this.service.create(tenant.tenant_id, dto);
  }

  // POST /v1/scheduling/teacher-competencies/bulk
  @Post('bulk')
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.CREATED)
  async bulkCreate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkCreateTeacherCompetenciesSchema))
    dto: BulkCreateTeacherCompetenciesDto,
  ) {
    return this.service.bulkCreate(tenant.tenant_id, dto);
  }

  // PATCH /v1/scheduling/teacher-competencies/:id
  @Patch(':id')
  @RequiresPermission('schedule.configure_requirements')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTeacherCompetencySchema))
    dto: UpdateTeacherCompetencyDto,
  ) {
    return this.service.update(tenant.tenant_id, id, dto);
  }

  // DELETE /v1/scheduling/teacher-competencies/:id
  @Delete(':id')
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.delete(tenant.tenant_id, id);
  }

  // DELETE /v1/scheduling/teacher-competencies/by-teacher/:staffProfileId
  @Delete('by-teacher/:staffProfileId')
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.OK)
  async deleteAllForTeacher(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('staffProfileId', ParseUUIDPipe) staffProfileId: string,
    @Query(new ZodValidationPipe(simpleAcademicYearQuerySchema))
    query: z.infer<typeof simpleAcademicYearQuerySchema>,
  ) {
    return this.service.deleteAllForTeacher(
      tenant.tenant_id,
      query.academic_year_id,
      staffProfileId,
    );
  }

  // POST /v1/scheduling/teacher-competencies/copy
  @Post('copy')
  @RequiresPermission('schedule.configure_requirements')
  async copy(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(copyBodySchema))
    dto: z.infer<typeof copyBodySchema>,
  ) {
    return this.service.copyFromAcademicYear(
      tenant.tenant_id,
      dto.source_academic_year_id,
      dto.target_academic_year_id,
    );
  }

  // POST /v1/scheduling/teacher-competencies/copy-to-years
  @Post('copy-to-years')
  @RequiresPermission('schedule.configure_requirements')
  async copyToYears(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(copyCompetenciesToYearsSchema))
    dto: CopyCompetenciesToYearsDto,
  ) {
    return this.service.copyToYears(tenant.tenant_id, dto);
  }
}
