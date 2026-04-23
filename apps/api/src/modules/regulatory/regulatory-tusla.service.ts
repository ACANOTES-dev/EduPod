import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AttendanceRecordStatus,
  DailyAttendanceStatus,
  RegulatoryDomain,
  RegulatorySubmissionStatus,
  SanctionType,
  TuslaAbsenceCategory,
} from '@prisma/client';

import {
  type GenerateTuslaAarDto,
  type GenerateTuslaSarDto,
  TUSLA_DEFAULT_THRESHOLD_DAYS,
} from '@school/shared/regulatory';

import { createRlsClient } from '../../common/middleware/rls.middleware';
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

function academicYearPeriodToDates(
  academicYear: string,
  period: number,
): { start_date: string; end_date: string } {
  const parts = academicYear.split('-');
  const first = parts[0] ?? academicYear;
  const second = parts[1] ?? first;
  if (period === 1) {
    return { start_date: `${first}-09-01`, end_date: `${first}-12-31` };
  }
  return { start_date: `${second}-01-01`, end_date: `${second}-06-30` };
}

function parsePeriodLabel(label: string | null): number {
  if (!label) return 1;
  const match = label.match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

// ─── Types used by SAR/AAR generation + CSV export ────────────────────────────

interface SarStudentRow {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
}

interface SarRow {
  student: SarStudentRow;
  total_absent_days: number;
  categories: Record<string, number>;
}

interface AarResult {
  total_students: number;
  total_days_lost: number;
  students_over_20_days: number;
}

function flattenSarRow(row: SarRow) {
  return {
    student_id: row.student.id,
    student_name: `${row.student.first_name} ${row.student.last_name}`.trim(),
    student_number: row.student.student_number,
    absent_days: row.total_absent_days,
    categories: row.categories,
  };
}

const SAR_CSV_CATEGORIES = [
  'illness',
  'urgent_family_reason',
  'holiday',
  'suspension',
  'expulsion',
  'other',
  'unexplained',
] as const;

function escapeCsv(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function buildSarCsv(rows: SarRow[], academicYear: string, period: number): string {
  const header = [
    'student_number',
    'student_name',
    'academic_year',
    'period',
    'total_absent_days',
    ...SAR_CSV_CATEGORIES,
  ];
  const lines = [header.join(',')];

  for (const row of rows) {
    const line = [
      escapeCsv(row.student.student_number),
      escapeCsv(`${row.student.first_name} ${row.student.last_name}`.trim()),
      escapeCsv(academicYear),
      escapeCsv(period),
      escapeCsv(row.total_absent_days),
      ...SAR_CSV_CATEGORIES.map((cat) => escapeCsv(row.categories[cat] ?? 0)),
    ];
    lines.push(line.join(','));
  }

  return lines.join('\r\n');
}

function buildAarCsv(result: AarResult, academicYear: string): string {
  const header = ['academic_year', 'total_students', 'total_days_lost', 'students_over_20_days'];
  const row = [
    escapeCsv(academicYear),
    escapeCsv(result.total_students),
    escapeCsv(result.total_days_lost),
    escapeCsv(result.students_over_20_days),
  ];
  return [header.join(','), row.join(',')].join('\r\n');
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

  async generateSar(tenantId: string, userId: string, dto: GenerateTuslaSarDto) {
    const rows = await this.computeSarRows(tenantId, dto);
    const students = rows.map((r) => flattenSarRow(r));

    const submissionId = await this.persistSubmission(tenantId, userId, {
      submission_type: 'sar',
      academic_year: dto.academic_year,
      period_label: `period_${dto.period}`,
      record_count: students.length,
    });

    return {
      submission_id: submissionId,
      academic_year: dto.academic_year,
      period: dto.period,
      start_date: dto.start_date,
      end_date: dto.end_date,
      total_students: students.length,
      students,
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Server-side CSV export for a previously generated SAR.
   * Re-runs the query against live attendance data — Tusla treats an export
   * as a fresh snapshot of the reporting window; the persisted submission
   * row serves as the audit trail, not a data snapshot.
   */
  async exportSarCsv(
    tenantId: string,
    submissionId: string,
  ): Promise<{ csv: string; filename: string }> {
    const submission = await this.prisma.regulatorySubmission.findFirst({
      where: {
        id: submissionId,
        tenant_id: tenantId,
        domain: RegulatoryDomain.tusla_attendance,
        submission_type: 'sar',
      },
    });
    if (!submission) {
      throw new NotFoundException({
        code: 'TUSLA_SAR_SUBMISSION_NOT_FOUND',
        message: `SAR submission with id "${submissionId}" not found`,
      });
    }

    const period = parsePeriodLabel(submission.period_label);
    const { start_date, end_date } = academicYearPeriodToDates(submission.academic_year, period);

    const rows = await this.computeSarRows(tenantId, {
      academic_year: submission.academic_year,
      period,
      start_date,
      end_date,
    });

    const csv = buildSarCsv(rows, submission.academic_year, period);
    const filename = `tusla-sar-${submission.academic_year}-p${period}.csv`;
    return { csv, filename };
  }

  // ─── AAR (Annual Attendance Report) Generation ────────────────────────────────

  async generateAar(tenantId: string, userId: string, dto: GenerateTuslaAarDto) {
    const aar = await this.computeAar(tenantId, dto);

    const submissionId = await this.persistSubmission(tenantId, userId, {
      submission_type: 'aar',
      academic_year: dto.academic_year,
      period_label: null,
      record_count: aar.total_students,
    });

    return {
      submission_id: submissionId,
      academic_year: dto.academic_year,
      total_students: aar.total_students,
      total_days_lost: aar.total_days_lost,
      students_over_20_days: aar.students_over_20_days,
      generated_at: new Date().toISOString(),
    };
  }

  async exportAarCsv(
    tenantId: string,
    submissionId: string,
  ): Promise<{ csv: string; filename: string }> {
    const submission = await this.prisma.regulatorySubmission.findFirst({
      where: {
        id: submissionId,
        tenant_id: tenantId,
        domain: RegulatoryDomain.tusla_attendance,
        submission_type: 'aar',
      },
    });
    if (!submission) {
      throw new NotFoundException({
        code: 'TUSLA_AAR_SUBMISSION_NOT_FOUND',
        message: `AAR submission with id "${submissionId}" not found`,
      });
    }

    const aar = await this.computeAar(tenantId, { academic_year: submission.academic_year });
    const csv = buildAarCsv(aar, submission.academic_year);
    const filename = `tusla-aar-${submission.academic_year}.csv`;
    return { csv, filename };
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────

  private async computeSarRows(tenantId: string, dto: GenerateTuslaSarDto): Promise<SarRow[]> {
    const startDate = new Date(dto.start_date);
    const endDate = new Date(dto.end_date);

    const records = await this.attendanceReadFacade.findRecordsByStatusWithSession(tenantId, {
      statusNot: AttendanceRecordStatus.present,
      sessionDateRange: { gte: startDate, lte: endDate },
    });

    const mappings = await this.prisma.tuslaAbsenceCodeMapping.findMany({
      where: { tenant_id: tenantId },
    });

    const categoryLookup = new Map<string, string>();
    for (const m of mappings) {
      categoryLookup.set(m.attendance_status, PRISMA_CATEGORY_TO_API[m.tusla_category] ?? 'other');
    }

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

    const studentIds = [...studentData.keys()];
    const students =
      studentIds.length > 0
        ? await this.studentReadFacade.findManyGeneric(tenantId, {
            where: { id: { in: studentIds } },
            select: STUDENT_SELECT,
          })
        : [];

    const studentMap = new Map(
      (
        students as Array<{
          id: string;
          first_name: string;
          last_name: string;
          student_number: string | null;
        }>
      ).map((s) => [s.id, s]),
    );

    return studentIds
      .map((id): SarRow | null => {
        const student = studentMap.get(id);
        if (!student) return null;
        const categories = studentData.get(id)!;
        const totalDays = Object.values(categories).reduce((sum, n) => sum + n, 0);
        return { student, total_absent_days: totalDays, categories };
      })
      .filter((r): r is SarRow => r !== null)
      .sort((a, b) => b.total_absent_days - a.total_absent_days);
  }

  private async computeAar(tenantId: string, dto: { academic_year: string }): Promise<AarResult> {
    const { start, end } = academicYearToDateRange(dto.academic_year);

    const totalStudents = await this.studentReadFacade.count(tenantId, { status: 'active' });

    const totalDaysLost = await this.attendanceReadFacade.countDailySummaries(tenantId, {
      derivedStatuses: ABSENT_STATUSES,
      dateFilter: { gte: start, lte: end },
    });

    const groups = await this.attendanceReadFacade.groupDailySummariesByStudent(tenantId, {
      derivedStatuses: ABSENT_STATUSES,
      dateFilter: { gte: start, lte: end },
    });

    const studentsOver20 = groups.filter(
      (g) => g._count.student_id >= TUSLA_DEFAULT_THRESHOLD_DAYS,
    ).length;

    return {
      total_students: totalStudents,
      total_days_lost: totalDaysLost,
      students_over_20_days: studentsOver20,
    };
  }

  private async persistSubmission(
    tenantId: string,
    userId: string,
    payload: {
      submission_type: 'sar' | 'aar';
      academic_year: string;
      period_label: string | null;
      record_count: number;
    },
  ): Promise<string> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    return rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      const now = new Date();
      const row = await db.regulatorySubmission.create({
        data: {
          tenant_id: tenantId,
          domain: RegulatoryDomain.tusla_attendance,
          submission_type: payload.submission_type,
          academic_year: payload.academic_year,
          period_label: payload.period_label,
          status: RegulatorySubmissionStatus.reg_submitted,
          generated_at: now,
          generated_by_id: userId,
          submitted_at: now,
          submitted_by_id: userId,
          record_count: payload.record_count,
        },
        select: { id: true },
      });
      return row.id;
    });
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
