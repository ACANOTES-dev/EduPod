import {
  BadRequestException,
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
import { PodDatabaseType } from '@prisma/client';
import {
  cbaSyncSchema,
  createCalendarEventSchema,
  createDesSubjectCodeMappingSchema,
  createReducedSchoolDaySchema,
  createSubmissionSchema,
  createTransferSchema,
  createTuslaAbsenceCodeMappingSchema,
  DES_FILE_TYPES,
  desReadinessCheckSchema,
  generateTuslaAarSchema,
  generateTuslaSarSchema,
  listCalendarEventsQuerySchema,
  listSubmissionsQuerySchema,
  listTransfersQuerySchema,
  octoberReturnsReadinessSchema,
  ppodExportSchema,
  ppodImportSchema,
  seedDefaultsSchema,
  updateCalendarEventSchema,
  updateReducedSchoolDaySchema,
  updateSubmissionSchema,
  updateTransferSchema,
} from '@school/shared';
import type {
  CbaSyncDto,
  CreateCalendarEventDto,
  CreateDesSubjectCodeMappingDto,
  CreateReducedSchoolDayDto,
  CreateSubmissionDto,
  CreateTransferDto,
  CreateTuslaAbsenceCodeMappingDto,
  DesFileType,
  DesReadinessCheckDto,
  GenerateTuslaAarDto,
  GenerateTuslaSarDto,
  JwtPayload,
  ListCalendarEventsQueryDto,
  ListSubmissionsQueryDto,
  ListTransfersQueryDto,
  OctoberReturnsReadinessDto,
  PpodExportDto,
  PpodImportDto,
  TenantContext,
  UpdateCalendarEventDto,
  UpdateReducedSchoolDayDto,
  UpdateSubmissionDto,
  UpdateTransferDto,
} from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

import { RegulatoryCalendarService } from './regulatory-calendar.service';
import { RegulatoryCbaService } from './regulatory-cba.service';
import { RegulatoryDesMappingsService } from './regulatory-des-mappings.service';
import { RegulatoryDesService } from './regulatory-des.service';
import type { ReadinessCategory, ValidationError } from './regulatory-des.service';
import { RegulatoryOctoberReturnsService } from './regulatory-october-returns.service';
import type { PreviewResult, ReadinessResult, StudentIssuesResult } from './regulatory-october-returns.service';
import { RegulatoryPpodService } from './regulatory-ppod.service';
import { RegulatoryReducedDaysService } from './regulatory-reduced-days.service';
import { RegulatorySubmissionService } from './regulatory-submission.service';
import { RegulatoryTransfersService } from './regulatory-transfers.service';
import { RegulatoryTuslaMappingsService } from './regulatory-tusla-mappings.service';
import { RegulatoryTuslaService } from './regulatory-tusla.service';

// ─── Query Schemas ─────────────────────────────────────────────────────────

const listReducedSchoolDaysQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  is_active: z.enum(['true', 'false']).transform(v => v === 'true').optional(),
});

type ListReducedSchoolDaysQueryDto = z.infer<typeof listReducedSchoolDaysQuerySchema>;

const tuslaThresholdQuerySchema = z.object({
  threshold_days: z.coerce.number().int().min(1).max(365).default(20),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

type TuslaThresholdQueryDto = z.infer<typeof tuslaThresholdQuerySchema>;

const tuslaNotificationQuerySchema = z.object({
  academic_year: z.string().optional(),
});

type TuslaNotificationQueryDto = z.infer<typeof tuslaNotificationQuerySchema>;

const ppodDatabaseTypeQuerySchema = z.object({
  database_type: z.enum(['ppod', 'pod']),
});

type PpodDatabaseTypeQueryDto = z.infer<typeof ppodDatabaseTypeQuerySchema>;

const ppodStudentsQuerySchema = z.object({
  database_type: z.enum(['ppod', 'pod']),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

type PpodStudentsQueryDto = z.infer<typeof ppodStudentsQuerySchema>;

const ppodSyncLogQuerySchema = z.object({
  database_type: z.enum(['ppod', 'pod']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

type PpodSyncLogQueryDto = z.infer<typeof ppodSyncLogQuerySchema>;

const ppodSyncStudentBodySchema = z.object({
  database_type: z.enum(['ppod', 'pod']),
});

type PpodSyncStudentBodyDto = z.infer<typeof ppodSyncStudentBodySchema>;

const cbaStatusQuerySchema = z.object({
  academic_year: z.string().min(1).max(20),
});

type CbaStatusQueryDto = z.infer<typeof cbaStatusQuerySchema>;

const cbaPendingQuerySchema = z.object({
  academic_year: z.string().min(1).max(20),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

type CbaPendingQueryDto = z.infer<typeof cbaPendingQuerySchema>;

@Controller('v1/regulatory')
@UseGuards(AuthGuard, PermissionGuard)
export class RegulatoryController {
  constructor(
    private readonly calendarService: RegulatoryCalendarService,
    private readonly cbaService: RegulatoryCbaService,
    private readonly desMappingsService: RegulatoryDesMappingsService,
    private readonly desService: RegulatoryDesService,
    private readonly octoberReturnsService: RegulatoryOctoberReturnsService,
    private readonly ppodService: RegulatoryPpodService,
    private readonly reducedDaysService: RegulatoryReducedDaysService,
    private readonly submissionService: RegulatorySubmissionService,
    private readonly transfersService: RegulatoryTransfersService,
    private readonly tuslaMappingsService: RegulatoryTuslaMappingsService,
    private readonly tuslaService: RegulatoryTuslaService,
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

  // ─── Tusla Compliance ──────────────────────────────────────────────────────

  // GET /v1/regulatory/tusla/threshold-monitor
  @Get('tusla/threshold-monitor')
  @RequiresPermission('regulatory.view')
  async getThresholdMonitor(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(tuslaThresholdQuerySchema)) query: TuslaThresholdQueryDto,
  ) {
    return this.tuslaService.getThresholdMonitor(tenant.tenant_id, {
      threshold_days: query.threshold_days,
      start_date: query.start_date,
      end_date: query.end_date,
    });
  }

  // POST /v1/regulatory/tusla/sar/generate
  @Post('tusla/sar/generate')
  @RequiresPermission('regulatory.manage_tusla')
  async generateSar(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(generateTuslaSarSchema)) dto: GenerateTuslaSarDto,
  ) {
    return this.tuslaService.generateSar(tenant.tenant_id, dto);
  }

  // POST /v1/regulatory/tusla/aar/generate
  @Post('tusla/aar/generate')
  @RequiresPermission('regulatory.manage_tusla')
  async generateAar(
    @CurrentTenant() tenant: TenantContext,
    @Body(new ZodValidationPipe(generateTuslaAarSchema)) dto: GenerateTuslaAarDto,
  ) {
    return this.tuslaService.generateAar(tenant.tenant_id, dto);
  }

  // GET /v1/regulatory/tusla/suspensions
  @Get('tusla/suspensions')
  @RequiresPermission('regulatory.view')
  async getSuspensions(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(tuslaNotificationQuerySchema)) query: TuslaNotificationQueryDto,
  ) {
    return this.tuslaService.getSuspensions(tenant.tenant_id, query.academic_year);
  }

  // GET /v1/regulatory/tusla/expulsions
  @Get('tusla/expulsions')
  @RequiresPermission('regulatory.view')
  async getExpulsions(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(tuslaNotificationQuerySchema)) query: TuslaNotificationQueryDto,
  ) {
    return this.tuslaService.getExpulsions(tenant.tenant_id, query.academic_year);
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

  // ─── DES Returns ──────────────────────────────────────────────────────────

  // GET /v1/regulatory/des/readiness
  @Get('des/readiness')
  @RequiresPermission('regulatory.manage_des')
  async desReadiness(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(desReadinessCheckSchema)) query: DesReadinessCheckDto,
  ) {
    return this.desService.checkReadiness(tenant.tenant_id, query.academic_year);
  }

  // GET /v1/regulatory/des/preview/:fileType
  @Get('des/preview/:fileType')
  @RequiresPermission('regulatory.manage_des')
  async desPreview(
    @CurrentTenant() tenant: TenantContext,
    @Param('fileType') fileType: string,
    @Query(new ZodValidationPipe(desReadinessCheckSchema)) query: DesReadinessCheckDto,
  ) {
    this.validateDesFileType(fileType);
    return this.desService.previewFile(tenant.tenant_id, fileType, query.academic_year);
  }

  // POST /v1/regulatory/des/generate/:fileType
  @Post('des/generate/:fileType')
  @RequiresPermission('regulatory.manage_des')
  async desGenerate(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('fileType') fileType: string,
    @Body(new ZodValidationPipe(desReadinessCheckSchema)) dto: DesReadinessCheckDto,
  ) {
    this.validateDesFileType(fileType);
    return this.desService.generateFile(tenant.tenant_id, user.sub, fileType, dto.academic_year);
  }

  // ─── October Returns ──────────────────────────────────────────────────────

  // GET /v1/regulatory/october-returns/readiness
  @Get('october-returns/readiness')
  @RequiresPermission('regulatory.manage_des')
  async octoberReturnsReadiness(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(octoberReturnsReadinessSchema)) query: OctoberReturnsReadinessDto,
  ) {
    return this.octoberReturnsService.checkReadiness(tenant.tenant_id, query.academic_year);
  }

  // GET /v1/regulatory/october-returns/preview
  @Get('october-returns/preview')
  @RequiresPermission('regulatory.manage_des')
  async octoberReturnsPreview(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(octoberReturnsReadinessSchema)) query: OctoberReturnsReadinessDto,
  ) {
    return this.octoberReturnsService.preview(tenant.tenant_id, query.academic_year);
  }

  // GET /v1/regulatory/october-returns/issues
  @Get('october-returns/issues')
  @RequiresPermission('regulatory.manage_des')
  async octoberReturnsIssues(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(octoberReturnsReadinessSchema)) query: OctoberReturnsReadinessDto,
  ) {
    return this.octoberReturnsService.getStudentIssues(tenant.tenant_id, query.academic_year);
  }

  // ─── P-POD/POD ────────────────────────────────────────────────────────────

  // GET /v1/regulatory/ppod/status
  @Get('ppod/status')
  @RequiresPermission('regulatory.manage_ppod')
  async getPpodStatus(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(ppodDatabaseTypeQuerySchema)) query: PpodDatabaseTypeQueryDto,
  ) {
    return this.ppodService.getSyncStatus(tenant.tenant_id, query.database_type as PodDatabaseType);
  }

  // GET /v1/regulatory/ppod/students
  @Get('ppod/students')
  @RequiresPermission('regulatory.manage_ppod')
  async listPpodStudents(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(ppodStudentsQuerySchema)) query: PpodStudentsQueryDto,
  ) {
    return this.ppodService.listMappedStudents(
      tenant.tenant_id,
      query.database_type as PodDatabaseType,
      query.page,
      query.pageSize,
    );
  }

  // GET /v1/regulatory/ppod/sync-log
  @Get('ppod/sync-log')
  @RequiresPermission('regulatory.manage_ppod')
  async getPpodSyncLog(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(ppodSyncLogQuerySchema)) query: PpodSyncLogQueryDto,
  ) {
    return this.ppodService.getSyncLog(
      tenant.tenant_id,
      query.database_type as PodDatabaseType | undefined,
      query.page,
      query.pageSize,
    );
  }

  // GET /v1/regulatory/ppod/diff
  @Get('ppod/diff')
  @RequiresPermission('regulatory.manage_ppod')
  async getPpodDiff(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(ppodDatabaseTypeQuerySchema)) query: PpodDatabaseTypeQueryDto,
  ) {
    return this.ppodService.previewDiff(tenant.tenant_id, query.database_type as PodDatabaseType);
  }

  // POST /v1/regulatory/ppod/import
  @Post('ppod/import')
  @RequiresPermission('regulatory.manage_ppod')
  @HttpCode(HttpStatus.OK)
  async importFromPpod(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(ppodImportSchema)) dto: PpodImportDto,
  ) {
    return this.ppodService.importFromPpod(tenant.tenant_id, user.sub, dto);
  }

  // POST /v1/regulatory/ppod/export-csv
  @Post('ppod/export-csv')
  @RequiresPermission('regulatory.manage_ppod')
  @HttpCode(HttpStatus.OK)
  async exportForPpod(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(ppodExportSchema)) dto: PpodExportDto,
  ) {
    return this.ppodService.exportForPpod(tenant.tenant_id, user.sub, dto);
  }

  // POST /v1/regulatory/ppod/sync
  @Post('ppod/sync')
  @RequiresPermission('regulatory.manage_ppod')
  @HttpCode(HttpStatus.OK)
  async syncPpod(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(ppodExportSchema)) dto: PpodExportDto,
  ) {
    return this.ppodService.exportForPpod(tenant.tenant_id, user.sub, dto);
  }

  // POST /v1/regulatory/ppod/sync/:studentId
  @Post('ppod/sync/:studentId')
  @RequiresPermission('regulatory.manage_ppod')
  @HttpCode(HttpStatus.OK)
  async syncPpodStudent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body(new ZodValidationPipe(ppodSyncStudentBodySchema)) body: PpodSyncStudentBodyDto,
  ) {
    return this.ppodService.syncSingleStudent(
      tenant.tenant_id,
      studentId,
      user.sub,
      body.database_type as PodDatabaseType,
    );
  }

  // ─── CBA Sync ─────────────────────────────────────────────────────────────

  // GET /v1/regulatory/cba/status
  @Get('cba/status')
  @RequiresPermission('regulatory.manage_ppod')
  async getCbaStatus(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(cbaStatusQuerySchema)) query: CbaStatusQueryDto,
  ) {
    return this.cbaService.getCbaStatus(tenant.tenant_id, query.academic_year);
  }

  // GET /v1/regulatory/cba/pending
  @Get('cba/pending')
  @RequiresPermission('regulatory.manage_ppod')
  async getCbaPending(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(cbaPendingQuerySchema)) query: CbaPendingQueryDto,
  ) {
    return this.cbaService.getPendingResults(
      tenant.tenant_id,
      query.academic_year,
      query.page,
      query.pageSize,
    );
  }

  // POST /v1/regulatory/cba/sync
  @Post('cba/sync')
  @RequiresPermission('regulatory.manage_ppod')
  @HttpCode(HttpStatus.OK)
  async syncCba(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(cbaSyncSchema)) dto: CbaSyncDto,
  ) {
    return this.cbaService.syncExport(tenant.tenant_id, user.sub, dto);
  }

  // POST /v1/regulatory/cba/sync/:studentId
  @Post('cba/sync/:studentId')
  @RequiresPermission('regulatory.manage_ppod')
  @HttpCode(HttpStatus.OK)
  async syncCbaStudent(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Body(new ZodValidationPipe(cbaSyncSchema)) dto: CbaSyncDto,
  ) {
    return this.cbaService.syncStudent(tenant.tenant_id, studentId, dto, user.sub);
  }

  // ─── Transfers ────────────────────────────────────────────────────────────

  // GET /v1/regulatory/transfers
  @Get('transfers')
  @RequiresPermission('regulatory.manage_ppod')
  async listTransfers(
    @CurrentTenant() tenant: TenantContext,
    @Query(new ZodValidationPipe(listTransfersQuerySchema)) query: ListTransfersQueryDto,
  ) {
    return this.transfersService.findAll(tenant.tenant_id, query);
  }

  // POST /v1/regulatory/transfers
  @Post('transfers')
  @RequiresPermission('regulatory.manage_ppod')
  @HttpCode(HttpStatus.CREATED)
  async createTransfer(
    @CurrentTenant() tenant: TenantContext,
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createTransferSchema)) dto: CreateTransferDto,
  ) {
    return this.transfersService.create(tenant.tenant_id, user.sub, dto);
  }

  // GET /v1/regulatory/transfers/:id
  @Get('transfers/:id')
  @RequiresPermission('regulatory.manage_ppod')
  async getTransfer(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.transfersService.findOne(tenant.tenant_id, id);
  }

  // PATCH /v1/regulatory/transfers/:id
  @Patch('transfers/:id')
  @RequiresPermission('regulatory.manage_ppod')
  async updateTransfer(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTransferSchema)) dto: UpdateTransferDto,
  ) {
    return this.transfersService.update(tenant.tenant_id, id, dto);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private validateDesFileType(fileType: string): asserts fileType is DesFileType {
    if (!(DES_FILE_TYPES as readonly string[]).includes(fileType)) {
      throw new BadRequestException({
        code: 'INVALID_DES_FILE_TYPE',
        message: `Invalid DES file type "${fileType}". Must be one of: ${DES_FILE_TYPES.join(', ')}`,
      });
    }
  }
}
