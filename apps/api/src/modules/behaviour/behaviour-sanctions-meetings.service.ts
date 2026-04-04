import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { RecordParentMeetingDto } from '@school/shared/behaviour';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';
import { SchedulesReadFacade } from '../schedules/schedules-read.facade';

// ─── Sanction parent meetings & conflict checks ──────────────────────────────

@Injectable()
export class BehaviourSanctionsMeetingsService {
  private readonly logger = new Logger(BehaviourSanctionsMeetingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly schedulesReadFacade: SchedulesReadFacade,
  ) {}

  // ─── Record Parent Meeting ─────────────────────────────────────────────

  async recordParentMeeting(tenantId: string, id: string, dto: RecordParentMeetingDto) {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const sanction = await db.behaviourSanction.findFirst({
        where: { id, tenant_id: tenantId },
      });
      if (!sanction) {
        throw new NotFoundException({
          code: 'SANCTION_NOT_FOUND',
          message: 'Sanction not found',
        });
      }

      return db.behaviourSanction.update({
        where: { id },
        data: {
          parent_meeting_date: new Date(dto.parent_meeting_date),
          parent_meeting_notes: dto.parent_meeting_notes ?? null,
        },
      });
    });
  }

  // ─── Check Conflicts ──────────────────────────────────────────────────

  async checkConflicts(
    tenantId: string,
    studentId: string,
    date: string,
    startTime: string | null,
    endTime: string | null,
  ) {
    const conflicts: Array<{
      type: 'sanction' | 'timetable';
      description: string;
      entity_id: string;
    }> = [];

    // Check existing sanctions on the same date
    const existingSanctions = await this.prisma.behaviourSanction.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        scheduled_date: new Date(date),
        status: { in: ['scheduled', 'pending_approval'] },
        retention_status: 'active',
      },
      select: {
        id: true,
        type: true,
        sanction_number: true,
        scheduled_start_time: true,
        scheduled_end_time: true,
      },
    });

    for (const s of existingSanctions) {
      // If no time specified, any same-day sanction is a conflict
      if (!startTime || !endTime || !s.scheduled_start_time || !s.scheduled_end_time) {
        conflicts.push({
          type: 'sanction',
          description: `Existing ${s.type} (${s.sanction_number}) on the same date`,
          entity_id: s.id,
        });
        continue;
      }

      // Time overlap check
      const reqStart = new Date(`1970-01-01T${startTime}`);
      const reqEnd = new Date(`1970-01-01T${endTime}`);
      if (s.scheduled_start_time < reqEnd && s.scheduled_end_time > reqStart) {
        conflicts.push({
          type: 'sanction',
          description: `Overlapping ${s.type} (${s.sanction_number})`,
          entity_id: s.id,
        });
      }
    }

    // Check timetable entries for the student on that date
    const dayOfWeek = new Date(date).getDay();
    const timetableEntries = await this.schedulesReadFacade.findByStudentWeekday(
      tenantId,
      studentId,
      dayOfWeek,
    );

    if (startTime && endTime) {
      const reqStart = new Date(`1970-01-01T${startTime}`);
      const reqEnd = new Date(`1970-01-01T${endTime}`);

      for (const entry of timetableEntries) {
        if (entry.start_time < reqEnd && entry.end_time > reqStart) {
          const subjectName = entry.class_entity?.subject?.name ?? 'class';
          conflicts.push({
            type: 'timetable',
            description: `Clashes with ${subjectName} timetable entry`,
            entity_id: entry.id,
          });
        }
      }
    }

    return { conflicts, has_conflicts: conflicts.length > 0 };
  }
}
