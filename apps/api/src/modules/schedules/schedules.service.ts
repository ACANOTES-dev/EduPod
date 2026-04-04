import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { Conflict } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { StaffProfileReadFacade } from '../staff-profiles/staff-profile-read.facade';

import { ConflictDetectionService } from './conflict-detection.service';
import type { CreateScheduleDto, UpdateScheduleDto } from './dto/schedule.dto';

interface ListSchedulesParams {
  page: number;
  pageSize: number;
  academic_year_id?: string;
  class_id?: string;
  teacher_staff_id?: string;
  room_id?: string;
  weekday?: number;
}

interface ScheduleWithConflicts {
  schedule: Record<string, unknown>;
  conflicts: Conflict[];
}

const SCHEDULE_INCLUDE = {
  class_entity: {
    select: {
      id: true,
      name: true,
      subject: { select: { id: true, name: true } },
    },
  },
  room: { select: { id: true, name: true } },
  teacher: {
    select: {
      id: true,
      user: { select: { first_name: true, last_name: true } },
    },
  },
  academic_year: { select: { id: true, name: true } },
} as const;

@Injectable()
export class SchedulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conflictDetection: ConflictDetectionService,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly roomsReadFacade: RoomsReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly attendanceReadFacade: AttendanceReadFacade,
  ) {}

  async create(
    tenantId: string,
    userId: string,
    dto: CreateScheduleDto,
    userPermissions: string[],
  ): Promise<ScheduleWithConflicts> {
    // Validate class exists and belongs to tenant
    const classEntity = await this.classesReadFacade.findById(tenantId, dto.class_id);

    if (!classEntity) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${dto.class_id}" not found`,
      });
    }

    const academicYearId = classEntity.academic_year_id;

    // Validate room exists and belongs to tenant
    if (dto.room_id) {
      await this.roomsReadFacade.existsOrThrow(tenantId, dto.room_id);
    }

    // Validate teacher exists and belongs to tenant
    if (dto.teacher_staff_id) {
      await this.staffProfileReadFacade.existsOrThrow(tenantId, dto.teacher_staff_id);
    }

    // Detect conflicts
    const { hard, soft } = await this.conflictDetection.detectConflicts(tenantId, {
      class_id: dto.class_id,
      academic_year_id: academicYearId,
      room_id: dto.room_id ?? null,
      teacher_staff_id: dto.teacher_staff_id ?? null,
      weekday: dto.weekday,
      start_time: dto.start_time,
      end_time: dto.end_time,
      effective_start_date: dto.effective_start_date,
      effective_end_date: dto.effective_end_date ?? null,
    });

    // If hard conflicts exist and override is not requested, reject
    if (hard.length > 0 && !dto.override_conflicts) {
      throw new ConflictException({
        code: 'SCHEDULE_CONFLICT',
        message: 'Hard conflicts detected. Set override_conflicts=true to force.',
        conflicts: [...hard, ...soft],
      });
    }

    // If override requested, check permission
    if (hard.length > 0 && dto.override_conflicts) {
      if (!userPermissions.includes('schedule.override_conflict')) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'Missing required permission: schedule.override_conflict',
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const schedule = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedule.create({
        data: {
          tenant_id: tenantId,
          class_id: dto.class_id,
          academic_year_id: academicYearId,
          room_id: dto.room_id ?? null,
          teacher_staff_id: dto.teacher_staff_id ?? null,
          weekday: dto.weekday,
          start_time: this.timeToDate(dto.start_time),
          end_time: this.timeToDate(dto.end_time),
          effective_start_date: new Date(dto.effective_start_date),
          effective_end_date: dto.effective_end_date ? new Date(dto.effective_end_date) : null,
          source: 'manual',
          is_pinned: false,
        },
        include: SCHEDULE_INCLUDE,
      });
    });

    return {
      schedule: schedule as unknown as Record<string, unknown>,
      conflicts: [...hard, ...soft],
    };
  }

  async findAll(tenantId: string, params: ListSchedulesParams, userStaffProfileId?: string) {
    const { page, pageSize, academic_year_id, class_id, teacher_staff_id, room_id, weekday } =
      params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ScheduleWhereInput = { tenant_id: tenantId };

    if (academic_year_id) where.academic_year_id = academic_year_id;
    if (class_id) where.class_id = class_id;
    if (room_id) where.room_id = room_id;
    if (weekday !== undefined) where.weekday = weekday;

    // If scoped to a specific teacher (view_own), override any teacher filter
    if (userStaffProfileId) {
      where.teacher_staff_id = userStaffProfileId;
    } else if (teacher_staff_id) {
      where.teacher_staff_id = teacher_staff_id;
    }

    const [data, total] = await Promise.all([
      this.prisma.schedule.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ weekday: 'asc' }, { start_time: 'asc' }],
        include: SCHEDULE_INCLUDE,
      }),
      this.prisma.schedule.count({ where }),
    ]);

    return {
      data: data.map((s) => this.formatSchedule(s)),
      meta: { page, pageSize, total },
    };
  }

  async findOne(tenantId: string, id: string) {
    const schedule = await this.prisma.schedule.findFirst({
      where: { id, tenant_id: tenantId },
      include: SCHEDULE_INCLUDE,
    });

    if (!schedule) {
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: `Schedule with id "${id}" not found`,
      });
    }

    return this.formatSchedule(schedule);
  }

  async update(
    tenantId: string,
    id: string,
    userId: string,
    dto: UpdateScheduleDto,
    userPermissions: string[],
  ): Promise<ScheduleWithConflicts> {
    const existing = await this.prisma.schedule.findFirst({
      where: { id, tenant_id: tenantId },
      select: {
        id: true,
        class_id: true,
        academic_year_id: true,
        room_id: true,
        teacher_staff_id: true,
        weekday: true,
        start_time: true,
        end_time: true,
        effective_start_date: true,
        effective_end_date: true,
      },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: `Schedule with id "${id}" not found`,
      });
    }

    // Validate room if being changed
    if (dto.room_id !== undefined && dto.room_id !== null) {
      await this.roomsReadFacade.existsOrThrow(tenantId, dto.room_id);
    }

    // Validate teacher if being changed
    if (dto.teacher_staff_id !== undefined && dto.teacher_staff_id !== null) {
      await this.staffProfileReadFacade.existsOrThrow(tenantId, dto.teacher_staff_id);
    }

    // Merge existing values with update to build full entry for conflict detection
    const mergedEntry = {
      class_id: existing.class_id,
      academic_year_id: existing.academic_year_id,
      room_id: dto.room_id !== undefined ? dto.room_id : existing.room_id,
      teacher_staff_id:
        dto.teacher_staff_id !== undefined ? dto.teacher_staff_id : existing.teacher_staff_id,
      weekday: dto.weekday ?? existing.weekday,
      start_time: dto.start_time ?? this.formatTime(existing.start_time),
      end_time: dto.end_time ?? this.formatTime(existing.end_time),
      effective_start_date:
        dto.effective_start_date ?? existing.effective_start_date.toISOString().slice(0, 10),
      effective_end_date:
        dto.effective_end_date !== undefined
          ? dto.effective_end_date
          : existing.effective_end_date
            ? existing.effective_end_date.toISOString().slice(0, 10)
            : null,
    };

    // Detect conflicts excluding self
    const { hard, soft } = await this.conflictDetection.detectConflicts(tenantId, mergedEntry, id);

    // If hard conflicts exist and override is not requested, reject
    if (hard.length > 0 && !dto.override_conflicts) {
      throw new ConflictException({
        code: 'SCHEDULE_CONFLICT',
        message: 'Hard conflicts detected. Set override_conflicts=true to force.',
        conflicts: [...hard, ...soft],
      });
    }

    // If override requested, check permission
    if (hard.length > 0 && dto.override_conflicts) {
      if (!userPermissions.includes('schedule.override_conflict')) {
        throw new ForbiddenException({
          code: 'PERMISSION_DENIED',
          message: 'Missing required permission: schedule.override_conflict',
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updateData: Prisma.ScheduleUpdateInput = {};

    if (dto.room_id !== undefined) {
      updateData.room = dto.room_id ? { connect: { id: dto.room_id } } : { disconnect: true };
    }
    if (dto.teacher_staff_id !== undefined) {
      updateData.teacher = dto.teacher_staff_id
        ? { connect: { id: dto.teacher_staff_id } }
        : { disconnect: true };
    }
    if (dto.weekday !== undefined) updateData.weekday = dto.weekday;
    if (dto.start_time !== undefined) updateData.start_time = this.timeToDate(dto.start_time);
    if (dto.end_time !== undefined) updateData.end_time = this.timeToDate(dto.end_time);
    if (dto.effective_start_date !== undefined)
      updateData.effective_start_date = new Date(dto.effective_start_date);
    if (dto.effective_end_date !== undefined)
      updateData.effective_end_date = dto.effective_end_date
        ? new Date(dto.effective_end_date)
        : null;
    if (dto.is_pinned !== undefined) updateData.is_pinned = dto.is_pinned;
    if (dto.pin_reason !== undefined) updateData.pin_reason = dto.pin_reason;

    const schedule = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedule.update({
        where: { id },
        data: updateData,
        include: SCHEDULE_INCLUDE,
      });
    });

    return {
      schedule: schedule as unknown as Record<string, unknown>,
      conflicts: [...hard, ...soft],
    };
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.schedule.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: `Schedule with id "${id}" not found`,
      });
    }

    // Safety check: if attendance sessions reference this schedule, end-date instead of delete
    const attendanceCount = await this.attendanceReadFacade.countSessions(tenantId, {
      scheduleId: id,
    });

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    if (attendanceCount > 0) {
      // End-date the schedule instead of hard delete
      const today = new Date().toISOString().slice(0, 10);
      const updated = (await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.schedule.update({
          where: { id },
          data: { effective_end_date: new Date(today) },
          include: SCHEDULE_INCLUDE,
        });
      })) as Record<string, unknown>;
      return {
        action: 'end_dated' as const,
        schedule: this.formatSchedule(updated),
        message: `Schedule has ${attendanceCount} attendance session(s). End-dated instead of deleted.`,
      };
    }

    // Hard delete
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedule.delete({ where: { id } });
    });

    return { action: 'deleted' as const, message: 'Schedule deleted.' };
  }

  async pin(
    tenantId: string,
    id: string,
    dto: { pin_reason?: string },
  ): Promise<Record<string, unknown>> {
    const existing = await this.prisma.schedule.findFirst({
      where: { id, tenant_id: tenantId },
      include: SCHEDULE_INCLUDE,
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: `Schedule with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const schedule = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedule.update({
        where: { id },
        data: {
          is_pinned: true,
          source: 'pinned',
          pin_reason: dto.pin_reason ?? null,
        },
        include: SCHEDULE_INCLUDE,
      });
    });

    return this.formatSchedule(schedule as unknown as Record<string, unknown>);
  }

  async unpin(tenantId: string, id: string): Promise<Record<string, unknown>> {
    const existing = await this.prisma.schedule.findFirst({
      where: { id, tenant_id: tenantId },
      include: SCHEDULE_INCLUDE,
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: `Schedule with id "${id}" not found`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const schedule = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedule.update({
        where: { id },
        data: {
          is_pinned: false,
          source: 'manual',
          pin_reason: null,
        },
        include: SCHEDULE_INCLUDE,
      });
    });

    return this.formatSchedule(schedule as unknown as Record<string, unknown>);
  }

  async bulkPin(
    tenantId: string,
    dto: { schedule_ids: string[]; pin_reason?: string },
  ): Promise<{ data: Record<string, unknown>[]; meta: { pinned: number } }> {
    // Verify all schedules exist and belong to tenant
    const schedules = await this.prisma.schedule.findMany({
      where: { id: { in: dto.schedule_ids }, tenant_id: tenantId },
      select: { id: true },
    });

    if (schedules.length !== dto.schedule_ids.length) {
      const found = new Set(schedules.map((s) => s.id));
      const missing = dto.schedule_ids.filter((id) => !found.has(id));
      throw new NotFoundException({
        code: 'SCHEDULE_NOT_FOUND',
        message: `Schedules not found: ${missing.join(', ')}`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.schedule.updateMany({
        where: { id: { in: dto.schedule_ids }, tenant_id: tenantId },
        data: {
          is_pinned: true,
          source: 'pinned',
          pin_reason: dto.pin_reason ?? null,
        },
      });

      return db.schedule.findMany({
        where: { id: { in: dto.schedule_ids } },
        include: SCHEDULE_INCLUDE,
      });
    });

    const updatedArr = updated as unknown as Record<string, unknown>[];
    return {
      data: updatedArr.map((s) => this.formatSchedule(s)),
      meta: { pinned: updatedArr.length },
    };
  }

  async endDateForClass(tenantId: string, classId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().slice(0, 10);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Find schedules that are still effective (no end date or end date > today)
      const schedulesToUpdate = await db.schedule.findMany({
        where: {
          class_id: classId,
          tenant_id: tenantId,
          OR: [{ effective_end_date: null }, { effective_end_date: { gt: new Date(todayStr) } }],
        },
        select: { id: true },
      });

      if (schedulesToUpdate.length === 0) return 0;

      const ids = schedulesToUpdate.map((s) => s.id);

      await db.schedule.updateMany({
        where: { id: { in: ids } },
        data: { effective_end_date: new Date(todayStr) },
      });

      return schedulesToUpdate.length;
    })) as number;

    return result;
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Convert an HH:mm string to a Date object suitable for Prisma Time comparison.
   * Prisma stores @db.Time as Date objects anchored to 1970-01-01.
   */
  private timeToDate(timeStr: string): Date {
    return new Date(`1970-01-01T${timeStr}:00.000Z`);
  }

  /**
   * Convert a Prisma Date (from @db.Time) to HH:mm string.
   */
  private formatTime(date: Date): string {
    return date.toISOString().slice(11, 16);
  }

  /**
   * Format a schedule record for API output, converting Time Date objects to HH:mm strings.
   */
  private formatSchedule(schedule: Record<string, unknown>): Record<string, unknown> {
    const result = { ...schedule };
    if (result['start_time'] instanceof Date) {
      result['start_time'] = this.formatTime(result['start_time'] as Date);
    }
    if (result['end_time'] instanceof Date) {
      result['end_time'] = this.formatTime(result['end_time'] as Date);
    }
    if (result['effective_start_date'] instanceof Date) {
      result['effective_start_date'] = (result['effective_start_date'] as Date)
        .toISOString()
        .slice(0, 10);
    }
    if (result['effective_end_date'] instanceof Date) {
      result['effective_end_date'] = (result['effective_end_date'] as Date)
        .toISOString()
        .slice(0, 10);
    }
    return result;
  }
}
