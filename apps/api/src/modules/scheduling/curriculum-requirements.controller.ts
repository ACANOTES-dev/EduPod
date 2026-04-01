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
  createCurriculumRequirementSchema,
  updateCurriculumRequirementSchema,
} from '@school/shared';
import type { CreateCurriculumRequirementDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { CurriculumRequirementsService } from './curriculum-requirements.service';

const listQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  year_group_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const bulkUpsertSchema = z.object({
  academic_year_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
  items: z.array(createCurriculumRequirementSchema).min(1).max(100),
});

const copyBodySchema = z.object({
  source_academic_year_id: z.string().uuid(),
  target_academic_year_id: z.string().uuid(),
});

@Controller('v1/scheduling/curriculum-requirements')
@UseGuards(AuthGuard, PermissionGuard)
export class CurriculumRequirementsController {
  constructor(private readonly service: CurriculumRequirementsService) {}

  @Get()
  @RequiresPermission('schedule.configure_requirements')
  async list(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listQuerySchema))
    query: z.infer<typeof listQuerySchema>,
  ) {
    return this.service.list(tenant.tenant_id, {
      page: query.page,
      pageSize: query.pageSize,
      academic_year_id: query.academic_year_id,
      year_group_id: query.year_group_id,
    });
  }

  @Get('matrix-subjects')
  @RequiresPermission('schedule.configure_requirements')
  async getMatrixSubjects(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(
      new ZodValidationPipe(
        z.object({
          academic_year_id: z.string().uuid(),
          year_group_id: z.string().uuid(),
        }),
      ),
    )
    query: { academic_year_id: string; year_group_id: string },
  ) {
    return this.service.getMatrixSubjects(
      tenant.tenant_id,
      query.academic_year_id,
      query.year_group_id,
    );
  }

  @Get(':id')
  @RequiresPermission('schedule.configure_requirements')
  async getById(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.getById(tenant.tenant_id, id);
  }

  @Post()
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createCurriculumRequirementSchema))
    dto: CreateCurriculumRequirementDto,
  ) {
    return this.service.create(tenant.tenant_id, dto);
  }

  @Patch(':id')
  @RequiresPermission('schedule.configure_requirements')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCurriculumRequirementSchema))
    dto: z.infer<typeof updateCurriculumRequirementSchema>,
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

  @Post('bulk-upsert')
  @RequiresPermission('schedule.configure_requirements')
  async bulkUpsert(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkUpsertSchema))
    dto: z.infer<typeof bulkUpsertSchema>,
  ) {
    return this.service.bulkUpsert(
      tenant.tenant_id,
      dto.academic_year_id,
      dto.year_group_id,
      dto.items as CreateCurriculumRequirementDto[],
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
}
