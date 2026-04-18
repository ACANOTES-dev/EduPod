import { Injectable } from '@nestjs/common';

import { ReportsDataAccessService } from './reports-data-access.service';

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
  private readonly WEEKDAY_LABELS = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];

  constructor(private readonly dataAccess: ReportsDataAccessService) {}

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

    const totalGroups = (await this.dataAccess.groupAttendanceRecordsBy(
      tenantId,
      ['student_id'],
      hasDates ? { session: sessionWhere } : undefined,
    )) as Array<{ student_id: string; _count: number }>;

    const presentGroups = (await this.dataAccess.groupAttendanceRecordsBy(
      tenantId,
      ['student_id'],
      {
        status: { in: ['present', 'late'] },
        ...(hasDates && { session: sessionWhere }),
      },
    )) as Array<{ student_id: string; _count: number }>;

    const presentMap = new Map(presentGroups.map((g) => [g.student_id, g._count]));

    const chronicStudentIds = totalGroups
      .filter((g) => {
        const present = presentMap.get(g.student_id) ?? 0;
        const rate = g._count > 0 ? (present / g._count) * 100 : 0;
        return rate < threshold;
      })
      .map((g) => g.student_id);

    if (chronicStudentIds.length === 0) return [];

    const students = (await this.dataAccess.findStudents(tenantId, {
      where: { id: { in: chronicStudentIds } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        year_group: { select: { name: true } },
        homeroom_class: { select: { name: true } },
      },
    })) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      year_group: { name: string } | null;
      homeroom_class: { name: string } | null;
    }>;

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
    const yearGroups = (await this.dataAccess.findYearGroups(tenantId, {
      id: true,
      name: true,
    })) as Array<{ id: string; name: string }>;

    const results: DayOfWeekHeatmapEntry[] = [];

    for (const yg of yearGroups) {
      const classes = (await this.dataAccess.findClasses(
        tenantId,
        { year_group_id: yg.id, status: 'active' },
        { id: true },
      )) as Array<{ id: string }>;

      const classIds = classes.map((c) => c.id);
      if (classIds.length === 0) continue;

      const sessionFilter: Record<string, unknown> = {
        class_id: { in: classIds },
      };

      if (startDate || endDate) {
        const dateFilter: Record<string, unknown> = {};
        if (startDate) dateFilter.gte = new Date(startDate);
        if (endDate) dateFilter.lte = new Date(endDate);
        sessionFilter.session_date = dateFilter;
      }

      const sessions = (await this.dataAccess.findAttendanceSessions(tenantId, {
        where: sessionFilter,
        select: {
          session_date: true,
          _count: { select: { records: true } },
        },
      })) as Array<{ session_date: Date; _count: { records: number } }>;

      const weekdayMap = new Map<number, { total: number; present: number }>();

      for (const session of sessions) {
        const weekday = new Date(session.session_date).getDay();
        const entry = weekdayMap.get(weekday) ?? { total: 0, present: 0 };
        entry.total += session._count.records;
        weekdayMap.set(weekday, entry);
      }

      for (const [weekday, stats] of weekdayMap.entries()) {
        results.push({
          year_group_id: yg.id,
          year_group_name: yg.name,
          weekday,
          weekday_label: this.WEEKDAY_LABELS[weekday] ?? `Day ${weekday}`,
          total_sessions: stats.total,
          present_sessions: stats.present,
          attendance_rate:
            stats.total > 0 ? Number(((stats.present / stats.total) * 100).toFixed(2)) : 0,
        });
      }
    }

    return results;
  }

  async teacherMarkingCompliance(tenantId: string): Promise<TeacherMarkingComplianceEntry[]> {
    const staffProfiles = (await this.dataAccess.findStaffProfiles(tenantId, {
      where: { employment_status: 'active' },
      select: {
        id: true,
        user: { select: { first_name: true, last_name: true } },
      },
    })) as Array<{ id: string; user: { first_name: string; last_name: string } }>;

    const results: TeacherMarkingComplianceEntry[] = [];

    for (const staff of staffProfiles) {
      const classAssignments = (await this.dataAccess.findClassStaff(
        tenantId,
        { staff_profile_id: staff.id },
        { class_id: true },
      )) as Array<{ class_id: string }>;

      const classIds = classAssignments.map((ca) => ca.class_id);
      if (classIds.length === 0) continue;

      const [totalSessions, submittedSessions] = await Promise.all([
        this.dataAccess.countAttendanceSessions(tenantId, {
          class_id: { in: classIds },
        }),
        this.dataAccess.countAttendanceSessions(tenantId, {
          class_id: { in: classIds },
          status: { in: ['submitted', 'locked'] },
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
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    const hasDates = Object.keys(dateFilter).length > 0;

    const sessions = (await this.dataAccess.findAttendanceSessions(tenantId, {
      where: {
        ...(hasDates && { session_date: dateFilter }),
        status: { in: ['submitted', 'locked'] },
      },
      select: {
        session_date: true,
        records: { select: { status: true } },
      },
      orderBy: { session_date: 'asc' },
    })) as Array<{ session_date: Date; records: Array<{ status: string }> }>;

    const monthMap = new Map<string, { total: number; present: number }>();

    for (const session of sessions) {
      const month = session.session_date.toISOString().slice(0, 7);
      const entry = monthMap.get(month) ?? { total: 0, present: 0 };
      for (const record of session.records) {
        entry.total++;
        if (record.status === 'present' || record.status === 'late') {
          entry.present++;
        }
      }
      monthMap.set(month, entry);
    }

    const studentCount = await this.dataAccess.countStudents(tenantId, { status: 'active' });

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, stats]) => ({
        period_label: month,
        attendance_rate:
          stats.total > 0 ? Number(((stats.present / stats.total) * 100).toFixed(2)) : 0,
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
      const students = (await this.dataAccess.findStudents(tenantId, {
        where: { year_group_id: yearGroupId },
        select: { id: true },
      })) as Array<{ id: string }>;
      studentIdFilter = { in: students.map((s) => s.id) };
    }

    const groups = (await this.dataAccess.groupAttendanceRecordsBy(tenantId, ['status'], {
      ...(studentIdFilter && { student_id: studentIdFilter }),
      ...(hasDates && { session: { session_date: dateFilter } }),
      status: { in: ['absent_excused', 'absent_unexcused', 'late', 'left_early'] },
    })) as Array<{ status: string; _count: number }>;

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
      excused_rate:
        totalAbsences > 0 ? Number(((excusedCount / totalAbsences) * 100).toFixed(2)) : 0,
    };
  }

  async classComparison(
    tenantId: string,
    yearGroupId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<ClassComparisonEntry[]> {
    const classes = (await this.dataAccess.findClasses(
      tenantId,
      { year_group_id: yearGroupId, status: 'active' },
      { id: true, name: true },
    )) as Array<{ id: string; name: string }>;

    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    const hasDates = Object.keys(dateFilter).length > 0;

    const results: ClassComparisonEntry[] = [];

    for (const cls of classes) {
      const sessions = (await this.dataAccess.findAttendanceSessions(tenantId, {
        where: {
          class_id: cls.id,
          status: { in: ['submitted', 'locked'] },
          ...(hasDates && { session_date: dateFilter }),
        },
        select: {
          records: { select: { status: true } },
        },
      })) as Array<{ records: Array<{ status: string }> }>;

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
