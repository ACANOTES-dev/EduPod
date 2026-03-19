import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import { findCoverTeacherQuerySchema } from '@school/shared';
import type { FindCoverTeacherQuery } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { CoverTeacherService } from './cover-teacher.service';

@Controller('v1/scheduling/cover-teacher')
@UseGuards(AuthGuard, PermissionGuard)
export class CoverTeacherController {
  constructor(private readonly service: CoverTeacherService) {}

  @Get()
  @RequiresPermission('schedule.manage')
  async findCoverTeacher(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(findCoverTeacherQuerySchema))
    query: FindCoverTeacherQuery,
  ) {
    return this.service.findCoverTeacher(
      tenant.tenant_id,
      query.academic_year_id,
      query.weekday,
      query.period_order,
      query.subject_id,
      query.year_group_id,
    );
  }
}
