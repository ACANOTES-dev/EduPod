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
  bulkClassSubjectRequirementsSchema,
  createClassSubjectRequirementSchema,
  listClassSubjectRequirementsQuerySchema,
  updateClassSubjectRequirementSchema,
} from '@school/shared';
import type {
  BulkClassSubjectRequirementsDto,
  CreateClassSubjectRequirementDto,
  ListClassSubjectRequirementsQuery,
  UpdateClassSubjectRequirementDto,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ClassSubjectRequirementsService } from './class-subject-requirements.service';

@Controller('v1/class-subject-requirements')
@UseGuards(AuthGuard, PermissionGuard)
export class ClassSubjectRequirementsController {
  constructor(private readonly service: ClassSubjectRequirementsService) {}

  // GET /v1/class-subject-requirements?academic_year_id=&class_id=&subject_id=&page=&pageSize=
  @Get()
  @RequiresPermission('schedule.configure_requirements')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listClassSubjectRequirementsQuerySchema))
    query: ListClassSubjectRequirementsQuery,
  ) {
    return this.service.findAll(tenant.tenant_id, query);
  }

  // POST /v1/class-subject-requirements
  @Post()
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createClassSubjectRequirementSchema))
    dto: CreateClassSubjectRequirementDto,
  ) {
    return this.service.create(tenant.tenant_id, dto);
  }

  // PATCH /v1/class-subject-requirements/:id
  @Patch(':id')
  @RequiresPermission('schedule.configure_requirements')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateClassSubjectRequirementSchema))
    dto: UpdateClassSubjectRequirementDto,
  ) {
    return this.service.update(tenant.tenant_id, id, dto);
  }

  // DELETE /v1/class-subject-requirements/:id
  @Delete(':id')
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.service.delete(tenant.tenant_id, id);
  }

  // POST /v1/class-subject-requirements/bulk
  @Post('bulk')
  @RequiresPermission('schedule.configure_requirements')
  @HttpCode(HttpStatus.OK)
  async bulkUpsert(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(bulkClassSubjectRequirementsSchema))
    dto: BulkClassSubjectRequirementsDto,
  ) {
    return this.service.bulkUpsert(tenant.tenant_id, dto);
  }
}
