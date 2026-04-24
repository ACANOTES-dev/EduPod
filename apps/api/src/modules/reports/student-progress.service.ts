import { Injectable, NotFoundException } from '@nestjs/common';

import { ReportsDataAccessService } from './reports-data-access.service';

// ─── Description keys (declared here for impl 22 translation sweep) ─────────
// reports.description.student_progress =
//   "Overview of a student's academic, behavioural, and attendance
//    performance."
// reports.description.student_progress.cohort_trends =
//   "Cohort-level attendance and grade trend across a single term."
// reports.description.student_progress.at_risk_new_week =
//   "Students newly flagged at-risk this week — drill-down from KPI #3."
// ─────────────────────────────────────────────────────────────────────────────

export interface SubjectGradeTrend {
  subject_id: string;
  subject_name: string;
  grades: Array<{ period_name: string; score: number; max_score: number }>;
}

export interface AttendanceTrendEntry {
  period_label: string;
  attendance_rate: number;
  total_sessions: number;
}

export interface RiskAlertEntry {
  alert_id: string;
  alert_type: string;
  severity: string;
  created_at: string;
  acknowledged_at: string | null;
}

export interface StudentProgressReport {
  student_id: string;
  student_name: string;
  year_group_name: string | null;
  class_name: string | null;
  grade_trends: SubjectGradeTrend[];
  attendance_trend: AttendanceTrendEntry[];
  risk_alerts: RiskAlertEntry[];
  overall_progress_score: number;
}

export interface CohortTrendResult {
  year_group_id: string;
  academic_period_id: string;
  period_label: string;
  attendance_rate: number;
  average_grade: number;
  students_count: number;
  total_sessions: number;
  total_grades: number;
}

export interface AtRiskStudentNewEntry {
  alert_id: string;
  student_id: string;
  student_name: string;
  year_group_name: string | null;
  risk_level: string;
  alert_type: string;
  created_at: string;
}

@Injectable()
export class StudentProgressService {
  constructor(private readonly dataAccess: ReportsDataAccessService) {}

  async getStudentProgress(tenantId: string, studentId: string): Promise<StudentProgressReport> {
    const student = (await this.dataAccess.findStudentById(tenantId, studentId, {
      id: true,
      first_name: true,
      last_name: true,
      year_group: { select: { name: true } },
      homeroom_class: { select: { name: true } },
    })) as {
      id: string;
      first_name: string;
      last_name: string;
      year_group: { name: string } | null;
      homeroom_class: { name: string } | null;
    } | null;

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student with id "${studentId}" not found`,
      });
    }

    const [gradeTrends, attendanceTrend, riskAlerts] = await Promise.all([
      this.buildGradeTrends(tenantId, studentId),
      this.buildAttendanceTrend(tenantId, studentId),
      this.buildRiskAlerts(tenantId, studentId),
    ]);

    const latestAttendance = attendanceTrend.at(-1)?.attendance_rate ?? 50;
    const allScores = gradeTrends.flatMap((gt) =>
      gt.grades.map((g) => (g.max_score > 0 ? (g.score / g.max_score) * 100 : 0)),
    );
    const avgGrade =
      allScores.length > 0 ? allScores.reduce((s, x) => s + x, 0) / allScores.length : 50;

    const overallProgressScore = Number((latestAttendance * 0.4 + avgGrade * 0.6).toFixed(1));

    return {
      student_id: student.id,
      student_name: `${student.first_name} ${student.last_name}`,
      year_group_name: student.year_group?.name ?? null,
      class_name: student.homeroom_class?.name ?? null,
      grade_trends: gradeTrends,
      attendance_trend: attendanceTrend,
      risk_alerts: riskAlerts,
      overall_progress_score: Math.min(100, overallProgressScore),
    };
  }

  private async buildGradeTrends(
    tenantId: string,
    studentId: string,
  ): Promise<SubjectGradeTrend[]> {
    const grades = (await this.dataAccess.findGrades(tenantId, {
      where: {
        student_id: studentId,
        is_missing: false,
        raw_score: { not: null },
      },
      select: {
        raw_score: true,
        assessment: {
          select: {
            max_score: true,
            subject: { select: { id: true, name: true } },
            academic_period: { select: { name: true } },
          },
        },
      },
      orderBy: { entered_at: 'asc' },
    })) as Array<{
      raw_score: unknown;
      assessment: {
        max_score: unknown;
        subject: { id: string; name: string } | null;
        academic_period: { name: string } | null;
      };
    }>;

    const subjectMap = new Map<string, SubjectGradeTrend>();

    for (const grade of grades) {
      const subject = grade.assessment.subject;
      const period = grade.assessment.academic_period;
      if (!subject || !period) continue;

      const trend = subjectMap.get(subject.id) ?? {
        subject_id: subject.id,
        subject_name: subject.name,
        grades: [],
      };

      trend.grades.push({
        period_name: period.name,
        score: Number(grade.raw_score),
        max_score: Number(grade.assessment.max_score),
      });

      subjectMap.set(subject.id, trend);
    }

    return Array.from(subjectMap.values());
  }

  private async buildAttendanceTrend(
    tenantId: string,
    studentId: string,
  ): Promise<AttendanceTrendEntry[]> {
    const records = (await this.dataAccess.findAttendanceRecords(tenantId, {
      where: { student_id: studentId },
      select: {
        status: true,
        session: { select: { session_date: true } },
      },
      orderBy: { created_at: 'asc' },
    })) as Array<{ status: string; session: { session_date: Date } }>;

    const monthMap = new Map<string, { total: number; present: number }>();

    for (const record of records) {
      const month = record.session.session_date.toISOString().slice(0, 7);
      const entry = monthMap.get(month) ?? { total: 0, present: 0 };
      entry.total++;
      if (record.status === 'present' || record.status === 'late') {
        entry.present++;
      }
      monthMap.set(month, entry);
    }

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, stats]) => ({
        period_label: month,
        attendance_rate:
          stats.total > 0 ? Number(((stats.present / stats.total) * 100).toFixed(2)) : 0,
        total_sessions: stats.total,
      }));
  }

  private async buildRiskAlerts(tenantId: string, studentId: string): Promise<RiskAlertEntry[]> {
    const alerts = (await this.dataAccess.findStudentAcademicRiskAlerts(tenantId, {
      where: { student_id: studentId },
      select: {
        id: true,
        alert_type: true,
        risk_level: true,
        created_at: true,
        resolved_at: true,
      },
      orderBy: { created_at: 'desc' },
      take: 20,
    })) as Array<{
      id: string;
      alert_type: string;
      risk_level: string;
      created_at: Date;
      resolved_at: Date | null;
    }>;

    return alerts.map((a) => ({
      alert_id: a.id,
      alert_type: a.alert_type,
      severity: a.risk_level,
      created_at: a.created_at.toISOString(),
      acknowledged_at: a.resolved_at?.toISOString() ?? null,
    }));
  }

  /**
   * Cohort-level attendance and grade trend for a single year group across
   * a single term (academic_period). Attendance is filtered by the academic
   * period's date range (start_date through end_date); grades are filtered
   * directly on `academic_period_id`. Consumed by the dashboard drill-down
   * from the new-at-risk KPI (Wave 4 impl 15).
   */
  async getTrendsByCohort(
    tenantId: string,
    yearGroupId: string,
    academicPeriodId: string,
  ): Promise<CohortTrendResult> {
    const [students, periods] = await Promise.all([
      this.dataAccess.findStudents(tenantId, {
        where: { year_group_id: yearGroupId },
        select: { id: true },
      }),
      this.dataAccess.findAcademicPeriods(
        tenantId,
        { id: academicPeriodId },
        { id: true, name: true, start_date: true, end_date: true },
      ),
    ]);

    const typedStudents = students as Array<{ id: string }>;
    const typedPeriods = periods as Array<{
      id: string;
      name: string;
      start_date: Date;
      end_date: Date;
    }>;
    const period = typedPeriods[0];

    if (!period) {
      throw new NotFoundException({
        code: 'ACADEMIC_PERIOD_NOT_FOUND',
        message: `Academic period "${academicPeriodId}" not found`,
      });
    }

    if (typedStudents.length === 0) {
      return {
        year_group_id: yearGroupId,
        academic_period_id: period.id,
        period_label: period.name,
        attendance_rate: 0,
        average_grade: 0,
        students_count: 0,
        total_sessions: 0,
        total_grades: 0,
      };
    }

    const studentIds = typedStudents.map((s) => s.id);

    const [attendanceData, gradeData] = await Promise.all([
      this.dataAccess.findAttendanceRecords(tenantId, {
        where: {
          student_id: { in: studentIds },
          session: {
            session_date: { gte: period.start_date, lte: period.end_date },
          },
        },
        select: { status: true },
      }),
      this.dataAccess.findGrades(tenantId, {
        where: {
          student_id: { in: studentIds },
          is_missing: false,
          raw_score: { not: null },
          assessment: {
            status: { in: ['closed', 'locked'] },
            academic_period_id: period.id,
          },
        },
        select: {
          raw_score: true,
          assessment: { select: { max_score: true } },
        },
      }),
    ]);

    const typedAttendance = attendanceData as Array<{ status: string }>;
    const presentCount = typedAttendance.filter(
      (r) => r.status === 'present' || r.status === 'late',
    ).length;
    const totalAttendance = typedAttendance.length;
    const attendanceRate =
      totalAttendance > 0 ? Number(((presentCount / totalAttendance) * 100).toFixed(2)) : 0;

    const typedGrades = gradeData as Array<{
      raw_score: unknown;
      assessment: { max_score: unknown };
    }>;
    let gradeSum = 0;
    let gradeCount = 0;
    for (const grade of typedGrades) {
      const maxScore = Number(grade.assessment.max_score);
      if (maxScore > 0) {
        gradeSum += (Number(grade.raw_score) / maxScore) * 100;
        gradeCount++;
      }
    }
    const averageGrade = gradeCount > 0 ? Number((gradeSum / gradeCount).toFixed(2)) : 0;

    return {
      year_group_id: yearGroupId,
      academic_period_id: period.id,
      period_label: period.name,
      attendance_rate: attendanceRate,
      average_grade: averageGrade,
      students_count: typedStudents.length,
      total_sessions: totalAttendance,
      total_grades: gradeCount,
    };
  }

  /**
   * List students newly flagged at-risk inside the current ISO week (Sunday
   * 00:00 → now). Same boundary semantics as the KPI calculator in
   * `kpi-at-risk-students-new.ts` so that the list stays consistent with the
   * KPI card count. Deduplicated by student (first alert wins), sorted
   * newest-first. Drill-down surface for KPI #3 (Wave 4 impl 14).
   */
  async listAtRiskStudentsNewThisWeek(tenantId: string): Promise<AtRiskStudentNewEntry[]> {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const alerts = (await this.dataAccess.findStudentAcademicRiskAlerts(tenantId, {
      where: { created_at: { gte: weekStart, lt: now } },
      select: {
        id: true,
        student_id: true,
        alert_type: true,
        risk_level: true,
        created_at: true,
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            year_group: { select: { name: true } },
          },
        },
      },
      orderBy: { created_at: 'desc' },
    })) as Array<{
      id: string;
      student_id: string;
      alert_type: string;
      risk_level: string;
      created_at: Date;
      student: {
        id: string;
        first_name: string;
        last_name: string;
        year_group: { name: string } | null;
      };
    }>;

    const seen = new Set<string>();
    const results: AtRiskStudentNewEntry[] = [];

    for (const alert of alerts) {
      if (seen.has(alert.student_id)) continue;
      seen.add(alert.student_id);
      const student = alert.student;
      results.push({
        alert_id: alert.id,
        student_id: alert.student_id,
        student_name: `${student.first_name} ${student.last_name}`,
        year_group_name: student.year_group?.name ?? null,
        risk_level: alert.risk_level,
        alert_type: alert.alert_type,
        created_at: alert.created_at.toISOString(),
      });
    }

    return results;
  }
}
