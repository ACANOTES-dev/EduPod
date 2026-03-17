import { Injectable } from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

interface ListSummariesParams {
  page: number;
  pageSize: number;
  student_id?: string;
  start_date?: string;
  end_date?: string;
  derived_status?: string;
}

interface StudentSummariesParams {
  start_date?: string;
  end_date?: string;
}

@Injectable()
export class DailySummaryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Recalculate the daily attendance summary for a student on a given date.
   * Aggregates all attendance records from non-cancelled sessions where
   * the student was actively enrolled.
   */
  async recalculate(
    tenantId: string,
    studentId: string,
    date: Date,
  ) {
    // Get all attendance records for the student on this date from non-cancelled sessions
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        session: {
          session_date: date,
          status: { not: 'cancelled' },
        },
      },
      include: {
        session: {
          select: {
            id: true,
            class_id: true,
            status: true,
          },
        },
      },
    });

    // If no records, delete any existing summary and return null
    if (records.length === 0) {
      await this.prisma.dailyAttendanceSummary.deleteMany({
        where: {
          tenant_id: tenantId,
          student_id: studentId,
          summary_date: date,
        },
      });
      return null;
    }

    // Aggregate counts
    const sessionsTotal = records.length;
    let sessionsPresent = 0;
    let sessionsAbsent = 0;
    let sessionsLate = 0;
    let sessionsExcused = 0;

    const sessionDetails: Array<{
      session_id: string;
      class_id: string;
      status: string;
    }> = [];

    for (const record of records) {
      const status = record.status;

      if (status === 'present' || status === 'left_early') {
        sessionsPresent++;
      }
      if (status === 'absent_unexcused' || status === 'absent_excused') {
        sessionsAbsent++;
      }
      if (status === 'absent_excused') {
        sessionsExcused++;
      }
      if (status === 'late') {
        sessionsLate++;
      }

      sessionDetails.push({
        session_id: record.session.id,
        class_id: record.session.class_id,
        status: record.status,
      });
    }

    // Derive daily status
    let derivedStatus: $Enums.DailyAttendanceStatus;

    if (sessionsAbsent === 0 && sessionsLate === 0) {
      derivedStatus = 'present';
    } else if (
      sessionsPresent === 0 &&
      sessionsLate === 0 &&
      sessionsExcused === sessionsAbsent
    ) {
      derivedStatus = 'excused';
    } else if (sessionsPresent === 0 && sessionsLate === 0) {
      derivedStatus = 'absent';
    } else if (sessionsLate > 0 && sessionsAbsent === 0) {
      derivedStatus = 'late';
    } else {
      derivedStatus = 'partially_absent';
    }

    const derivedPayload = {
      sessions_total: sessionsTotal,
      sessions_present: sessionsPresent,
      sessions_absent: sessionsAbsent,
      sessions_late: sessionsLate,
      sessions_excused: sessionsExcused,
      session_details: sessionDetails,
    };

    // Upsert via RLS transaction
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.dailyAttendanceSummary.upsert({
        where: {
          idx_daily_summary_unique: {
            tenant_id: tenantId,
            student_id: studentId,
            summary_date: date,
          },
        },
        update: {
          derived_status: derivedStatus,
          derived_payload: derivedPayload as unknown as Prisma.InputJsonValue,
        },
        create: {
          tenant_id: tenantId,
          student_id: studentId,
          summary_date: date,
          derived_status: derivedStatus,
          derived_payload: derivedPayload as unknown as Prisma.InputJsonValue,
        },
      });
    });
  }

  /**
   * List daily attendance summaries with pagination and filters.
   */
  async findAll(tenantId: string, params: ListSummariesParams) {
    const { page, pageSize, student_id, start_date, end_date, derived_status } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.DailyAttendanceSummaryWhereInput = { tenant_id: tenantId };

    if (student_id) {
      where.student_id = student_id;
    }

    if (start_date || end_date) {
      where.summary_date = {};
      if (start_date) {
        where.summary_date.gte = new Date(start_date);
      }
      if (end_date) {
        where.summary_date.lte = new Date(end_date);
      }
    }

    if (derived_status) {
      where.derived_status = derived_status as $Enums.DailyAttendanceStatus;
    }

    const [data, total] = await Promise.all([
      this.prisma.dailyAttendanceSummary.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { summary_date: 'desc' },
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              student_number: true,
            },
          },
        },
      }),
      this.prisma.dailyAttendanceSummary.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  /**
   * List daily attendance summaries for a specific student.
   */
  async findForStudent(
    tenantId: string,
    studentId: string,
    params: StudentSummariesParams,
  ) {
    const where: Prisma.DailyAttendanceSummaryWhereInput = {
      tenant_id: tenantId,
      student_id: studentId,
    };

    if (params.start_date || params.end_date) {
      where.summary_date = {};
      if (params.start_date) {
        where.summary_date.gte = new Date(params.start_date);
      }
      if (params.end_date) {
        where.summary_date.lte = new Date(params.end_date);
      }
    }

    const data = await this.prisma.dailyAttendanceSummary.findMany({
      where,
      orderBy: { summary_date: 'desc' },
    });

    return { data };
  }
}
