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

import { createParentSchema, updateParentSchema } from '@school/shared';
import type { CreateParentDto, TenantContext, UpdateParentDto } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ParentsService } from './parents.service';

const parentQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'inactive']).optional(),
  search: z.string().optional(),
});

const linkStudentSchema = z.object({
  student_id: z.string().uuid(),
  relationship_label: z.string().max(100).optional(),
});

@Controller('v1/parents')
@UseGuards(AuthGuard, PermissionGuard)
export class ParentsController {
  constructor(private readonly parentsService: ParentsService) {}

  @Post()
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createParentSchema)) dto: CreateParentDto,
  ) {
    return this.parentsService.create(tenant.tenant_id, dto);
  }

  @Get()
  @RequiresPermission('students.view')
  async findAll(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(parentQuerySchema))
    query: z.infer<typeof parentQuerySchema>,
  ) {
    return this.parentsService.findAll(tenant.tenant_id, query);
  }

  @Get(':id')
  @RequiresPermission('students.view')
  async findOne(@CurrentTenant() tenant: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.parentsService.findOne(tenant.tenant_id, id);
  }

  @Patch(':id')
  @RequiresPermission('students.manage')
  async update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateParentSchema)) dto: UpdateParentDto,
  ) {
    return this.parentsService.update(tenant.tenant_id, id, dto);
  }

  @Post(':id/students')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.CREATED)
  async linkStudent(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(linkStudentSchema))
    body: z.infer<typeof linkStudentSchema>,
  ) {
    return this.parentsService.linkStudent(
      tenant.tenant_id,
      id,
      body.student_id,
      body.relationship_label,
    );
  }

  @Delete(':parentId/students/:studentId')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlinkStudent(
    @CurrentTenant() tenant: TenantContext,
    @Param('parentId', ParseUUIDPipe) parentId: string,
    @Param('studentId', ParseUUIDPipe) studentId: string,
  ) {
    return this.parentsService.unlinkStudent(tenant.tenant_id, parentId, studentId);
  }
}
