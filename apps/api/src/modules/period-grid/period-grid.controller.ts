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
  copyDaySchema,
  copyYearGroupSchema,
  createPeriodTemplateSchema,
  replaceDaySchema,
  updatePeriodTemplateSchema,
} from '@school/shared';
import type {
  CopyDayDto,
  CopyYearGroupDto,
  CreatePeriodTemplateDto,
  ReplaceDayDto,
  UpdatePeriodTemplateDto,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { PeriodGridService } from './period-grid.service';

const listPeriodGridQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  year_group_id: z.string().uuid().optional(),
});

@Controller('v1/period-grid')
@UseGuards(AuthGuard, PermissionGuard)
export class PeriodGridController {
  constructor(private readonly periodGridService: PeriodGridService) {}

  @Get()
  @RequiresPermission('schedule.configure_period_grid', 'schedule.view_own')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listPeriodGridQuerySchema))
    query: z.infer<typeof listPeriodGridQuerySchema>,
  ) {
    return this.periodGridService.findAll(tenant.tenant_id, query.academic_year_id, query.year_group_id);
  }

  @Post()
  @RequiresPermission('schedule.configure_period_grid')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createPeriodTemplateSchema)) dto: CreatePeriodTemplateDto,
  ) {
    return this.periodGridService.create(tenant.tenant_id, dto);
  }

  @Post('replace-day')
  @RequiresPermission('schedule.configure_period_grid')
  @HttpCode(HttpStatus.OK)
  async replaceDay(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(replaceDaySchema)) dto: ReplaceDayDto,
  ) {
    return this.periodGridService.replaceDay(tenant.tenant_id, dto);
  }

  @Post('copy-year-group')
  @RequiresPermission('schedule.configure_period_grid')
  @HttpCode(HttpStatus.OK)
  async copyYearGroup(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(copyYearGroupSchema)) dto: CopyYearGroupDto,
  ) {
    return this.periodGridService.copyYearGroup(tenant.tenant_id, dto);
  }

  @Patch(':id')
  @RequiresPermission('schedule.configure_period_grid')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePeriodTemplateSchema)) dto: UpdatePeriodTemplateDto,
  ) {
    return this.periodGridService.update(tenant.tenant_id, id, dto);
  }

  @Delete(':id')
  @RequiresPermission('schedule.configure_period_grid')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.periodGridService.delete(tenant.tenant_id, id);
  }

  @Get('teaching-count')
  @RequiresPermission('schedule.configure_period_grid')
  async getTeachingCount(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listPeriodGridQuerySchema))
    query: z.infer<typeof listPeriodGridQuerySchema>,
  ) {
    const count = await this.periodGridService.getTeachingCount(
      tenant.tenant_id,
      query.academic_year_id,
      query.year_group_id,
    );
    return { total_teaching_periods: count };
  }

  @Post('copy-day')
  @RequiresPermission('schedule.configure_period_grid')
  @HttpCode(HttpStatus.OK)
  async copyDay(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(copyDaySchema)) dto: CopyDayDto,
  ) {
    return this.periodGridService.copyDay(tenant.tenant_id, dto);
  }
}
