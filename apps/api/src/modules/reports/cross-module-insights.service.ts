import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

export interface AttendanceVsGradePoint {
  student_id: string;
  student_name: string;
  attendance_rate: number;
  average_grade: number;
}

export interface AttendanceVsGradesResult {
  data_points: AttendanceVsGradePoint[];
  correlation_coefficient: number | null;
  insight: string | null;
}

export interface CostPerStudentDataPoint {
  month: string;
  total_payroll: number;
  student_count: number;
  cost_per_student: number;
}

export interface YearGroupHealthScore {
  year_group_id: string;
  year_group_name: string;
  attendance_score: number;
  grade_score: number;
  fee_collection_score: number;
  risk_score: number;
  overall_score: number;
}

export interface TeacherEffectivenessIndex {
  staff_profile_id: string;
  teacher_name: string;
  marking_compliance_rate: number;
  grade_entry_completion_rate: number;
  student_avg_grade: number | null;
  student_avg_attendance: number | null;
  effectiveness_index: number;
}

@Injectable()
export class CrossModuleInsightsService {
  constructor(private readonly prisma: PrismaService) {}

  async attendanceVsGrades(
    tenantId: string,
    startDate?: string,
    endDate?: string,
  ): Promise<AttendanceVsGradesResult> {
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);

    const hasDates = Object.keys(dateFilter).length > 0;

    // Get attendance records grouped by student
    const attendanceGroups = await this.prisma.attendanceRecord.groupBy({
      by: ['student_id'],
      where: {
        tenant_id: tenantId,
        ...(hasDates && {
          session: { session_date: dateFilter },
        }),
      },
      _count: true,
    });

    const presentGroups = await this.prisma.attendanceRecord.groupBy({
      by: ['student_id'],
      where: {
        tenant_id: tenantId,
        status: { in: ['present', 'late'] },
        ...(hasDates && {
          session: { session_date: dateFilter },
        }),
      },
      _count: true,
    });

    const presentMap = new Map(presentGroups.map((g) => [g.student_id, g._count]));
    const totalMap = new Map(attendanceGroups.map((g) => [g.student_id, g._count]));

    // Get grade averages by student
    const gradeGroups = await this.prisma.grade.groupBy({
      by: ['student_id'],
      where: {
        tenant_id: tenantId,
        is_missing: false,
        raw_score: { not: null },
      },
      _avg: { raw_score: true },
    });

    const gradeMap = new Map(gradeGroups.map((g) => [g.student_id, Number(g._avg.raw_score ?? 0)]));

    // Get students with both data points
    const studentIds = [...new Set([...totalMap.keys(), ...gradeMap.keys()])].filter(
      (id) => totalMap.has(id) && gradeMap.has(id),
    );

    if (studentIds.length === 0) {
      return { data_points: [], correlation_coefficient: null, insight: null };
    }

    const students = await this.prisma.student.findMany({
      where: { tenant_id: tenantId, id: { in: studentIds } },
      select: { id: true, first_name: true, last_name: true },
    });

    const studentNameMap = new Map(
      students.map((s) => [s.id, `${s.first_name} ${s.last_name}`]),
    );

    const dataPoints: AttendanceVsGradePoint[] = studentIds.map((id) => {
      const total = totalMap.get(id) ?? 0;
      const present = presentMap.get(id) ?? 0;
      const attendanceRate = total > 0 ? Number(((present / total) * 100).toFixed(2)) : 0;
      return {
        student_id: id,
        student_name: studentNameMap.get(id) ?? 'Unknown',
        attendance_rate: attendanceRate,
        average_grade: Number((gradeMap.get(id) ?? 0).toFixed(2)),
      };
    });

    // Compute Pearson correlation coefficient
    const correlationCoefficient = this.pearsonCorrelation(
      dataPoints.map((d) => d.attendance_rate),
      dataPoints.map((d) => d.average_grade),
    );

    // Generate insight
    let insight: string | null = null;
    const lowAttendanceStudents = dataPoints.filter((d) => d.attendance_rate < 85);
    if (lowAttendanceStudents.length > 0) {
      const avgGradeLow = lowAttendanceStudents.reduce((s, d) => s + d.average_grade, 0) / lowAttendanceStudents.length;
      const avgGradeAll = dataPoints.reduce((s, d) => s + d.average_grade, 0) / dataPoints.length;
      const diff = Math.abs(avgGradeLow - avgGradeAll).toFixed(1);
      insight = `Students below 85% attendance average ${diff}% ${avgGradeLow < avgGradeAll ? 'lower' : 'higher'} grades.`;
    }

    return { data_points: dataPoints, correlation_coefficient: correlationCoefficient, insight };
  }

  async costPerStudent(tenantId: string): Promise<CostPerStudentDataPoint[]> {
    // Get payroll runs by month, sum entry totals
    const payrollRuns = await this.prisma.payrollRun.findMany({
      where: { tenant_id: tenantId, status: 'finalised' },
      select: {
        period_label: true,
        total_pay: true,
      },
      orderBy: { period_label: 'asc' },
    });

    const studentCount = await this.prisma.student.count({
      where: { tenant_id: tenantId, status: 'active' },
    });

    return payrollRuns.map((run) => ({
      month: run.period_label,
      total_payroll: Number(run.total_pay),
      student_count: studentCount,
      cost_per_student: studentCount > 0
        ? Number((Number(run.total_pay) / studentCount).toFixed(2))
        : 0,
    }));
  }

  async yearGroupHealthScores(tenantId: string): Promise<YearGroupHealthScore[]> {
    const yearGroups = await this.prisma.yearGroup.findMany({
      where: { tenant_id: tenantId },
      select: { id: true, name: true },
      orderBy: { display_order: 'asc' },
    });

    const scores: YearGroupHealthScore[] = [];

    for (const yg of yearGroups) {
      // Students in this year group
      const students = await this.prisma.student.findMany({
        where: { tenant_id: tenantId, year_group_id: yg.id, status: 'active' },
        select: { id: true, household_id: true },
      });

      if (students.length === 0) continue;

      const studentIds = students.map((s) => s.id);
      const householdIds = [...new Set(students.map((s) => s.household_id).filter(Boolean))] as string[];

      // Attendance score
      const [totalRecords, presentRecords] = await Promise.all([
        this.prisma.attendanceRecord.count({
          where: { tenant_id: tenantId, student_id: { in: studentIds } },
        }),
        this.prisma.attendanceRecord.count({
          where: {
            tenant_id: tenantId,
            student_id: { in: studentIds },
            status: { in: ['present', 'late'] },
          },
        }),
      ]);

      const attendanceRate = totalRecords > 0 ? (presentRecords / totalRecords) * 100 : 0;
      const attendanceScore = Math.min(100, attendanceRate);

      // Grade score
      const gradeAvg = await this.prisma.grade.aggregate({
        where: {
          tenant_id: tenantId,
          student_id: { in: studentIds },
          is_missing: false,
          raw_score: { not: null },
        },
        _avg: { raw_score: true },
      });
      const gradeScore = gradeAvg._avg.raw_score !== null
        ? Math.min(100, Number(gradeAvg._avg.raw_score))
        : 50;

      // Fee collection score
      let feeScore = 100;
      if (householdIds.length > 0) {
        const invoiceStats = await this.prisma.invoice.aggregate({
          where: {
            tenant_id: tenantId,
            household_id: { in: householdIds },
            status: { notIn: ['void', 'written_off'] },
          },
          _sum: { total_amount: true, balance_amount: true },
        });

        const totalAmount = Number(invoiceStats._sum.total_amount ?? 0);
        const outstanding = Number(invoiceStats._sum.balance_amount ?? 0);

        if (totalAmount > 0) {
          feeScore = ((totalAmount - outstanding) / totalAmount) * 100;
        }
      }

      // Risk score (inverted — more at-risk = lower score)
      const atRiskCount = await this.prisma.studentAcademicRiskAlert.count({
        where: {
          tenant_id: tenantId,
          student_id: { in: studentIds },
          status: 'active',
        },
      });

      const riskScore = Math.max(0, 100 - (atRiskCount / Math.max(1, students.length)) * 100);

      // Weighted overall
      const overallScore = Number(
        (
          attendanceScore * 0.25 +
          gradeScore * 0.25 +
          feeScore * 0.25 +
          riskScore * 0.25
        ).toFixed(1),
      );

      scores.push({
        year_group_id: yg.id,
        year_group_name: yg.name,
        attendance_score: Number(attendanceScore.toFixed(1)),
        grade_score: Number(gradeScore.toFixed(1)),
        fee_collection_score: Number(feeScore.toFixed(1)),
        risk_score: Number(riskScore.toFixed(1)),
        overall_score: overallScore,
      });
    }

    return scores.sort((a, b) => b.overall_score - a.overall_score);
  }

  async teacherEffectivenessIndex(tenantId: string): Promise<TeacherEffectivenessIndex[]> {
    const staffProfiles = await this.prisma.staffProfile.findMany({
      where: { tenant_id: tenantId, employment_status: 'active' },
      select: {
        id: true,
        user: { select: { first_name: true, last_name: true } },
      },
    });

    const results: TeacherEffectivenessIndex[] = [];

    for (const staff of staffProfiles) {
      // Get class IDs this teacher is assigned to
      const classAssignments = await this.prisma.classStaff.findMany({
        where: { tenant_id: tenantId, staff_profile_id: staff.id },
        select: { class_id: true },
      });

      const classIds = classAssignments.map((ca) => ca.class_id);

      if (classIds.length === 0) continue;

      // Attendance marking compliance — sessions submitted vs total sessions
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

      const markingComplianceRate = totalSessions > 0
        ? Number(((submittedSessions / totalSessions) * 100).toFixed(2))
        : 100;

      // Grade entry completion — assessments vs graded assessments
      const assessments = await this.prisma.assessment.findMany({
        where: {
          tenant_id: tenantId,
          class_id: { in: classIds },
          status: { in: ['closed', 'locked'] },
        },
        select: { id: true },
      });

      const assessmentIds = assessments.map((a) => a.id);
      const gradedAssessments = assessmentIds.length > 0
        ? await this.prisma.assessment.count({
            where: {
              id: { in: assessmentIds },
              grades: {
                some: { tenant_id: tenantId, is_missing: false, raw_score: { not: null } },
              },
            },
          })
        : 0;

      const gradeEntryCompletionRate = assessmentIds.length > 0
        ? Number(((gradedAssessments / assessmentIds.length) * 100).toFixed(2))
        : 100;

      // Student average grades
      const enrolments = await this.prisma.classEnrolment.findMany({
        where: { tenant_id: tenantId, class_id: { in: classIds }, status: 'active' },
        select: { student_id: true },
      });

      const studentIds = [...new Set(enrolments.map((e) => e.student_id))];

      const gradeAvg = studentIds.length > 0
        ? await this.prisma.grade.aggregate({
            where: {
              tenant_id: tenantId,
              student_id: { in: studentIds },
              assessment: { class_id: { in: classIds } },
              is_missing: false,
              raw_score: { not: null },
            },
            _avg: { raw_score: true },
          })
        : null;

      const gradeAvgValue = gradeAvg?._avg?.raw_score;
      const studentAvgGrade = gradeAvgValue !== null && gradeAvgValue !== undefined
        ? Number(Number(gradeAvgValue).toFixed(2))
        : null;

      // Student attendance in teacher's classes
      const attendanceInClasses = studentIds.length > 0
        ? await this.prisma.attendanceRecord.groupBy({
            by: ['status'],
            where: {
              tenant_id: tenantId,
              student_id: { in: studentIds },
              session: { class_id: { in: classIds } },
            },
            _count: true,
          })
        : [];

      let studentAvgAttendance: number | null = null;
      const totalAtt = attendanceInClasses.reduce((s, g) => s + g._count, 0);
      if (totalAtt > 0) {
        const presentAtt = attendanceInClasses
          .filter((g) => g.status === 'present' || g.status === 'late')
          .reduce((s, g) => s + g._count, 0);
        studentAvgAttendance = Number(((presentAtt / totalAtt) * 100).toFixed(2));
      }

      // Composite effectiveness index (0-100)
      const effectivenessIndex = Number(
        (
          markingComplianceRate * 0.3 +
          gradeEntryCompletionRate * 0.3 +
          (studentAvgGrade !== null ? Math.min(100, studentAvgGrade) : 50) * 0.2 +
          (studentAvgAttendance !== null ? studentAvgAttendance : 50) * 0.2
        ).toFixed(1),
      );

      results.push({
        staff_profile_id: staff.id,
        teacher_name: `${staff.user.first_name} ${staff.user.last_name}`,
        marking_compliance_rate: markingComplianceRate,
        grade_entry_completion_rate: gradeEntryCompletionRate,
        student_avg_grade: studentAvgGrade,
        student_avg_attendance: studentAvgAttendance,
        effectiveness_index: effectivenessIndex,
      });
    }

    return results.sort((a, b) => b.effectiveness_index - a.effectiveness_index);
  }

  private pearsonCorrelation(xs: number[], ys: number[]): number | null {
    const n = xs.length;
    if (n < 2) return null;

    const meanX = xs.reduce((s, x) => s + x, 0) / n;
    const meanY = ys.reduce((s, y) => s + y, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = xs[i]! - meanX;
      const dy = ys[i]! - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    if (denom === 0) return null;

    return Number((numerator / denom).toFixed(4));
  }
}
