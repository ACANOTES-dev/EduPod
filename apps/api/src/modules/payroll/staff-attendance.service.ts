import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BulkMarkAttendanceDto,
  CalculateDaysWorkedDto,
  MarkAttendanceDto,
  StaffAttendanceQueryDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StaffAttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  async markAttendance(
    tenantId: string,
    userId: string,
    dto: MarkAttendanceDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Upsert — idempotent so re-marking is allowed
      const existing = await db.staffAttendanceRecord.findUnique({
        where: {
          idx_staff_attendance_unique: {
            tenant_id: tenantId,
            staff_profile_id: dto.staff_profile_id,
            date: new Date(dto.date),
          },
        },
      });

      if (existing) {
        return db.staffAttendanceRecord.update({
          where: { id: existing.id },
          data: {
            status: dto.status,
            notes: dto.notes ?? null,
            marked_by_user_id: userId,
          },
        });
      }

      return db.staffAttendanceRecord.create({
        data: {
          tenant_id: tenantId,
          staff_profile_id: dto.staff_profile_id,
          date: new Date(dto.date),
          status: dto.status,
          notes: dto.notes ?? null,
          marked_by_user_id: userId,
        },
      });
    });
  }

  async bulkMarkAttendance(
    tenantId: string,
    userId: string,
    dto: BulkMarkAttendanceDto,
  ) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    const dateObj = new Date(dto.date);

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const results: Array<{ staff_profile_id: string; status: string }> = [];

      for (const record of dto.records) {
        const existing = await db.staffAttendanceRecord.findUnique({
          where: {
            idx_staff_attendance_unique: {
              tenant_id: tenantId,
              staff_profile_id: record.staff_profile_id,
              date: dateObj,
            },
          },
        });

        if (existing) {
          await db.staffAttendanceRecord.update({
            where: { id: existing.id },
            data: {
              status: record.status,
              notes: record.notes ?? null,
              marked_by_user_id: userId,
            },
          });
        } else {
          await db.staffAttendanceRecord.create({
            data: {
              tenant_id: tenantId,
              staff_profile_id: record.staff_profile_id,
              date: dateObj,
              status: record.status,
              notes: record.notes ?? null,
              marked_by_user_id: userId,
            },
          });
        }

        results.push({
          staff_profile_id: record.staff_profile_id,
          status: record.status,
        });
      }

      return { date: dto.date, processed: results.length, records: results };
    });
  }

  async getDailyAttendance(
    tenantId: string,
    query: StaffAttendanceQueryDto,
  ) {
    const { date, page, pageSize } = query;

    if (!date) {
      throw new NotFoundException({
        code: 'DATE_REQUIRED',
        message: 'date query parameter is required for daily attendance view',
      });
    }

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      date: new Date(date),
    };

    if (query.staff_profile_id) {
      where.staff_profile_id = query.staff_profile_id;
    }

    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.prisma.staffAttendanceRecord.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          staff_profile: {
            select: {
              id: true,
              staff_number: true,
              job_title: true,
              department: true,
              user: { select: { first_name: true, last_name: true } },
            },
          },
        },
        orderBy: [{ staff_profile: { user: { last_name: 'asc' } } }],
      }),
      this.prisma.staffAttendanceRecord.count({ where }),
    ]);

    return {
      data: data.map((r) => this.serializeRecord(r)),
      meta: { page, pageSize, total },
    };
  }

  async getMonthlyAttendance(
    tenantId: string,
    query: StaffAttendanceQueryDto,
  ) {
    const { month, year, staff_profile_id, page, pageSize } = query;
    const effectiveYear = year ?? new Date().getFullYear();
    const effectiveMonth = month ?? new Date().getMonth() + 1;

    const firstDay = new Date(effectiveYear, effectiveMonth - 1, 1);
    const lastDay = new Date(effectiveYear, effectiveMonth, 0);

    const where: Record<string, unknown> = {
      tenant_id: tenantId,
      date: { gte: firstDay, lte: lastDay },
    };

    if (staff_profile_id) {
      where.staff_profile_id = staff_profile_id;
    }

    const skip = (page - 1) * pageSize;
    const [data, total] = await Promise.all([
      this.prisma.staffAttendanceRecord.findMany({
        where,
        skip,
        take: pageSize,
        include: {
          staff_profile: {
            select: {
              id: true,
              staff_number: true,
              user: { select: { first_name: true, last_name: true } },
            },
          },
        },
        orderBy: [{ date: 'asc' }],
      }),
      this.prisma.staffAttendanceRecord.count({ where }),
    ]);

    return {
      data: data.map((r) => this.serializeRecord(r)),
      meta: { page, pageSize, total, month: effectiveMonth, year: effectiveYear },
    };
  }

  async calculateDaysWorked(
    tenantId: string,
    dto: CalculateDaysWorkedDto,
  ) {
    const records = await this.prisma.staffAttendanceRecord.findMany({
      where: {
        tenant_id: tenantId,
        staff_profile_id: dto.staff_profile_id,
        date: {
          gte: new Date(dto.date_from),
          lte: new Date(dto.date_to),
        },
      },
    });

    let daysWorked = 0;

    for (const r of records) {
      if (r.status === 'present' || r.status === 'paid_leave' || r.status === 'sick_leave') {
        daysWorked += 1;
      } else if (r.status === 'half_day') {
        daysWorked += 0.5;
      }
      // absent and unpaid_leave contribute 0
    }

    return {
      staff_profile_id: dto.staff_profile_id,
      date_from: dto.date_from,
      date_to: dto.date_to,
      days_worked: daysWorked,
      breakdown: {
        present: records.filter((r) => r.status === 'present').length,
        half_day: records.filter((r) => r.status === 'half_day').length,
        paid_leave: records.filter((r) => r.status === 'paid_leave').length,
        sick_leave: records.filter((r) => r.status === 'sick_leave').length,
        absent: records.filter((r) => r.status === 'absent').length,
        unpaid_leave: records.filter((r) => r.status === 'unpaid_leave').length,
        total_records: records.length,
      },
    };
  }

  async getRecord(tenantId: string, recordId: string) {
    const record = await this.prisma.staffAttendanceRecord.findFirst({
      where: { id: recordId, tenant_id: tenantId },
      include: {
        staff_profile: {
          select: {
            id: true,
            staff_number: true,
            user: { select: { first_name: true, last_name: true } },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'ATTENDANCE_RECORD_NOT_FOUND',
        message: `Attendance record "${recordId}" not found`,
      });
    }

    return this.serializeRecord(record);
  }

  async deleteRecord(tenantId: string, recordId: string) {
    const record = await this.prisma.staffAttendanceRecord.findFirst({
      where: { id: recordId, tenant_id: tenantId },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'ATTENDANCE_RECORD_NOT_FOUND',
        message: `Attendance record "${recordId}" not found`,
      });
    }

    await this.prisma.staffAttendanceRecord.delete({ where: { id: recordId } });
    return { id: recordId, deleted: true };
  }

  private serializeRecord(record: Record<string, unknown>): Record<string, unknown> {
    return { ...record };
  }
}
