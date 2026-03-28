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
  createCalendarEventSchema,
  createDesSubjectCodeMappingSchema,
  createReducedSchoolDaySchema,
  createSubmissionSchema,
  createTuslaAbsenceCodeMappingSchema,
  listCalendarEventsQuerySchema,
  listSubmissionsQuerySchema,
  seedDefaultsSchema,
  updateCalendarEventSchema,
  updateReducedSchoolDaySchema,
  updateSubmissionSchema,
} from '@school/shared';
import type {
  CreateCalendarEventDto,
  CreateDesSubjectCodeMappingDto,
  CreateReducedSchoolDayDto,
  CreateSubmissionDto,
  CreateTuslaAbsenceCodeMappingDto,
  JwtPayload,
  ListCalendarEventsQueryDto,
  ListSubmissionsQueryDto,
  TenantContext,
  UpdateCalendarEventDto,
  UpdateReducedSchoolDayDto,
  UpdateSubmissionDto,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { RegulatoryCalendarService } from './regulatory-calendar.service';
import { RegulatoryDesMappingsService } from './regulatory-des-mappings.service';
import { RegulatoryReducedDaysService } from './regulatory-reduced-days.service';
import { RegulatorySubmissionService } from './regulatory-submission.service';
import { RegulatoryTuslaMappingsService } from './regulatory-tusla-mappings.service';

// ─── Query Schemas ─────────────────────────────────────────────────────────

const listReducedSchoolDaysQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  is_active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

type ListReducedSchoolDaysQueryDto = z.infer<typeof listReducedSchoolDaysQuerySchema>;

@Controller('v1/regulatory')
@UseGuards(AuthGuard, PermissionGuard)
export class RegulatoryController {
  constructor(
    private readonly calendarService: RegulatoryCalendarService,
    private readonly submissionService: RegulatorySubmissionService,
    private readonly tuslaMappingsService: RegulatoryTuslaMappingsService,
    private readonly desMappingsService: RegulatoryDesMappingsService,
    private readonly reducedDaysService: RegulatoryReducedDaysService,
  ) {}

  // ─── Calendar ───────────────────────────────────────────────────────────────

  // POST /v1/regulatory/calendar/seed-defaults
  @Post('calendar/seed-defaults')
  @RequiresPermission('regulatory.manage')
  async seedCalendarDefaults(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(seedDefaultsSchema)) dto: { academic_year: string },
  ) {
    return this.calendarService.seedDefaults(tenant.tenant_id, dto.academic_year);
  }

  // GET /v1/regulatory/calendar
  @Get('calendar')
  @RequiresPermission('regulatory.view')
  async listCalendarEvents(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listCalendarEventsQuerySchema))
    query: ListCalendarEventsQueryDto,
  ) {
    return this.calendarService.findAll(tenant.tenant_id, {
      page: query.page,
      pageSize: query.pageSize,
      domain: query.domain,
      status: query.status,
      academic_year: query.academic_year,
      from_date: query.from_date,
      to_date: query.to_date,
    });
  }

  // POST /v1/regulatory/calendar
  @Post('calendar')
  @RequiresPermission('regulatory.manage')
  @HttpCode(HttpStatus.CREATED)
  async createCalendarEvent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createCalendarEventSchema)) dto: CreateCalendarEventDto,
  ) {
    return this.calendarService.create(tenant.tenant_id, user.sub, dto);
  }

  // PATCH /v1/regulatory/calendar/:id
  @Patch('calendar/:id')
  @RequiresPermission('regulatory.manage')
  async updateCalendarEvent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCalendarEventSchema)) dto: UpdateCalendarEventDto,
  ) {
    return this.calendarService.update(tenant.tenant_id, id, user.sub, dto);
  }

  // DELETE /v1/regulatory/calendar/:id
  @Delete('calendar/:id')
  @RequiresPermission('regulatory.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteCalendarEvent(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.calendarService.remove(tenant.tenant_id, id);
  }

  // ─── Submissions ──────────────────────────────────────────────────────────

  // GET /v1/regulatory/submissions
  @Get('submissions')
  @RequiresPermission('regulatory.view')
  async listSubmissions(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listSubmissionsQuerySchema))
    query: ListSubmissionsQueryDto,
  ) {
    return this.submissionService.findAll(tenant.tenant_id, {
      page: query.page,
      pageSize: query.pageSize,
      domain: query.domain,
      status: query.status,
      academic_year: query.academic_year,
    });
  }

  // GET /v1/regulatory/submissions/:id
  @Get('submissions/:id')
  @RequiresPermission('regulatory.view')
  async getSubmission(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.submissionService.findOne(tenant.tenant_id, id);
  }

  // POST /v1/regulatory/submissions
  @Post('submissions')
  @RequiresPermission('regulatory.manage')
  @HttpCode(HttpStatus.CREATED)
  async createSubmission(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createSubmissionSchema)) dto: CreateSubmissionDto,
  ) {
    return this.submissionService.create(tenant.tenant_id, user.sub, dto);
  }

  // PATCH /v1/regulatory/submissions/:id
  @Patch('submissions/:id')
  @RequiresPermission('regulatory.manage')
  async updateSubmission(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSubmissionSchema)) dto: UpdateSubmissionDto,
  ) {
    return this.submissionService.update(tenant.tenant_id, id, user.sub, dto);
  }

  // ─── Tusla Absence Mappings ─────────────────────────────────────────────────

  // GET /v1/regulatory/tusla/absence-mappings
  @Get('tusla/absence-mappings')
  @RequiresPermission('regulatory.manage_tusla')
  async listTuslaMappings(@CurrentTenant() tenant: TenantContext) {
    return this.tuslaMappingsService.findAll(tenant.tenant_id);
  }

  // POST /v1/regulatory/tusla/absence-mappings
  @Post('tusla/absence-mappings')
  @RequiresPermission('regulatory.manage_tusla')
  @HttpCode(HttpStatus.CREATED)
  async createTuslaMapping(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createTuslaAbsenceCodeMappingSchema)) dto: CreateTuslaAbsenceCodeMappingDto,
  ) {
    return this.tuslaMappingsService.create(tenant.tenant_id, dto);
  }

  // DELETE /v1/regulatory/tusla/absence-mappings/:id
  @Delete('tusla/absence-mappings/:id')
  @RequiresPermission('regulatory.manage_tusla')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteTuslaMapping(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.tuslaMappingsService.remove(tenant.tenant_id, id);
  }

  // ─── DES Subject Mappings ───────────────────────────────────────────────────

  // GET /v1/regulatory/des/subject-mappings
  @Get('des/subject-mappings')
  @RequiresPermission('regulatory.manage_des')
  async listDesMappings(@CurrentTenant() tenant: TenantContext) {
    return this.desMappingsService.findAll(tenant.tenant_id);
  }

  // POST /v1/regulatory/des/subject-mappings
  @Post('des/subject-mappings')
  @RequiresPermission('regulatory.manage_des')
  @HttpCode(HttpStatus.CREATED)
  async createDesMapping(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(createDesSubjectCodeMappingSchema)) dto: CreateDesSubjectCodeMappingDto,
  ) {
    return this.desMappingsService.create(tenant.tenant_id, dto);
  }

  // DELETE /v1/regulatory/des/subject-mappings/:id
  @Delete('des/subject-mappings/:id')
  @RequiresPermission('regulatory.manage_des')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDesMapping(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.desMappingsService.remove(tenant.tenant_id, id);
  }

  // ─── Reduced School Days ────────────────────────────────────────────────────

  // GET /v1/regulatory/reduced-school-days
  @Get('reduced-school-days')
  @RequiresPermission('regulatory.manage_reduced_days')
  async listReducedSchoolDays(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listReducedSchoolDaysQuerySchema))
    query: ListReducedSchoolDaysQueryDto,
  ) {
    return this.reducedDaysService.findAll(tenant.tenant_id, {
      page: query.page,
      pageSize: query.pageSize,
      student_id: query.student_id,
      is_active: query.is_active,
    });
  }

  // POST /v1/regulatory/reduced-school-days
  @Post('reduced-school-days')
  @RequiresPermission('regulatory.manage_reduced_days')
  @HttpCode(HttpStatus.CREATED)
  async createReducedSchoolDay(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createReducedSchoolDaySchema)) dto: CreateReducedSchoolDayDto,
  ) {
    return this.reducedDaysService.create(tenant.tenant_id, user.sub, dto);
  }

  // GET /v1/regulatory/reduced-school-days/:id
  @Get('reduced-school-days/:id')
  @RequiresPermission('regulatory.manage_reduced_days')
  async getReducedSchoolDay(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.reducedDaysService.findOne(tenant.tenant_id, id);
  }

  // PATCH /v1/regulatory/reduced-school-days/:id
  @Patch('reduced-school-days/:id')
  @RequiresPermission('regulatory.manage_reduced_days')
  async updateReducedSchoolDay(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateReducedSchoolDaySchema)) dto: UpdateReducedSchoolDayDto,
  ) {
    return this.reducedDaysService.update(tenant.tenant_id, id, dto);
  }
}
