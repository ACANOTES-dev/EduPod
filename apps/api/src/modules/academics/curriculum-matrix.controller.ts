import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { JwtPayload, TenantContext } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { CurriculumMatrixService } from './curriculum-matrix.service';

const matrixQuerySchema = z.object({
  academic_year_id: z.string().uuid().optional(),
});

const toggleSchema = z.object({
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  enabled: z.boolean(),
});

const yearGroupAssignSchema = z.object({
  academic_year_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
  assignments: z
    .array(
      z.object({
        subject_id: z.string().uuid(),
        enabled: z.boolean(),
      }),
    )
    .min(1),
});

const bulkAssessmentSchema = z.object({
  class_ids: z.array(z.string().uuid()).min(1),
  subject_ids: z.array(z.string().uuid()).min(1),
  academic_period_id: z.string().uuid(),
  category_id: z.string().uuid(),
  title: z.string().min(1).max(255),
  max_score: z.number().positive(),
  due_date: z.string().nullable().optional(),
});

@Controller('v1/curriculum-matrix')
@UseGuards(AuthGuard, PermissionGuard)
export class CurriculumMatrixController {
  constructor(private readonly matrixService: CurriculumMatrixService) {}

  @Get()
  @RequiresPermission('students.view')
  async getMatrix(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(matrixQuerySchema))
    query: z.infer<typeof matrixQuerySchema>,
  ) {
    return this.matrixService.getMatrix(tenant.tenant_id, query.academic_year_id);
  }

  @Post('toggle')
  @RequiresPermission('curriculum_matrix.manage')
  @HttpCode(HttpStatus.OK)
  async toggle(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(toggleSchema))
    body: z.infer<typeof toggleSchema>,
  ) {
    return this.matrixService.toggle(
      tenant.tenant_id,
      body.class_id,
      body.subject_id,
      body.enabled,
    );
  }

  @Post('year-group-assign')
  @RequiresPermission('curriculum_matrix.manage')
  @HttpCode(HttpStatus.OK)
  async yearGroupAssign(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(yearGroupAssignSchema))
    dto: z.infer<typeof yearGroupAssignSchema>,
  ) {
    return this.matrixService.yearGroupAssign(
      tenant.tenant_id,
      dto.academic_year_id,
      dto.year_group_id,
      dto.assignments,
    );
  }

  @Post('bulk-assessments')
  @RequiresPermission('gradebook.enter_grades')
  @HttpCode(HttpStatus.CREATED)
  async bulkCreateAssessments(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(bulkAssessmentSchema))
    body: z.infer<typeof bulkAssessmentSchema>,
  ) {
    return this.matrixService.bulkCreateAssessments(
      tenant.tenant_id,
      user.sub,
      body,
    );
  }
}
