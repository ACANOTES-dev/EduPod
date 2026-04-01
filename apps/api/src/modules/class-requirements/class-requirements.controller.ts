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
  bulkClassRequirementsSchema,
  createClassRequirementSchema,
  updateClassRequirementSchema,
} from '@school/shared';
import type {
  BulkClassRequirementsDto,
  CreateClassRequirementDto,
  UpdateClassRequirementDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ClassRequirementsService } from './class-requirements.service';

const listClassRequirementsQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

@Controller('v1/class-scheduling-requirements')
@UseGuards(AuthGuard, PermissionGuard)
export class ClassRequirementsController {
  constructor(private readonly classRequirementsService: ClassRequirementsService) {}

  @Get()
  @RequiresPermission('schedule.configure_requirements')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listClassRequirementsQuerySchema))
    query: z.infer<typeof listClassRequirementsQuerySchema>,
  ) {
    return this.classRequirementsService.findAll(tenant.tenant_id, query.academic_year_id, {
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Post()
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createClassRequirementSchema)) dto: CreateClassRequirementDto,
  ) {
    return this.classRequirementsService.create(tenant.tenant_id, dto);
  }

  @Patch(':id')
  @RequiresPermission('schedule.configure_requirements')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateClassRequirementSchema)) dto: UpdateClassRequirementDto,
  ) {
    return this.classRequirementsService.update(tenant.tenant_id, id, dto);
  }

  @Delete(':id')
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.classRequirementsService.delete(tenant.tenant_id, id);
  }

  @Post('bulk')
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.OK)
  async bulkUpsert(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkClassRequirementsSchema)) dto: BulkClassRequirementsDto,
  ) {
    return this.classRequirementsService.bulkUpsert(tenant.tenant_id, dto);
  }
}
