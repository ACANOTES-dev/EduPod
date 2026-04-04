import { Injectable } from '@nestjs/common';
import {
  AttendanceRecordStatus,
  DailyAttendanceStatus,
  SanctionType,
  TuslaAbsenceCategory,
} from '@prisma/client';

import {
  type GenerateTuslaAarDto,
  type GenerateTuslaSarDto,
  TUSLA_DEFAULT_THRESHOLD_DAYS,
} from '@school/shared/regulatory';

import { AttendanceReadFacade } from '../attendance/attendance-read.facade';
import { BehaviourReadFacade } from '../behaviour/behaviour-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { StudentReadFacade } from '../students/student-read.facade';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ABSENT_STATUSES: DailyAttendanceStatus[] = [
  DailyAttendanceStatus.absent,
  DailyAttendanceStatus.excused,
  DailyAttendanceStatus.partially_absent,
];

const SUSPENSION_TYPES: SanctionType[] = [
  SanctionType.suspension_internal,
  SanctionType.suspension_external,
];

const TUSLA_NOTIFICATION_SUSPENSION_DAYS = 6;

/** Prisma TuslaAbsenceCategory enum → API string */
const PRISMA_CATEGORY_TO_API: Record<TuslaAbsenceCategory, string> = {
  [TuslaAbsenceCategory.illness]: 'illness',
  [TuslaAbsenceCategory.urgent_family_reason]: 'urgent_family_reason',
  [TuslaAbsenceCategory.holiday]: 'holiday',
  [TuslaAbsenceCategory.tusla_suspension]: 'suspension',
  [TuslaAbsenceCategory.tusla_expulsion]: 'expulsion',
  [TuslaAbsenceCategory.tusla_other]: 'other',
  [TuslaAbsenceCategory.unexplained]: 'unexplained',
};

function academicYearToDateRange(academicYear: string): { start: Date; end: Date } {
  const parts = academicYear.split('-');
  const startYear = parseInt(parts[0] ?? academicYear, 10);
  return {
    start: new Date(`${startYear}-09-01`),
    end: new Date(`${startYear + 1}-08-31`),
  };
}

// ─── Student select shape ─────────────────────────────────────────────────────

const STUDENT_SELECT = {
  id: true,
  first_name: true,
  last_name: true,
  student_number: true,
  date_of_birth: true,
  year_group: { select: { id: true, name: true } },
} as const;

@Injectable()
export class RegulatoryTuslaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly behaviourReadFacade: BehaviourReadFacade,
    private readonly attendanceReadFacade: AttendanceReadFacade,
  ) {}

  // ─── Threshold Monitor ────────────────────────────────────────────────────────

  async getThresholdMonitor(
    tenantId: string,
    options: { threshold_days?: number; start_date?: string; end_date?: string },
  ) {
    const threshold = options.threshold_days ?? TUSLA_DEFAULT_THRESHOLD_DAYS;
    const approachingThreshold = Math.ceil(threshold * 0.8);

    const dateFilter: Record<string, Date> = {};
    if (options.start_date) dateFilter.gte = new Date(options.start_date);
    if (options.end_date) dateFilter.lte = new Date(options.end_date);

    const summaryDateWhere = Object.keys(dateFilter).length > 0 ? dateFilter : undefined;

    // Group by student, count absent days via attendance facade
    const groups = await this.attendanceReadFacade.groupDailySummariesByStudent(tenantId, {
      derivedStatuses: ABSENT_STATUSES,
      dateFilter: summaryDateWhere,
    });

    // Filter students approaching or exceeding threshold
    const filtered = groups.filter((g) => g._count.student_id >= approachingThreshold);

    if (filtered.length === 0) {
      return { threshold, data: [] };
    }

    // Get student details via facade
    const studentIds = filtered.map((g) => g.student_id);
    const students = await this.studentReadFacade.findManyGeneric(tenantId, {
      where: { id: { in: studentIds } },
      select: STUDENT_SELECT,
    });

    const studentMap = new Map((students as Array<{ id: string }>).map((s) => [s.id, s]));

    const data = filtered
      .map((g) => ({
        student: studentMap.get(g.student_id) ?? null,
        absent_days: g._count.student_id,
        threshold,
        status:
          g._count.student_id >= threshold ? ('exceeding' as const) : ('approaching' as const),
      }))
      .filter((d) => d.student !== null)
      .sort((a, b) => b.absent_days - a.absent_days);

    return { threshold, data };
  }

  // ─── SAR (Student Absence Report) Generation ─────────────────────────────────

  async generateSar(tenantId: string, dto: GenerateTuslaSarDto) {
    const startDate = new Date(dto.start_date);
    const endDate = new Date(dto.end_date);

    // Get non-present attendance records in the date range via facade
    const records = await this.attendanceReadFacade.findRecordsByStatusWithSession(tenantId, {
      statusNot: AttendanceRecordStatus.present,
      sessionDateRange: { gte: startDate, lte: endDate },
    });

    // Get Tusla mappings for categorisation (own module table — no facade needed)
    const mappings = await this.prisma.tuslaAbsenceCodeMapping.findMany({
      where: { tenant_id: tenantId },
    });

    // Build lookup: AttendanceRecordStatus → API category string
    const categoryLookup = new Map<string, string>();
    for (const m of mappings) {
      categoryLookup.set(m.attendance_status, PRISMA_CATEGORY_TO_API[m.tusla_category] ?? 'other');
    }

    // Deduplicate by student+date (count days not sessions)
    const studentData = new Map<string, Record<string, number>>();
    const seenDays = new Set<string>();

    for (const record of records) {
      const dateStr = record.session.session_date.toISOString().split('T')[0];
      const dayKey = `${record.student_id}:${dateStr}`;

      if (seenDays.has(dayKey)) continue;
      seenDays.add(dayKey);

      const category = categoryLookup.get(record.status) ?? 'unexplained';

      if (!studentData.has(record.student_id)) {
        studentData.set(record.student_id, {});
      }
      const cats = studentData.get(record.student_id)!;
      cats[category] = (cats[category] ?? 0) + 1;
    }

    // Get student details via facade
    const studentIds = [...studentData.keys()];
    const students =
      studentIds.length > 0
        ? await this.studentReadFacade.findManyGeneric(tenantId, {
            where: { id: { in: studentIds } },
            select: STUDENT_SELECT,
          })
        : [];

    const studentMap = new Map((students as Array<{ id: string }>).map((s) => [s.id, s]));

    const rows = studentIds
      .map((id) => {
        const categories = studentData.get(id)!;
        const totalDays = Object.values(categories).reduce((sum, n) => sum + n, 0);
        return {
          student: studentMap.get(id) ?? null,
          total_absent_days: totalDays,
          categories,
        };
      })
      .filter((r) => r.student !== null)
      .sort((a, b) => b.total_absent_days - a.total_absent_days);

    return {
      academic_year: dto.academic_year,
      period: dto.period,
      start_date: dto.start_date,
      end_date: dto.end_date,
      total_students: rows.length,
      rows,
    };
  }

  // ─── AAR (Annual Attendance Report) Generation ────────────────────────────────

  async generateAar(tenantId: string, dto: GenerateTuslaAarDto) {
    const { start, end } = academicYearToDateRange(dto.academic_year);

    // Total enrolled students (active status) via facade
    const totalStudents = await this.studentReadFacade.count(tenantId, { status: 'active' });

    // Total absent days via attendance facade
    const totalDaysLost = await this.attendanceReadFacade.countDailySummaries(tenantId, {
      derivedStatuses: ABSENT_STATUSES,
      dateFilter: { gte: start, lte: end },
    });

    // Students with 20+ absent days via facade
    const groups = await this.attendanceReadFacade.groupDailySummariesByStudent(tenantId, {
      derivedStatuses: ABSENT_STATUSES,
      dateFilter: { gte: start, lte: end },
    });

    const studentsOver20 = groups.filter(
      (g) => g._count.student_id >= TUSLA_DEFAULT_THRESHOLD_DAYS,
    ).length;

    return {
      academic_year: dto.academic_year,
      total_students: totalStudents,
      total_days_lost: totalDaysLost,
      students_over_20_days: studentsOver20,
    };
  }

  // ─── Suspensions Requiring Tusla Notification ─────────────────────────────────

  async getSuspensions(tenantId: string, academicYear?: string) {
    const dateFilter = academicYear
      ? (() => {
          const { start, end } = academicYearToDateRange(academicYear);
          return { gte: start, lte: end };
        })()
      : undefined;

    return this.behaviourReadFacade.findSanctionsForTusla(tenantId, {
      types: SUSPENSION_TYPES,
      minSuspensionDays: TUSLA_NOTIFICATION_SUSPENSION_DAYS,
      dateFilter,
    });
  }

  // ─── Expulsions Requiring Tusla Notification ──────────────────────────────────

  async getExpulsions(tenantId: string, academicYear?: string) {
    const dateFilter = academicYear
      ? (() => {
          const { start, end } = academicYearToDateRange(academicYear);
          return { gte: start, lte: end };
        })()
      : undefined;

    return this.behaviourReadFacade.findExclusionCasesForTusla(tenantId, { dateFilter });
  }
}
