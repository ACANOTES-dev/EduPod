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

import { createSubjectSchema, listSubjectsQuerySchema, updateSubjectSchema } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import type { CreateSubjectDto } from './dto/create-subject.dto';
import type { UpdateSubjectDto } from './dto/update-subject.dto';
import { SubjectsService } from './subjects.service';

@Controller('v1/subjects')
@UseGuards(AuthGuard, PermissionGuard)
export class SubjectsController {
  constructor(private readonly subjectsService: SubjectsService) {}

  @Post()
  @RequiresPermission('students.manage')
  async create(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Body(new ZodValidationPipe(createSubjectSchema)) dto: CreateSubjectDto,
  ) {
    return this.subjectsService.create(tenantContext.tenant_id, dto);
  }

  @Get()
  @RequiresPermission('students.view')
  async findAll(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query(new ZodValidationPipe(listSubjectsQuerySchema))
    query: z.infer<typeof listSubjectsQuerySchema>,
  ) {
    return this.subjectsService.findAll(tenantContext.tenant_id, {
      subject_type: query.subject_type,
      active: query.active,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Patch(':id')
  @RequiresPermission('students.manage')
  async update(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSubjectSchema)) dto: UpdateSubjectDto,
  ) {
    return this.subjectsService.update(tenantContext.tenant_id, id, dto);
  }

  @Delete(':id')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.subjectsService.remove(tenantContext.tenant_id, id);
  }
}
