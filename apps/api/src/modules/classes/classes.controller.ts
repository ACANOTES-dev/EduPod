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
  assignClassStaffSchema,
  createClassSchema,
  updateClassSchema,
  updateClassStatusSchema,
} from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { ClassesService } from './classes.service';
import type { AssignClassStaffDto } from './dto/assign-class-staff.dto';
import type { CreateClassDto } from './dto/create-class.dto';
import type { UpdateClassDto, UpdateClassStatusDto } from './dto/update-class.dto';

const listClassesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(500).default(20),
  academic_year_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid().optional(),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  search: z.string().optional(),
  homeroom_only: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((v) => (typeof v === 'boolean' ? v : v === 'true'))
    .optional(),
});

@Controller('v1/classes')
@UseGuards(AuthGuard, PermissionGuard)
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  @Post()
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentTenant() tenant: { tenant_id: string },
    @Body(new ZodValidationPipe(createClassSchema)) dto: CreateClassDto,
  ) {
    return this.classesService.create(tenant.tenant_id, dto);
  }

  @Get()
  @RequiresPermission('students.view')
  async findAll(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listClassesQuerySchema))
    query: z.infer<typeof listClassesQuerySchema>,
  ) {
    return this.classesService.findAll(tenant.tenant_id, {
      page: query.page,
      pageSize: query.pageSize,
      academic_year_id: query.academic_year_id,
      year_group_id: query.year_group_id,
      status: query.status,
      search: query.search,
      homeroom_only: query.homeroom_only,
    });
  }

  @Get(':id')
  @RequiresPermission('students.view')
  async findOne(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.classesService.findOne(tenant.tenant_id, id);
  }

  @Patch(':id')
  @RequiresPermission('students.manage')
  async update(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateClassSchema)) dto: UpdateClassDto,
  ) {
    return this.classesService.update(tenant.tenant_id, id, dto);
  }

  @Patch(':id/status')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.OK)
  async updateStatus(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateClassStatusSchema)) dto: UpdateClassStatusDto,
  ) {
    return this.classesService.updateStatus(tenant.tenant_id, id, dto);
  }

  @Get(':id/staff')
  @RequiresPermission('students.view')
  async findStaff(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.classesService.findStaff(tenant.tenant_id, id);
  }

  @Post(':id/staff')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.CREATED)
  async assignStaff(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(assignClassStaffSchema)) dto: AssignClassStaffDto,
  ) {
    return this.classesService.assignStaff(tenant.tenant_id, id, dto);
  }

  @Delete(':classId/staff/:staffProfileId/role/:role')
  @RequiresPermission('students.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeStaff(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('classId', ParseUUIDPipe) classId: string,
    @Param('staffProfileId', ParseUUIDPipe) staffProfileId: string,
    @Param('role') role: string,
  ) {
    return this.classesService.removeStaff(tenant.tenant_id, classId, staffProfileId, role);
  }

  @Get(':id/preview')
  @RequiresPermission('students.view')
  async preview(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.classesService.preview(tenant.tenant_id, id);
  }
}
