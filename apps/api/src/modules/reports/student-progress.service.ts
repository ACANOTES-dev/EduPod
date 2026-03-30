import { Injectable, NotFoundException } from '@nestjs/common';

import { ReportsDataAccessService } from './reports-data-access.service';

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
}
