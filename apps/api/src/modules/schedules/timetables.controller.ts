import {
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';

import type { JwtPayload } from '@school/shared';

import { CurrentTenant } from '../../common/decorators/current-tenant.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequiresPermission } from '../../common/decorators/requires-permission.decorator';
import { AuthGuard } from '../../common/guards/auth.guard';
import { PermissionGuard } from '../../common/guards/permission.guard';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { PermissionCacheService } from '../../common/services/permission-cache.service';
import { PrismaService } from '../prisma/prisma.service';

import { TimetablesService } from './timetables.service';

const timetableQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  week_start: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD')
    .optional(),
});

const workloadQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
});

@Controller('v1')
@UseGuards(AuthGuard, PermissionGuard)
export class TimetablesController {
  constructor(
    private readonly timetablesService: TimetablesService,
    private readonly permissionCacheService: PermissionCacheService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('timetables/teacher/:staffProfileId')
  async getTeacherTimetable(
    @CurrentTenant() tenant: { tenant_id: string },
    @CurrentUser() user: JwtPayload,
    @Param('staffProfileId', ParseUUIDPipe) staffProfileId: string,
    @Query(new ZodValidationPipe(timetableQuerySchema))
    query: z.infer<typeof timetableQuerySchema>,
  ) {
    // Allow if user has schedule.manage, OR if viewing own timetable (schedule.view_own)
    const permissions = user.membership_id
      ? await this.permissionCacheService.getPermissions(user.membership_id)
      : [];

    const hasManage = permissions.includes('schedule.manage');
    const hasViewOwn = permissions.includes('schedule.view_own');

    if (!hasManage && !hasViewOwn) {
      throw new ForbiddenException({
        error: {
          code: 'PERMISSION_DENIED',
          message: 'Missing required permission: schedule.manage or schedule.view_own',
        },
      });
    }

    // If only view_own, verify the staffProfileId belongs to the current user
    if (!hasManage && hasViewOwn) {
      const isOwn = await this.isOwnStaffProfile(tenant.tenant_id, user.sub, staffProfileId);
      if (!isOwn) {
        throw new ForbiddenException({
          error: {
            code: 'PERMISSION_DENIED',
            message: 'You can only view your own timetable',
          },
        });
      }
    }

    return this.timetablesService.getTeacherTimetable(tenant.tenant_id, staffProfileId, {
      academic_year_id: query.academic_year_id,
      week_start: query.week_start,
    });
  }

  @Get('timetables/room/:roomId')
  @RequiresPermission('schedule.manage')
  async getRoomTimetable(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('roomId', ParseUUIDPipe) roomId: string,
    @Query(new ZodValidationPipe(timetableQuerySchema))
    query: z.infer<typeof timetableQuerySchema>,
  ) {
    return this.timetablesService.getRoomTimetable(tenant.tenant_id, roomId, {
      academic_year_id: query.academic_year_id,
      week_start: query.week_start,
    });
  }

  @Get('timetables/student/:studentId')
  @RequiresPermission('students.view')
  async getStudentTimetable(
    @CurrentTenant() tenant: { tenant_id: string },
    @Param('studentId', ParseUUIDPipe) studentId: string,
    @Query(new ZodValidationPipe(timetableQuerySchema))
    query: z.infer<typeof timetableQuerySchema>,
  ) {
    return this.timetablesService.getStudentTimetable(tenant.tenant_id, studentId, {
      academic_year_id: query.academic_year_id,
      week_start: query.week_start,
    });
  }

  @Get('reports/workload')
  @RequiresPermission('schedule.manage')
  async getWorkloadReport(
    @CurrentTenant() tenant: { tenant_id: string },
    @Query(new ZodValidationPipe(workloadQuerySchema))
    query: z.infer<typeof workloadQuerySchema>,
  ) {
    return this.timetablesService.getWorkloadReport(tenant.tenant_id, query.academic_year_id);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Check if the given staffProfileId belongs to the current user within the tenant.
   */
  private async isOwnStaffProfile(
    tenantId: string,
    userId: string,
    staffProfileId: string,
  ): Promise<boolean> {
    const profile = await this.prisma.staffProfile.findFirst({
      where: {
        id: staffProfileId,
        tenant_id: tenantId,
        user_id: userId,
      },
      select: { id: true },
    });
    return profile !== null;
  }
}
