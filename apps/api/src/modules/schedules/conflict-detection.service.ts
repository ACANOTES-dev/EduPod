import { Injectable } from '@nestjs/common';
import type { Conflict } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

interface ProposedEntry {
  class_id: string;
  academic_year_id: string;
  room_id?: string | null;
  teacher_staff_id?: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  effective_start_date: string;
  effective_end_date?: string | null;
}

@Injectable()
export class ConflictDetectionService {
  constructor(private readonly prisma: PrismaService) {}

  async detectConflicts(
    tenantId: string,
    entry: ProposedEntry,
    excludeId?: string,
  ): Promise<{ hard: Conflict[]; soft: Conflict[] }> {
    const hard: Conflict[] = [];
    const soft: Conflict[] = [];

    // Build base overlap filter for schedules.
    // Two schedules overlap when:
    //   - weekday matches
    //   - start_time < other.end_time AND end_time > other.start_time  (time overlap)
    //   - date ranges overlap (NULL end_date = unbounded)
    const overlapWhere: Record<string, unknown> = {
      tenant_id: tenantId,
      weekday: entry.weekday,
      // Time overlap
      start_time: { lt: this.timeToDate(entry.end_time) },
      end_time: { gt: this.timeToDate(entry.start_time) },
      // Date range overlap: the existing schedule has not ended before the proposed one starts
      OR: [
        { effective_end_date: null },
        { effective_end_date: { gte: new Date(entry.effective_start_date) } },
      ],
      // And if the proposed entry has an end date, the existing one must start before it
      AND: entry.effective_end_date
        ? [{ effective_start_date: { lte: new Date(entry.effective_end_date) } }]
        : [],
    };

    if (excludeId) {
      overlapWhere['id'] = { not: excludeId };
    }

    // 1. Room double-booking
    if (entry.room_id) {
      const roomConflicts = await this.prisma.schedule.findMany({
        where: { ...overlapWhere, room_id: entry.room_id },
        include: { class_entity: { select: { name: true } } },
      });

      if (roomConflicts.length > 0) {
        const room = await this.prisma.room.findFirst({
          where: { id: entry.room_id, tenant_id: tenantId },
          select: { is_exclusive: true, name: true },
        });

        for (const conflict of roomConflicts) {
          if (room?.is_exclusive) {
            hard.push({
              type: 'hard',
              category: 'room_double_booking',
              message: `Room "${room.name}" is already booked for "${conflict.class_entity.name}" at this time`,
              conflicting_schedule_id: conflict.id,
              conflicting_entity: { id: conflict.class_id, name: conflict.class_entity.name },
            });
          } else {
            soft.push({
              type: 'soft',
              category: 'room_shared_warning',
              message: `Shared room "${room?.name}" also used by "${conflict.class_entity.name}" at this time`,
              conflicting_schedule_id: conflict.id,
            });
          }
        }
      }
    }

    // 2. Teacher double-booking
    if (entry.teacher_staff_id) {
      const teacherConflicts = await this.prisma.schedule.findMany({
        where: { ...overlapWhere, teacher_staff_id: entry.teacher_staff_id },
        include: { class_entity: { select: { name: true } } },
      });

      for (const conflict of teacherConflicts) {
        hard.push({
          type: 'hard',
          category: 'teacher_double_booking',
          message: `Teacher is already scheduled for "${conflict.class_entity.name}" at this time`,
          conflicting_schedule_id: conflict.id,
          conflicting_entity: { id: conflict.class_id, name: conflict.class_entity.name },
        });
      }
    }

    // 3. Student double-booking (students enrolled in the proposed class
    //    who are also enrolled in other classes at the same time)
    const enrolledStudents = await this.prisma.classEnrolment.findMany({
      where: { class_id: entry.class_id, tenant_id: tenantId, status: 'active' },
      select: { student_id: true },
    });

    if (enrolledStudents.length > 0) {
      const studentIds = enrolledStudents.map((e) => e.student_id);

      // Get other classes these students are enrolled in
      const otherEnrolments = await this.prisma.classEnrolment.findMany({
        where: {
          tenant_id: tenantId,
          student_id: { in: studentIds },
          class_id: { not: entry.class_id },
          status: 'active',
        },
        select: { class_id: true, student_id: true },
      });

      if (otherEnrolments.length > 0) {
        const otherClassIds = [...new Set(otherEnrolments.map((e) => e.class_id))];

        const studentConflictSchedules = await this.prisma.schedule.findMany({
          where: { ...overlapWhere, class_id: { in: otherClassIds } },
          include: { class_entity: { select: { name: true } } },
        });

        if (studentConflictSchedules.length > 0) {
          // Map which students are affected per conflicting class
          const classToStudents = new Map<string, string[]>();
          for (const e of otherEnrolments) {
            const arr = classToStudents.get(e.class_id) ?? [];
            arr.push(e.student_id);
            classToStudents.set(e.class_id, arr);
          }

          for (const conflict of studentConflictSchedules) {
            const affectedStudentIds = classToStudents.get(conflict.class_id) ?? [];
            hard.push({
              type: 'hard',
              category: 'student_double_booking',
              message: `${affectedStudentIds.length} student(s) enrolled in this class also enrolled in "${conflict.class_entity.name}" which overlaps`,
              conflicting_schedule_id: conflict.id,
              conflicting_entity: { id: conflict.class_id, name: conflict.class_entity.name },
            });
          }
        }
      }
    }

    // 4. Room over capacity
    if (entry.room_id) {
      const room = await this.prisma.room.findFirst({
        where: { id: entry.room_id, tenant_id: tenantId },
        select: { capacity: true, name: true },
      });
      if (room?.capacity) {
        const enrolmentCount = await this.prisma.classEnrolment.count({
          where: { class_id: entry.class_id, tenant_id: tenantId, status: 'active' },
        });
        if (enrolmentCount > room.capacity) {
          soft.push({
            type: 'soft',
            category: 'room_over_capacity',
            message: `Class has ${enrolmentCount} students but room "${room.name}" capacity is ${room.capacity}`,
          });
        }
      }
    }

    return { hard, soft };
  }

  /**
   * Convert an HH:mm string to a Date object suitable for Prisma Time comparison.
   * Prisma stores @db.Time as Date objects anchored to 1970-01-01.
   */
  private timeToDate(timeStr: string): Date {
    return new Date(`1970-01-01T${timeStr}:00.000Z`);
  }
}
