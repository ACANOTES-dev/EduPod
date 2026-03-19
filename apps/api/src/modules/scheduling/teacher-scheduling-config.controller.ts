import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { upsertTeacherSchedulingConfigSchema } from '@school/shared';
import type { UpsertTeacherSchedulingConfigDto } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { TeacherSchedulingConfigService } from './teacher-scheduling-config.service';

const listQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
});

const copyBodySchema = z.object({
  source_academic_year_id: z.string().uuid(),
  target_academic_year_id: z.string().uuid(),
});

@Controller('v1/scheduling/teacher-config')
@UseGuards(AuthGuard, PermissionGuard)
export class TeacherSchedulingConfigController {
  constructor(private readonly service: TeacherSchedulingConfigService) {}

  @Get()
  @RequiresPermission('schedule.configure_availability')
  async list(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listQuerySchema))
    query: z.infer<typeof listQuerySchema>,
  ) {
    return this.service.list(tenant.tenant_id, query.academic_year_id);
  }

  @Put()
  @RequiresPermission('schedule.configure_availability')
  async upsert(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(upsertTeacherSchedulingConfigSchema))
    dto: UpsertTeacherSchedulingConfigDto,
  ) {
    return this.service.upsert(tenant.tenant_id, dto);
  }

  @Delete(':id')
  @RequiresPermission('schedule.configure_availability')
  @HttpCode(HttpStatus.OK)
  async delete(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.delete(tenant.tenant_id, id);
  }

  @Post('copy')
  @RequiresPermission('schedule.configure_availability')
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
