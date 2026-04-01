import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AttendanceAlertStatus, AttendanceAlertType } from '@prisma/client';
import type { Response } from 'express';
import { z } from 'zod';

import {
  createAttendanceSessionSchema,
  saveAttendanceRecordsSchema,
  amendAttendanceRecordSchema,
  defaultPresentUploadSchema,
  quickMarkSchema,
  scanConfirmSchema,
  uploadUndoSchema,
} from '@school/shared';
import type { JwtPayload } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ModuleEnabled } from '../../common/decorators/module-enabled.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { ModuleEnabledGuard } from '../../common/guards/module-enabled.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { PrismaService } from '../prisma/prisma.service';

import { AttendancePatternService } from './attendance-pattern.service';
import { AttendanceScanService } from './attendance-scan.service';
import { AttendanceUploadService } from './attendance-upload.service';
import { AttendanceService } from './attendance.service';
import { DailySummaryService } from './daily-summary.service';

// ─── Query Schemas ────────────────────────────────────────────────────────

const listSessionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  session_date: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  class_id: z.string().uuid().optional(),
  status: z.enum(['open', 'submitted', 'locked', 'cancelled']).optional(),
});

const listSummariesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  derived_status: z.enum(['present', 'partially_absent', 'absent', 'late', 'excused']).optional(),
});

const dateRangeQuerySchema = z.object({
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

const exceptionsQuerySchema = z.object({
  date: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
});

const uploadTemplateQuerySchema = z.object({
  session_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'session_date must be in YYYY-MM-DD format'),
});

const uploadBodySchema = z.object({
  session_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'session_date must be in YYYY-MM-DD format'),
});

const listPatternAlertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(AttendanceAlertStatus).optional(),
  alert_type: z.nativeEnum(AttendanceAlertType).optional(),
});

interface UploadedFileShape {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const scanBodySchema = z.object({
  session_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'session_date must be in YYYY-MM-DD format'),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
    private readonly attendancePatternService: AttendancePatternService,
    private readonly attendanceScanService: AttendanceScanService,
    private readonly attendanceUploadService: AttendanceUploadService,
    private readonly dailySummaryService: DailySummaryService,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Attendance Sessions ──────────────────────────────────────────────

  @Post('attendance-sessions')
  @RequiresPermission('attendance.take')
  @HttpCode(HttpStatus.CREATED)
  async createSession(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createAttendanceSessionSchema))
    dto: z.infer<typeof createAttendanceSessionSchema>,
  ) {
    const { permissions, staffProfileId } = await this.getUserContext(user, tenant.tenant_id);

    return this.attendanceService.createSession(
      tenant.tenant_id,
      user.sub,
      dto,
      permissions,
      staffProfileId,
    );
  }

  @Get('attendance-sessions')
  @RequiresPermission('attendance.view')
  async findAllSessions(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listSessionsQuerySchema))
    query: z.infer<typeof listSessionsQuerySchema>,
  ) {
    // Check if user is teacher-only (has attendance.take but not attendance.manage)
    const { permissions, staffProfileId } = await this.getUserContext(user, tenant.tenant_id);
    const hasManage = permissions.includes('attendance.manage');

    return this.attendanceService.findAllSessions(
      tenant.tenant_id,
      query,
      hasManage ? undefined : staffProfileId,
    );
  }

  @Get('attendance-sessions/:id')
  @RequiresPermission('attendance.view')
  async findOneSession(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attendanceService.findOneSession(tenant.tenant_id, id);
  }

  @Patch('attendance-sessions/:id/cancel')
  @RequiresPermission('attendance.manage')
  async cancelSession(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attendanceService.cancelSession(tenant.tenant_id, id);
  }

  // ─── Attendance Records ─────────────────────────────────────────────────

  @Put('attendance-sessions/:sessionId/records')
  @RequiresPermission('attendance.take')
  async saveRecords(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Body(new ZodValidationPipe(saveAttendanceRecordsSchema))
    dto: z.infer<typeof saveAttendanceRecordsSchema>,
  ) {
    return this.attendanceService.saveRecords(tenant.tenant_id, sessionId, user.sub, dto);
  }

  @Patch('attendance-sessions/:sessionId/submit')
  @RequiresPermission('attendance.take')
  async submitSession(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.attendanceService.submitSession(tenant.tenant_id, sessionId, user.sub);
  }

  @Patch('attendance-records/:id/amend')
  @RequiresPermission('attendance.amend_historical')
  async amendRecord(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(amendAttendanceRecordSchema))
    dto: z.infer<typeof amendAttendanceRecordSchema>,
  ) {
    return this.attendanceService.amendRecord(tenant.tenant_id, id, user.sub, dto);
  }

  // ─── Daily Summaries ────────────────────────────────────────────────────

  @Get('attendance/daily-summaries')
  @RequiresPermission('attendance.view')
  async findAllSummaries(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listSummariesQuerySchema))
    query: z.infer<typeof listSummariesQuerySchema>,
  ) {
    return this.dailySummaryService.findAll(tenant.tenant_id, query);
  }

  @Get('attendance/daily-summaries/student/:studentId')
  @RequiresPermission('attendance.view')
  async findStudentSummaries(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(dateRangeQuerySchema))
    query: z.infer<typeof dateRangeQuerySchema>,
  ) {
    return this.dailySummaryService.findForStudent(tenant.tenant_id, studentId, query);
  }

  // ─── Exceptions ─────────────────────────────────────────────────────────

  @Get('attendance/exceptions')
  @RequiresPermission('attendance.manage')
  async getExceptions(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(exceptionsQuerySchema))
    query: z.infer<typeof exceptionsQuerySchema>,
  ) {
    return this.attendanceService.getExceptions(tenant.tenant_id, query);
  }

  // ─── Parent Attendance ──────────────────────────────────────────────────

  @Get('parent/students/:studentId/attendance')
  @RequiresPermission('parent.view_attendance')
  async getParentStudentAttendance(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(dateRangeQuerySchema))
    query: z.infer<typeof dateRangeQuerySchema>,
  ) {
    return this.attendanceService.getParentStudentAttendance(
      tenant.tenant_id,
      user.sub,
      studentId,
      query,
    );
  }

  // ─── Bulk Upload ──────────────────────────────────────────────────────

  @Get('attendance/upload-template')
  @RequiresPermission('attendance.manage')
  async downloadTemplate(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(uploadTemplateQuerySchema))
    query: z.infer<typeof uploadTemplateQuerySchema>,
    @Res() res: Response,
  ) {
    const csv = await this.attendanceUploadService.generateTemplate(
      tenant.tenant_id,
      query.session_date,
    );

    const filename = `attendance-${query.session_date}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Post('attendance/upload')
  @RequiresPermission('attendance.manage')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAttendance(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: UploadedFileShape | undefined,
    @Body(new ZodValidationPipe(uploadBodySchema))
    body: z.infer<typeof uploadBodySchema>,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: 'FILE_REQUIRED',
        message: 'A file must be uploaded',
      });
    }

    const ext = file.originalname.toLowerCase().split('.').pop();
    const isValidType =
      ext === 'csv' ||
      ext === 'xlsx' ||
      ext === 'xls' ||
      file.mimetype.includes('csv') ||
      file.mimetype.includes('spreadsheet') ||
      file.mimetype.includes('excel');

    if (!isValidType) {
      throw new BadRequestException({
        code: 'INVALID_FILE_TYPE',
        message: 'Only CSV (.csv) and Excel (.xlsx, .xls) files are accepted',
      });
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException({
        code: 'FILE_TOO_LARGE',
        message: 'File size must not exceed 10MB',
      });
    }

    return this.attendanceUploadService.processUpload(
      tenant.tenant_id,
      user.sub,
      file.buffer,
      file.originalname,
      body.session_date,
    );
  }

  // ─── Exceptions-Only Upload ──────────────────────────────────────────

  @Post('attendance/exceptions-upload')
  @RequiresPermission('attendance.manage')
  @HttpCode(HttpStatus.OK)
  async exceptionsUpload(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(defaultPresentUploadSchema))
    body: z.infer<typeof defaultPresentUploadSchema>,
  ) {
    return this.attendanceUploadService.processExceptionsUpload(
      tenant.tenant_id,
      user.sub,
      body.session_date,
      body.records,
    );
  }

  @Post('attendance/quick-mark')
  @RequiresPermission('attendance.manage')
  @HttpCode(HttpStatus.OK)
  async quickMark(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(quickMarkSchema))
    body: z.infer<typeof quickMarkSchema>,
  ) {
    const entries = this.attendanceUploadService.parseQuickMarkText(body.text);
    return this.attendanceUploadService.processExceptionsUpload(
      tenant.tenant_id,
      user.sub,
      body.session_date,
      entries,
    );
  }

  @Post('attendance/upload/undo')
  @RequiresPermission('attendance.manage')
  @HttpCode(HttpStatus.OK)
  async undoUpload(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(uploadUndoSchema))
    body: z.infer<typeof uploadUndoSchema>,
  ) {
    return this.attendanceUploadService.undoUpload(tenant.tenant_id, user.sub, body.batch_id);
  }

  // ─── AI Scan ────────────────────────────────────────────────────────────

  @Post('attendance/scan')
  @UseGuards(AuthGuard, PermissionGuard, ModuleEnabledGuard)
  @ModuleEnabled('ai_functions')
  @RequiresPermission('attendance.manage')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('image'))
  async scanAttendanceImage(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: UploadedFileShape | undefined,
    @Body(new ZodValidationPipe(scanBodySchema))
    body: z.infer<typeof scanBodySchema>,
  ) {
    if (!file) {
      throw new BadRequestException({
        error: {
          code: 'FILE_REQUIRED',
          message: 'An image file must be uploaded',
        },
      });
    }

    if (!AttendanceScanService.isAllowedMimeType(file.mimetype)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_FILE_TYPE',
          message: 'Only image files are accepted (JPEG, PNG, GIF, WebP)',
        },
      });
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException({
        error: {
          code: 'FILE_TOO_LARGE',
          message: 'Image size must not exceed 10MB',
        },
      });
    }

    return this.attendanceScanService.scanImage(
      tenant.tenant_id,
      user.sub,
      file.buffer,
      file.mimetype,
      body.session_date,
    );
  }

  @Post('attendance/scan/confirm')
  @UseGuards(AuthGuard, PermissionGuard, ModuleEnabledGuard)
  @ModuleEnabled('ai_functions')
  @RequiresPermission('attendance.manage')
  @HttpCode(HttpStatus.OK)
  async confirmScan(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(scanConfirmSchema))
    body: z.infer<typeof scanConfirmSchema>,
  ) {
    return this.attendanceUploadService.processExceptionsUpload(
      tenant.tenant_id,
      user.sub,
      body.session_date,
      body.entries,
    );
  }

  // ─── Pattern Alerts ─────────────────────────────────────────────────────

  @Get('attendance/pattern-alerts')
  @RequiresPermission('attendance.view_pattern_reports')
  async listPatternAlerts(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(listPatternAlertsQuerySchema))
    query: z.infer<typeof listPatternAlertsQuerySchema>,
  ) {
    return this.attendancePatternService.listAlerts(tenant.tenant_id, query);
  }

  @Patch('attendance/pattern-alerts/:id/acknowledge')
  @RequiresPermission('attendance.view_pattern_reports')
  async acknowledgePatternAlert(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attendancePatternService.acknowledgeAlert(tenant.tenant_id, id, user.sub);
  }

  @Patch('attendance/pattern-alerts/:id/resolve')
  @RequiresPermission('attendance.view_pattern_reports')
  async resolvePatternAlert(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attendancePatternService.resolveAlert(tenant.tenant_id, id);
  }

  @Post('attendance/pattern-alerts/:id/notify-parent')
  @RequiresPermission('attendance.view_pattern_reports')
  @HttpCode(HttpStatus.OK)
  async notifyParentManual(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.attendancePatternService.notifyParentManual(tenant.tenant_id, id);
  }

  // ─── Private Helpers ────────────────────────────────────────────────────

  /**
   * Resolve the current user's permissions and staff profile ID.
   */
  private async getUserContext(
    user: JwtPayload,
    tenantId: string,
  ): Promise<{ permissions: string[]; staffProfileId?: string }> {
    const permissions = user.membership_id
      ? await this.permissionCacheService.getPermissions(user.membership_id)
      : [];

    const staffProfile = await this.prisma.staffProfile.findFirst({
      where: { user_id: user.sub, tenant_id: tenantId },
      select: { id: true },
    });

    return {
      permissions,
      staffProfileId: staffProfile?.id,
    };
  }
}
