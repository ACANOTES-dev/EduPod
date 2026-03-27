import { Injectable, Logger } from '@nestjs/common';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AttendanceSummarySnapshot {
  total_days: number;
  days_present: number;
  days_absent: number;
  attendance_percentage: number;
  chronic_absence_flag: boolean;
  period: { from: string; to: string };
}

export interface AcademicSubjectSnapshot {
  subject_name: string;
  current_grade: string | null;
  trend: 'improving' | 'stable' | 'declining' | 'insufficient_data';
}

export interface AcademicPerformanceSnapshot {
  subjects: AcademicSubjectSnapshot[];
}

export interface BehaviourSummarySnapshot {
  total_incidents: number;
  incident_breakdown: Record<string, number>;
  period: { from: string; to: string };
}

export interface InterventionSnapshot {
  type: string;
  description: string;
  continuum_level: number;
  start_date: string;
  outcome: string;
}

export interface ParentContactSnapshot {
  date: string;
  method: string;
  outcome: string;
}

export interface ReferralPrePopulatedData {
  snapshot_generated_at: string;
  attendance: AttendanceSummarySnapshot;
  academic_performance: AcademicPerformanceSnapshot;
  behaviour: BehaviourSummarySnapshot;
  interventions: InterventionSnapshot[];
  parent_contacts: ParentContactSnapshot[];
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class ReferralPrepopulateService {
  private readonly logger = new Logger(ReferralPrepopulateService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generates a frozen point-in-time snapshot of a student's attendance,
   * academic performance, behaviour incidents, intervention history, and
   * parent contacts. All sub-queries run inside a single RLS transaction
   * for data consistency.
   */
  async generateSnapshot(
    tenantId: string,
    studentId: string,
  ): Promise<ReferralPrePopulatedData> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const [attendance, academicPerformance, behaviour, interventions, parentContacts] =
        await Promise.all([
          this.getAttendanceSummary(db, tenantId, studentId),
          this.getAcademicPerformance(db, tenantId, studentId),
          this.getBehaviourSummary(db, tenantId, studentId),
          this.getInterventionHistory(db, tenantId, studentId),
          this.getParentContacts(db, tenantId, studentId),
        ]);

      return {
        snapshot_generated_at: new Date().toISOString(),
        attendance,
        academic_performance: academicPerformance,
        behaviour,
        interventions,
        parent_contacts: parentContacts,
      };
    }) as Promise<ReferralPrePopulatedData>;
  }

  // ─── Private Helpers ────────────────────────────────────────────────────────

  /**
   * Queries attendance records for the current academic year and computes
   * totals, percentage, and chronic absence flag (< 90%).
   */
  private async getAttendanceSummary(
    db: PrismaService,
    tenantId: string,
    studentId: string,
  ): Promise<AttendanceSummarySnapshot> {
    // Find the active academic year to scope the attendance query
    const activeYear = await db.academicYear.findFirst({
      where: { tenant_id: tenantId, status: 'active' },
      select: { id: true, start_date: true, end_date: true },
    });

    if (!activeYear) {
      this.logger.warn(`No active academic year found for tenant ${tenantId}`);
      return {
        total_days: 0,
        days_present: 0,
        days_absent: 0,
        attendance_percentage: 0,
        chronic_absence_flag: false,
        period: { from: '', to: '' },
      };
    }

    const records = await db.dailyAttendanceSummary.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        summary_date: {
          gte: activeYear.start_date,
          lte: activeYear.end_date,
        },
      },
      select: { derived_status: true },
    });

    const totalDays = records.length;
    const daysPresent = records.filter(
      (r) => r.derived_status === 'present' || r.derived_status === 'late',
    ).length;
    const daysAbsent = records.filter(
      (r) => r.derived_status === 'absent',
    ).length;

    const attendancePercentage =
      totalDays > 0 ? Math.round((daysPresent / totalDays) * 10000) / 100 : 0;

    return {
      total_days: totalDays,
      days_present: daysPresent,
      days_absent: daysAbsent,
      attendance_percentage: attendancePercentage,
      chronic_absence_flag: totalDays > 0 && attendancePercentage < 90,
      period: {
        from: activeYear.start_date instanceof Date
          ? activeYear.start_date.toISOString().split('T')[0]!
          : String(activeYear.start_date),
        to: activeYear.end_date instanceof Date
          ? activeYear.end_date.toISOString().split('T')[0]!
          : String(activeYear.end_date),
      },
    };
  }

  /**
   * Queries grades for the student, grouped by subject. For trend
   * calculation, compares the most recent two academic periods. If only
   * one period has data, trend is 'insufficient_data'.
   */
  private async getAcademicPerformance(
    db: PrismaService,
    tenantId: string,
    studentId: string,
  ): Promise<AcademicPerformanceSnapshot> {
    // Find the active academic year
    const activeYear = await db.academicYear.findFirst({
      where: { tenant_id: tenantId, status: 'active' },
      select: { id: true },
    });

    if (!activeYear) {
      return { subjects: [] };
    }

    // Get all periods for the active year, ordered by start_date
    const periods = await db.academicPeriod.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: activeYear.id,
      },
      select: { id: true },
      orderBy: { start_date: 'asc' },
    });

    if (periods.length === 0) {
      return { subjects: [] };
    }

    const periodIds = periods.map((p) => p.id);

    // Query grades for this student in the active year's periods,
    // including the assessment -> subject relation for the subject name
    const grades = await db.grade.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        assessment: {
          academic_period_id: { in: periodIds },
        },
      },
      select: {
        raw_score: true,
        assessment: {
          select: {
            subject: { select: { name: true } },
            academic_period_id: true,
          },
        },
      },
    });

    if (grades.length === 0) {
      return { subjects: [] };
    }

    // Group grades by subject name, then by period
    const subjectPeriodMap = new Map<
      string,
      Map<string, number[]>
    >();

    for (const grade of grades) {
      const subjectName = grade.assessment.subject.name;
      const periodId = grade.assessment.academic_period_id;
      const score = grade.raw_score !== null ? Number(grade.raw_score) : null;

      if (score === null) continue;

      if (!subjectPeriodMap.has(subjectName)) {
        subjectPeriodMap.set(subjectName, new Map());
      }
      const periodMap = subjectPeriodMap.get(subjectName)!;

      if (!periodMap.has(periodId)) {
        periodMap.set(periodId, []);
      }
      periodMap.get(periodId)!.push(score);
    }

    // Build subject snapshots
    const subjects: AcademicSubjectSnapshot[] = [];

    for (const [subjectName, periodMap] of subjectPeriodMap) {
      // Find the most recent period with data for this subject
      const orderedPeriodIds = periodIds.filter((pid) => periodMap.has(pid));

      const latestPeriodId = orderedPeriodIds[orderedPeriodIds.length - 1];
      const latestScores = latestPeriodId ? periodMap.get(latestPeriodId) ?? [] : [];
      const latestAvg =
        latestScores.length > 0
          ? latestScores.reduce((a, b) => a + b, 0) / latestScores.length
          : null;

      const currentGrade = latestAvg !== null ? latestAvg.toFixed(1) : null;

      // Calculate trend
      let trend: AcademicSubjectSnapshot['trend'] = 'insufficient_data';

      if (orderedPeriodIds.length >= 2) {
        const prevPeriodId = orderedPeriodIds[orderedPeriodIds.length - 2]!;
        const prevScores = periodMap.get(prevPeriodId) ?? [];
        const prevAvg =
          prevScores.length > 0
            ? prevScores.reduce((a, b) => a + b, 0) / prevScores.length
            : null;

        if (prevAvg !== null && latestAvg !== null) {
          const diff = latestAvg - prevAvg;
          if (diff > 0.5) {
            trend = 'improving';
          } else if (diff < -0.5) {
            trend = 'declining';
          } else {
            trend = 'stable';
          }
        }
      }

      subjects.push({ subject_name: subjectName, current_grade: currentGrade, trend });
    }

    return { subjects };
  }

  /**
   * Queries behaviour incidents involving this student via the
   * participant join table, grouping by category name.
   */
  private async getBehaviourSummary(
    db: PrismaService,
    tenantId: string,
    studentId: string,
  ): Promise<BehaviourSummarySnapshot> {
    // Find the active academic year for period bounds
    const activeYear = await db.academicYear.findFirst({
      where: { tenant_id: tenantId, status: 'active' },
      select: { start_date: true, end_date: true },
    });

    if (!activeYear) {
      return {
        total_incidents: 0,
        incident_breakdown: {},
        period: { from: '', to: '' },
      };
    }

    // Find all participant records for this student
    const participants = await db.behaviourIncidentParticipant.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        incident: {
          occurred_at: {
            gte: activeYear.start_date,
            lte: activeYear.end_date,
          },
        },
      },
      select: {
        incident: {
          select: {
            category: { select: { name: true } },
          },
        },
      },
    });

    const incidentBreakdown: Record<string, number> = {};
    for (const p of participants) {
      const categoryName = p.incident.category.name;
      incidentBreakdown[categoryName] = (incidentBreakdown[categoryName] ?? 0) + 1;
    }

    const totalIncidents = participants.length;

    return {
      total_incidents: totalIncidents,
      incident_breakdown: incidentBreakdown,
      period: {
        from: activeYear.start_date instanceof Date
          ? activeYear.start_date.toISOString().split('T')[0]!
          : String(activeYear.start_date),
        to: activeYear.end_date instanceof Date
          ? activeYear.end_date.toISOString().split('T')[0]!
          : String(activeYear.end_date),
      },
    };
  }

  /**
   * Queries all pastoral interventions for this student, mapping each
   * to its type, continuum level, status outcome, and description.
   */
  private async getInterventionHistory(
    db: PrismaService,
    tenantId: string,
    studentId: string,
  ): Promise<InterventionSnapshot[]> {
    const interventions = await db.pastoralIntervention.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
      },
      select: {
        intervention_type: true,
        continuum_level: true,
        status: true,
        outcome_notes: true,
        created_at: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return interventions.map((intervention) => ({
      type: intervention.intervention_type,
      description: intervention.outcome_notes ?? 'Active',
      continuum_level: intervention.continuum_level,
      start_date: intervention.created_at.toISOString(),
      outcome: intervention.status,
    }));
  }

  /**
   * Queries the most recent 10 parent contacts for this student,
   * ordered by contact date descending.
   */
  private async getParentContacts(
    db: PrismaService,
    tenantId: string,
    studentId: string,
  ): Promise<ParentContactSnapshot[]> {
    const contacts = await db.pastoralParentContact.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
      },
      select: {
        contact_date: true,
        contact_method: true,
        outcome: true,
      },
      orderBy: { contact_date: 'desc' },
      take: 10,
    });

    return contacts.map((contact) => ({
      date: contact.contact_date.toISOString(),
      method: contact.contact_method,
      outcome: contact.outcome,
    }));
  }
}
