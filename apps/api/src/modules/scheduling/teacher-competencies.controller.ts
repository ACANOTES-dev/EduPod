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
import {
  createTeacherCompetencySchema,
  bulkCreateTeacherCompetenciesSchema,
  copyCompetenciesToYearsSchema,
} from '@school/shared';
import type {
  CreateTeacherCompetencyDto,
  BulkCreateTeacherCompetenciesDto,
  CopyCompetenciesToYearsDto,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { TeacherCompetenciesService } from './teacher-competencies.service';

const listByTeacherQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
});

const listBySubjectQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
});

const deleteByTeacherQuerySchema = z.object({
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

  @Get()
  @RequiresPermission('schedule.configure_requirements')
  async listAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listByTeacherQuerySchema))
    query: z.infer<typeof listByTeacherQuerySchema>,
  ) {
    return this.service.listAll(tenant.tenant_id, query.academic_year_id);
  }

  @Get('coverage')
  @RequiresPermission('schedule.configure_requirements')
  async getCoverage(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listByTeacherQuerySchema))
    query: z.infer<typeof listByTeacherQuerySchema>,
  ) {
    return this.service.getCoverage(tenant.tenant_id, query.academic_year_id);
  }

  @Get('by-teacher/:staffProfileId')
  @RequiresPermission('schedule.configure_requirements')
  async listByTeacher(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('staffProfileId', ParseUUIDPipe) staffProfileId: string,
    @Query(new ZodValidationPipe(listByTeacherQuerySchema))
    query: z.infer<typeof listByTeacherQuerySchema>,
  ) {
    return this.service.listByTeacher(
      tenant.tenant_id,
      query.academic_year_id,
      staffProfileId,
    );
  }

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

  @Patch(':id')
  @RequiresPermission('schedule.configure_requirements')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: { is_primary?: boolean },
  ) {
    return this.service.update(tenant.tenant_id, id, dto);
  }

  @Delete(':id')
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.delete(tenant.tenant_id, id);
  }

  @Delete('by-teacher/:staffProfileId')
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.OK)
  async deleteAllForTeacher(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('staffProfileId', ParseUUIDPipe) staffProfileId: string,
    @Query(new ZodValidationPipe(deleteByTeacherQuerySchema))
    query: z.infer<typeof deleteByTeacherQuerySchema>,
  ) {
    return this.service.deleteAllForTeacher(
      tenant.tenant_id,
      query.academic_year_id,
      staffProfileId,
    );
  }

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
