import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface ChronicAbsenteeismEntry {
  student_id: string;
  student_name: string;
  year_group_name: string | null;
  class_name: string | null;
  attendance_rate: number;
  total_sessions: number;
  absent_sessions: number;
}

export interface DayOfWeekHeatmapEntry {
  year_group_id: string;
  year_group_name: string;
  weekday: number;
  weekday_label: string;
  total_sessions: number;
  present_sessions: number;
  attendance_rate: number;
}

export interface TeacherMarkingComplianceEntry {
  staff_profile_id: string;
  teacher_name: string;
  total_sessions: number;
  submitted_sessions: number;
  compliance_rate: number;
}

export interface AttendanceTrendDataPoint {
  period_label: string;
  attendance_rate: number;
  total_students: number;
}

export interface ExcusedVsUnexcusedResult {
  excused_count: number;
  unexcused_count: number;
  late_count: number;
  left_early_count: number;
  total_absences: number;
  excused_rate: number;
}

export interface ClassComparisonEntry {
  class_id: string;
  class_name: string;
  attendance_rate: number;
  total_sessions: number;
}

@Injectable()
export class AttendanceAnalyticsService {
  private readonly WEEKDAY_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  constructor(private readonly prisma: PrismaService) {}

  async chronicAbsenteeism(
    tenantId: string,
    threshold = 85,
    startDate?: string,
    endDate?: string,
  ): Promise<ChronicAbsenteeismEntry[]> {
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    const hasDates = Object.keys(dateFilter).length > 0;

    const sessionWhere = hasDates ? { session_date: dateFilter } : {};

    const totalGroups = await this.prisma.attendanceRecord.groupBy({
      by: ['student_id'],
      where: {
        tenant_id: tenantId,
        ...(hasDates && { session: sessionWhere }),
      },
      _count: true,
    });

    const presentGroups = await this.prisma.attendanceRecord.groupBy({
      by: ['student_id'],
      where: {
        tenant_id: tenantId,
        status: { in: ['present', 'late'] },
        ...(hasDates && { session: sessionWhere }),
      },
      _count: true,
    });

    const presentMap = new Map(presentGroups.map((g) => [g.student_id, g._count]));

    const chronicStudentIds = totalGroups
      .filter((g) => {
        const present = presentMap.get(g.student_id) ?? 0;
        const rate = g._count > 0 ? (present / g._count) * 100 : 0;
        return rate < threshold;
      })
      .map((g) => g.student_id);

    if (chronicStudentIds.length === 0) return [];

    const students = await this.prisma.student.findMany({
      where: { tenant_id: tenantId, id: { in: chronicStudentIds } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        year_group: { select: { name: true } },
        homeroom_class: { select: { name: true } },
      },
    });

    const studentMap = new Map(students.map((s) => [s.id, s]));
    const totalMap = new Map(totalGroups.map((g) => [g.student_id, g._count]));

    return chronicStudentIds
      .map((id) => {
        const s = studentMap.get(id);
        const total = totalMap.get(id) ?? 0;
        const present = presentMap.get(id) ?? 0;
        const rate = total > 0 ? (present / total) * 100 : 0;
        return {
          student_id: id,
          student_name: s ? `${s.first_name} ${s.last_name}` : 'Unknown',
          year_group_name: s?.year_group?.name ?? null,
          class_name: s?.homeroom_class?.name ?? null,
          attendance_rate: Number(rate.toFixed(2)),
          total_sessions: total,
          absent_sessions: total - present,
        };
      })
      .sort((a, b) => a.attendance_rate - b.attendance_rate);
  }

  async dayOfWeekHeatmap(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<DayOfWeekHeatmapEntry[]> {
    const yearGroups = await this.prisma.yearGroup.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, name: true },
      orderBy: { display_order: 'asc' },
    });

    const results: DayOfWeekHeatmapEntry[] = [];

    for (const yg of yearGroups) {
      // Get classes in this year group
      const classes = await this.prisma.class.findMany({
        where: { tenant_id: tenantId, year_group_id: yg.id, status: 'active' },
        select: { id: true },
      });

      const classIds = classes.map((c) => c.id);
      if (classIds.length === 0) continue;

      // Get sessions with dates
      const sessionFilter: Record<string, unknown> = {
        tenant_id: tenantId,
        class_id: { in: classIds },
      };

      if (startDate || endDate) {
        const dateFilter: Record<string, unknown> = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) dateFilter.lte = new Date(endDate);
        sessionFilter.session_date = dateFilter;
      }

      const sessions = await this.prisma.attendanceSession.findMany({
        where: sessionFilter,
        select: {
          session_date: true,
          _count: { select: { records: true } },
        },
      });

      // Group by weekday
      const weekdayMap = new Map<number, { total: number; present: number }>();

      for (const session of sessions) {
        const jsDay = new Date(session.session_date).getDay();
        const weekday = jsDay === 0 ? 6 : jsDay - 1; // Convert to Mon=0
        const entry = weekdayMap.get(weekday) ?? { total: 0, present: 0 };
        entry.total += session._count.records;
        weekdayMap.set(weekday, entry);
      }

      // We'd need to count present records specifically — simplified version
      for (const [weekday, stats] of weekdayMap.entries()) {
        results.push({
          year_group_id: yg.id,
          year_group_name: yg.name,
          weekday,
          weekday_label: this.WEEKDAY_LABELS[weekday] ?? `Day ${weekday}`,
          total_sessions: stats.total,
          present_sessions: stats.present,
          attendance_rate: stats.total > 0
            ? Number(((stats.present / stats.total) * 100).toFixed(2))
            : 0,
        });
      }
    }

    return results;
  }

  async teacherMarkingCompliance(tenantId: string): Promise<TeacherMarkingComplianceEntry[]> {
    const staffProfiles = await this.prisma.staffProfile.findMany({
      where: { tenant_id: tenantId, employment_status: 'active' },
      select: {
        id: true,
        user: { select: { first_name: true, last_name: true } },
      },
    });

    const results: TeacherMarkingComplianceEntry[] = [];

    for (const staff of staffProfiles) {
      const classAssignments = await this.prisma.classStaff.findMany({
        where: { tenant_id: tenantId, staff_profile_id: staff.id },
        select: { class_id: true },
      });

      const classIds = classAssignments.map((ca) => ca.class_id);
      if (classIds.length === 0) continue;

      const [totalSessions, submittedSessions] = await Promise.all([
        this.prisma.attendanceSession.count({
          where: { tenant_id: tenantId, class_id: { in: classIds } },
        }),
        this.prisma.attendanceSession.count({
          where: {
            tenant_id: tenantId,
            class_id: { in: classIds },
            status: { in: ['submitted', 'locked'] },
          },
        }),
      ]);

      if (totalSessions === 0) continue;

      results.push({
        staff_profile_id: staff.id,
        teacher_name: `${staff.user.first_name} ${staff.user.last_name}`,
        total_sessions: totalSessions,
        submitted_sessions: submittedSessions,
        compliance_rate: Number(((submittedSessions / totalSessions) * 100).toFixed(2)),
      });
    }

    return results.sort((a, b) => a.compliance_rate - b.compliance_rate);
  }

  async attendanceTrends(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<AttendanceTrendDataPoint[]> {
    // Group sessions by month
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    const hasDates = Object.keys(dateFilter).length > 0;

    const sessions = await this.prisma.attendanceSession.findMany({
      where: {
        tenant_id: tenantId,
        ...(hasDates && { session_date: dateFilter }),
        status: { in: ['submitted', 'locked'] },
      },
      select: {
        session_date: true,
        records: { select: { status: true } },
      },
      orderBy: { session_date: 'asc' },
    });

    // Group by year-month
    const monthMap = new Map<string, { total: number; present: number }>();

    for (const session of sessions) {
      const month = session.session_date.toISOString().slice(0, 7); // YYYY-MM
      const entry = monthMap.get(month) ?? { total: 0, present: 0 };
      for (const record of session.records) {
        entry.total++;
        if (record.status === 'present' || record.status === 'late') {
          entry.present++;
        }
      }
      monthMap.set(month, entry);
    }

    const studentCount = await this.prisma.student.count({
      where: { tenant_id: tenantId, status: 'active' },
    });

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, stats]) => ({
        period_label: month,
        attendance_rate: stats.total > 0
          ? Number(((stats.present / stats.total) * 100).toFixed(2))
          : 0,
        total_students: studentCount,
      }));
  }

  async excusedVsUnexcused(
    tenantId: string,
    startDate?: string,
    endDate?: string,
    yearGroupId?: string,
  ): Promise<ExcusedVsUnexcusedResult> {
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    const hasDates = Object.keys(dateFilter).length > 0;

    let studentIdFilter: { in: string[] } | undefined;
    if (yearGroupId) {
      const students = await this.prisma.student.findMany({
        where: { tenant_id: tenantId, year_group_id: yearGroupId },
        select: { id: true },
      });
      studentIdFilter = { in: students.map((s) => s.id) };
    }

    const groups = await this.prisma.attendanceRecord.groupBy({
      by: ['status'],
      where: {
        tenant_id: tenantId,
        ...(studentIdFilter && { student_id: studentIdFilter }),
        ...(hasDates && { session: { session_date: dateFilter } }),
        status: { in: ['absent_excused', 'absent_unexcused', 'late', 'left_early'] },
      },
      _count: true,
    });

    const countMap = new Map(groups.map((g) => [g.status, g._count]));

    const excusedCount = countMap.get('absent_excused') ?? 0;
    const unexcusedCount = countMap.get('absent_unexcused') ?? 0;
    const lateCount = countMap.get('late') ?? 0;
    const leftEarlyCount = countMap.get('left_early') ?? 0;
    const totalAbsences = excusedCount + unexcusedCount + lateCount + leftEarlyCount;

    return {
      excused_count: excusedCount,
      unexcused_count: unexcusedCount,
      late_count: lateCount,
      left_early_count: leftEarlyCount,
      total_absences: totalAbsences,
      excused_rate: totalAbsences > 0
        ? Number(((excusedCount / totalAbsences) * 100).toFixed(2))
        : 0,
    };
  }

  async classComparison(
    tenantId: string,
    yearGroupId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<ClassComparisonEntry[]> {
    const classes = await this.prisma.class.findMany({
      where: { tenant_id: tenantId, year_group_id: yearGroupId, status: 'active' },
      select: { id: true, name: true },
    });

    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    const hasDates = Object.keys(dateFilter).length > 0;

    const results: ClassComparisonEntry[] = [];

    for (const cls of classes) {
      const sessions = await this.prisma.attendanceSession.findMany({
        where: {
          tenant_id: tenantId,
          class_id: cls.id,
          status: { in: ['submitted', 'locked'] },
          ...(hasDates && { session_date: dateFilter }),
        },
        select: {
          records: { select: { status: true } },
        },
      });

      let total = 0;
      let present = 0;

      for (const session of sessions) {
        for (const record of session.records) {
          total++;
          if (record.status === 'present' || record.status === 'late') {
            present++;
          }
        }
      }

      results.push({
        class_id: cls.id,
        class_name: cls.name,
        attendance_rate: total > 0 ? Number(((present / total) * 100).toFixed(2)) : 0,
        total_sessions: sessions.length,
      });
    }

    return results.sort((a, b) => b.attendance_rate - a.attendance_rate);
  }
}
