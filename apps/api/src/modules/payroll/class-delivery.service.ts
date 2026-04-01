import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  AutoPopulateDeliveryDto,
  CalculateClassesTaughtDto,
  ClassDeliveryQueryDto,
  ConfirmDeliveryDto,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClassDeliveryService {
  private readonly logger = new Logger(ClassDeliveryService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Auto-populate class delivery records from schedule entries for a given month.
   * Creates a 'delivered' record for each scheduled class on each teaching day.
   * Idempotent — skips records that already exist.
   */
  async autoPopulateFromSchedule(tenantId: string, userId: string, dto: AutoPopulateDeliveryDto) {
    const firstDay = new Date(dto.year, dto.month - 1, 1);
    const lastDay = new Date(dto.year, dto.month, 0);

    // Fetch active schedules for the month
    const schedules = await this.prisma.schedule.findMany({
      where: {
        tenant_id: tenantId,
        effective_start_date: { lte: lastDay },
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: firstDay } }],
      },
      select: {
        id: true,
        teacher_staff_id: true,
        weekday: true,
      },
    });

    if (schedules.length === 0) {
      return { created: 0, skipped: 0, message: 'No active schedules found for this period' };
    }

    // Get school closures in the range
    const closures = await this.prisma.schoolClosure.findMany({
      where: {
        tenant_id: tenantId,
        closure_date: { gte: firstDay, lte: lastDay },
      },
      select: { closure_date: true },
    });

    const closureDates = new Set(
      closures.map((c) => c.closure_date.toISOString().split('T')[0] ?? ''),
    );

    // Group schedules by weekday
    const schedulesByDay = new Map<number, Array<{ id: string; teacher_staff_id: string }>>();
    for (const sched of schedules) {
      if (sched.teacher_staff_id === null) continue;
      const dayNum = sched.weekday;
      if (!schedulesByDay.has(dayNum)) {
        schedulesByDay.set(dayNum, []);
      }
      schedulesByDay.get(dayNum)!.push({
        id: sched.id,
        teacher_staff_id: sched.teacher_staff_id,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    let created = 0;
    let skipped = 0;

    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // Iterate over each day in the month
      const current = new Date(firstDay);
      while (current <= lastDay) {
        const dateStr = current.toISOString().split('T')[0] ?? '';
        const dayOfWeek = current.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

        if (!closureDates.has(dateStr) && schedulesByDay.has(dayOfWeek)) {
          const daySchedules = schedulesByDay.get(dayOfWeek)!;

          for (const sched of daySchedules) {
            const exists = await db.classDeliveryRecord.findUnique({
              where: {
                idx_class_delivery_unique: {
                  tenant_id: tenantId,
                  staff_profile_id: sched.teacher_staff_id,
                  schedule_id: sched.id,
                  delivery_date: new Date(dateStr),
                },
              },
            });

            if (exists) {
              skipped++;
            } else {
              await db.classDeliveryRecord.create({
                data: {
                  tenant_id: tenantId,
                  staff_profile_id: sched.teacher_staff_id,
                  schedule_id: sched.id,
                  delivery_date: new Date(dateStr),
                  status: 'delivered',
                  confirmed_by_user_id: userId,
                },
              });
              created++;
            }
          }
        }

        current.setDate(current.getDate() + 1);
      }
    });

    this.logger.log(
      `Auto-populated class delivery: ${created} created, ${skipped} skipped for ${dto.month}/${dto.year} tenant=${tenantId}`,
    );
    return { created, skipped, month: dto.month, year: dto.year };
  }

  async confirmDelivery(
    tenantId: string,
    recordId: string,
    userId: string,
    dto: ConfirmDeliveryDto,
  ) {
    const record = await this.prisma.classDeliveryRecord.findFirst({
      where: { id: recordId, tenant_id: tenantId },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'CLASS_DELIVERY_RECORD_NOT_FOUND',
        message: `Class delivery record "${recordId}" not found`,
      });
    }

    return this.prisma.classDeliveryRecord.update({
      where: { id: recordId },
      data: {
        status: dto.status,
        substitute_staff_id: dto.substitute_staff_id ?? null,
        notes: dto.notes ?? null,
        confirmed_by_user_id: userId,
      },
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
  }

  async getDeliveryRecords(tenantId: string, query: ClassDeliveryQueryDto) {
    const { staff_profile_id, month, year, date_from, date_to, page, pageSize } = query;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenant_id: tenantId };

    if (staff_profile_id) {
      where.staff_profile_id = staff_profile_id;
    }

    if (date_from != null || date_to != null) {
      where.delivery_date = {};
      if (date_from != null)
        (where.delivery_date as Record<string, unknown>).gte = new Date(date_from!);
      if (date_to != null)
        (where.delivery_date as Record<string, unknown>).lte = new Date(date_to!);
    } else if (month && year) {
      const firstDay = new Date(year, month - 1, 1);
      const lastDay = new Date(year, month, 0);
      where.delivery_date = { gte: firstDay, lte: lastDay };
    }

    const [data, total] = await Promise.all([
      this.prisma.classDeliveryRecord.findMany({
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
        orderBy: [{ delivery_date: 'asc' }],
      }),
      this.prisma.classDeliveryRecord.count({ where }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  async calculateClassesTaught(tenantId: string, dto: CalculateClassesTaughtDto) {
    const records = await this.prisma.classDeliveryRecord.findMany({
      where: {
        tenant_id: tenantId,
        staff_profile_id: dto.staff_profile_id,
        delivery_date: {
          gte: new Date(dto.date_from),
          lte: new Date(dto.date_to),
        },
      },
    });

    const classesTaught = records.filter((r) => r.status === 'delivered').length;
    const absentCovered = records.filter((r) => r.status === 'absent_covered').length;
    const absentUncovered = records.filter((r) => r.status === 'absent_uncovered').length;
    const cancelled = records.filter((r) => r.status === 'cancelled').length;

    return {
      staff_profile_id: dto.staff_profile_id,
      date_from: dto.date_from,
      date_to: dto.date_to,
      classes_taught: classesTaught,
      breakdown: {
        delivered: classesTaught,
        absent_covered: absentCovered,
        absent_uncovered: absentUncovered,
        cancelled,
        total_scheduled: records.length,
      },
    };
  }
}
