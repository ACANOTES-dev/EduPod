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
import {
  createStudentSchema,
  paginationQuerySchema,
  updateStudentSchema,
  updateStudentStatusSchema,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import type { CreateStudentDto } from './dto/create-student.dto';
import type { UpdateStudentDto } from './dto/update-student.dto';
import type { UpdateStudentStatusDto } from './dto/update-student-status.dto';
import { StudentsService } from './students.service';

// ─── Query schemas ────────────────────────────────────────────────────────────

const listStudentsQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum(['applicant', 'active', 'withdrawn', 'graduated', 'archived'])
    .optional(),
  year_group_id: z.string().uuid().optional(),
  household_id: z.string().uuid().optional(),
  has_allergy: z
    .string()
    .optional()
    .transform((v) => {
      if (v === 'true') return true;
      if (v === 'false') return false;
      return undefined;
    }),
  search: z.string().optional(),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).optional(),
});

const allergyReportQuerySchema = z.object({
  year_group_id: z.string().uuid().optional(),
  class_id: z.string().uuid().optional(),
  format: z.enum(['json']).optional(),
});

// ─────────────────────────────────────────────────────────────────────────────

@Controller('v1/students')
@UseGuards(AuthGuard, PermissionGuard)
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  // POST /v1/students
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequiresPermission('students.manage')
  async create(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Body(new ZodValidationPipe(createStudentSchema)) dto: CreateStudentDto,
  ) {
    return this.studentsService.create(tenantContext.tenant_id, dto);
  }

  // GET /v1/students
  @Get()
  @RequiresPermission('students.view')
  async findAll(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query(new ZodValidationPipe(listStudentsQuerySchema))
    query: z.infer<typeof listStudentsQuerySchema>,
  ) {
    return this.studentsService.findAll(tenantContext.tenant_id, {
      page: query.page,
      pageSize: query.pageSize,
      status: query.status,
      year_group_id: query.year_group_id,
      household_id: query.household_id,
      has_allergy: query.has_allergy as boolean | undefined,
      search: query.search,
      sort: query.sort,
      order: query.order,
    });
  }

  // GET /v1/students/allergy-report
  // Note: Must be declared before :id route to avoid being captured as an id
  @Get('allergy-report')
  @RequiresPermission('students.view')
  async allergyReport(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Query(new ZodValidationPipe(allergyReportQuerySchema))
    query: z.infer<typeof allergyReportQuerySchema>,
  ) {
    return this.studentsService.allergyReport(tenantContext.tenant_id, {
      year_group_id: query.year_group_id,
      class_id: query.class_id,
    });
  }

  // GET /v1/students/:id
  @Get(':id')
  @RequiresPermission('students.view')
  async findOne(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentsService.findOne(tenantContext.tenant_id, id);
  }

  // PATCH /v1/students/:id
  @Patch(':id')
  @RequiresPermission('students.manage')
  async update(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStudentSchema)) dto: UpdateStudentDto,
  ) {
    return this.studentsService.update(tenantContext.tenant_id, id, dto);
  }

  // PATCH /v1/students/:id/status
  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequiresPermission('students.manage')
  async updateStatus(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateStudentStatusSchema))
    dto: UpdateStudentStatusDto,
  ) {
    return this.studentsService.updateStatus(tenantContext.tenant_id, id, dto);
  }

  // GET /v1/students/:id/preview
  @Get(':id/preview')
  @RequiresPermission('students.view')
  async preview(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentsService.preview(tenantContext.tenant_id, id);
  }

  // GET /v1/students/:id/export-pack
  @Get(':id/export-pack')
  @RequiresPermission('students.manage')
  async exportPack(
    @CurrentTenant() tenantContext: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.studentsService.exportPack(tenantContext.tenant_id, id);
  }
}
