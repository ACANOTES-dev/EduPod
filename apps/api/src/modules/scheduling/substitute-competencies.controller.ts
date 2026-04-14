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
  bulkCreateSubstituteTeacherCompetenciesSchema,
  copySubstituteCompetenciesToYearsSchema,
  createSubstituteTeacherCompetencySchema,
  listSubstituteTeacherCompetenciesQuerySchema,
  suggestSubstitutesQuerySchema,
  updateSubstituteTeacherCompetencySchema,
} from '@school/shared';
import type {
  BulkCreateSubstituteTeacherCompetenciesDto,
  CopySubstituteCompetenciesToYearsDto,
  CreateSubstituteTeacherCompetencyDto,
  ListSubstituteTeacherCompetenciesQuery,
  SuggestSubstitutesQuery,
  UpdateSubstituteTeacherCompetencyDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { SubstituteCompetenciesService } from './substitute-competencies.service';

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

const suggestWithAyQuerySchema = suggestSubstitutesQuerySchema.extend({
  academic_year_id: z.string().uuid(),
});

@Controller('v1/scheduling/substitute-competencies')
@UseGuards(AuthGuard, PermissionGuard)
export class SubstituteCompetenciesController {
  constructor(private readonly service: SubstituteCompetenciesService) {}

  // GET /v1/scheduling/substitute-competencies
  @Get()
  @RequiresPermission('schedule.manage_substitutions')
  async list(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listSubstituteTeacherCompetenciesQuerySchema))
    query: ListSubstituteTeacherCompetenciesQuery,
  ) {
    return this.service.list(tenant.tenant_id, query);
  }

  // GET /v1/scheduling/substitute-competencies/suggest
  @Get('suggest')
  @RequiresPermission('schedule.manage_substitutions')
  async suggest(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(suggestWithAyQuerySchema))
    query: SuggestSubstitutesQuery & { academic_year_id: string },
  ) {
    const { academic_year_id, ...rest } = query;
    return this.service.suggest(tenant.tenant_id, academic_year_id, rest);
  }

  // GET /v1/scheduling/substitute-competencies/by-teacher/:staffProfileId
  @Get('by-teacher/:staffProfileId')
  @RequiresPermission('schedule.manage_substitutions')
  async listByTeacher(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('staffProfileId', ParseUUIDPipe) staffProfileId: string,
    @Query(new ZodValidationPipe(simpleAcademicYearQuerySchema))
    query: z.infer<typeof simpleAcademicYearQuerySchema>,
  ) {
    return this.service.listByTeacher(tenant.tenant_id, query.academic_year_id, staffProfileId);
  }

  // GET /v1/scheduling/substitute-competencies/by-subject
  @Get('by-subject')
  @RequiresPermission('schedule.manage_substitutions')
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

  // POST /v1/scheduling/substitute-competencies
  @Post()
  @RequiresPermission('schedule.manage_substitutions')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createSubstituteTeacherCompetencySchema))
    dto: CreateSubstituteTeacherCompetencyDto,
  ) {
    return this.service.create(tenant.tenant_id, dto);
  }

  // POST /v1/scheduling/substitute-competencies/bulk
  @Post('bulk')
  @RequiresPermission('schedule.manage_substitutions')
  @HttpCode(HttpStatus.CREATED)
  async bulkCreate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkCreateSubstituteTeacherCompetenciesSchema))
    dto: BulkCreateSubstituteTeacherCompetenciesDto,
  ) {
    return this.service.bulkCreate(tenant.tenant_id, dto);
  }

  // PATCH /v1/scheduling/substitute-competencies/:id
  @Patch(':id')
  @RequiresPermission('schedule.manage_substitutions')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSubstituteTeacherCompetencySchema))
    dto: UpdateSubstituteTeacherCompetencyDto,
  ) {
    return this.service.update(tenant.tenant_id, id, dto);
  }

  // DELETE /v1/scheduling/substitute-competencies/:id
  @Delete(':id')
  @RequiresPermission('schedule.manage_substitutions')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.delete(tenant.tenant_id, id);
  }

  // DELETE /v1/scheduling/substitute-competencies/by-teacher/:staffProfileId
  @Delete('by-teacher/:staffProfileId')
  @RequiresPermission('schedule.manage_substitutions')
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

  // POST /v1/scheduling/substitute-competencies/copy
  @Post('copy')
  @RequiresPermission('schedule.manage_substitutions')
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

  // POST /v1/scheduling/substitute-competencies/copy-to-years
  @Post('copy-to-years')
  @RequiresPermission('schedule.manage_substitutions')
  async copyToYears(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(copySubstituteCompetenciesToYearsSchema))
    dto: CopySubstituteCompetenciesToYearsDto,
  ) {
    return this.service.copyToYears(tenant.tenant_id, dto);
  }
}
