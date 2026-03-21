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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createAttendanceSessionSchema,
  saveAttendanceRecordsSchema,
  amendAttendanceRecordSchema,
} from '@school/shared';
import type { JwtPayload } from '@school/shared';
import { z } from 'zod';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { PrismaService } from '../prisma/prisma.service';

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

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class AttendanceController {
  constructor(
    private readonly attendanceService: AttendanceService,
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
    const { permissions, staffProfileId } = await this.getUserContext(
      user,
      tenant.tenant_id,
    );

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
    const { permissions, staffProfileId } = await this.getUserContext(
      user,
      tenant.tenant_id,
    );
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
    return this.attendanceService.saveRecords(
      tenant.tenant_id,
      sessionId,
      user.sub,
      dto,
    );
  }

  @Patch('attendance-sessions/:sessionId/submit')
  @RequiresPermission('attendance.take')
  async submitSession(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return this.attendanceService.submitSession(
      tenant.tenant_id,
      sessionId,
      user.sub,
    );
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
    return this.attendanceService.amendRecord(
      tenant.tenant_id,
      id,
      user.sub,
      dto,
    );
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
    return this.dailySummaryService.findForStudent(
      tenant.tenant_id,
      studentId,
      query,
    );
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
