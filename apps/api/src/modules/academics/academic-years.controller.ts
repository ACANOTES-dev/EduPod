import {
  Body,
  Controller,
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
  createAcademicYearSchema,
  listAcademicYearsQuerySchema,
  updateAcademicYearSchema,
  updateAcademicYearStatusSchema,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { AcademicYearsService } from './academic-years.service';
import type { CreateAcademicYearDto } from './dto/create-academic-year.dto';
import type {
  UpdateAcademicYearDto,
  UpdateAcademicYearStatusDto,
} from './dto/update-academic-year.dto';

@Controller('v1/academic-years')
@UseGuards(AuthGuard, PermissionGuard)
export class AcademicYearsController {
  constructor(private readonly academicYearsService: AcademicYearsService) {}

  @Post()
  @RequiresPermission('students.manage')
  async create(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Body(new ZodValidationPipe(createAcademicYearSchema)) dto: CreateAcademicYearDto,
  ) {
    return this.academicYearsService.create(tenantContext.tenant_id, dto);
  }

  @Get()
  @RequiresPermission('students.view')
  async findAll(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query(new ZodValidationPipe(listAcademicYearsQuerySchema))
    query: z.infer<typeof listAcademicYearsQuerySchema>,
  ) {
    return this.academicYearsService.findAll(tenantContext.tenant_id, {
      status: query.status,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':id')
  @RequiresPermission('students.view')
  async findOne(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.academicYearsService.findOne(tenantContext.tenant_id, id);
  }

  @Patch(':id')
  @RequiresPermission('students.manage')
  async update(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAcademicYearSchema)) dto: UpdateAcademicYearDto,
  ) {
    return this.academicYearsService.update(tenantContext.tenant_id, id, dto);
  }

  @Patch(':id/status')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAcademicYearStatusSchema)) dto: UpdateAcademicYearStatusDto,
  ) {
    return this.academicYearsService.updateStatus(tenantContext.tenant_id, id, dto.status);
  }
}
