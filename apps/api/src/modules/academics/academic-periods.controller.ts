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
  UseGuards,
} from '@nestjs/common';
import {
  createAcademicPeriodSchema,
  updateAcademicPeriodSchema,
  updateAcademicPeriodStatusSchema,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { AcademicPeriodsService } from './academic-periods.service';
import type { CreateAcademicPeriodDto } from './dto/create-academic-period.dto';
import type {
  UpdateAcademicPeriodDto,
  UpdateAcademicPeriodStatusDto,
} from './dto/update-academic-period.dto';

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class AcademicPeriodsController {
  constructor(private readonly academicPeriodsService: AcademicPeriodsService) {}

  @Post('academic-years/:yearId/periods')
  @RequiresPermission('students.manage')
  async create(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('yearId', ParseUUIDPipe) yearId: string,
    @Body(new ZodValidationPipe(createAcademicPeriodSchema)) dto: CreateAcademicPeriodDto,
  ) {
    return this.academicPeriodsService.create(tenantContext.tenant_id, yearId, dto);
  }

  @Get('academic-years/:yearId/periods')
  @RequiresPermission('students.view')
  async findAllForYear(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('yearId', ParseUUIDPipe) yearId: string,
  ) {
    return this.academicPeriodsService.findAllForYear(tenantContext.tenant_id, yearId);
  }

  @Patch('academic-periods/:id')
  @RequiresPermission('students.manage')
  async update(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAcademicPeriodSchema)) dto: UpdateAcademicPeriodDto,
  ) {
    return this.academicPeriodsService.update(tenantContext.tenant_id, id, dto);
  }

  @Patch('academic-periods/:id/status')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAcademicPeriodStatusSchema))
    dto: UpdateAcademicPeriodStatusDto,
  ) {
    return this.academicPeriodsService.updateStatus(tenantContext.tenant_id, id, dto.status);
  }
}
