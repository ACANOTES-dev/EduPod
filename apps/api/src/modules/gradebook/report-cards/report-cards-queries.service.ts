import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';

import type { ListReportCardLibraryQuery } from '@school/shared';

import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../s3/s3.service';
import { SchedulesReadFacade } from '../../schedules/schedules-read.facade';
import { StaffProfileReadFacade } from '../../staff-profiles/staff-profile-read.facade';
import { StudentReadFacade } from '../../students/student-read.facade';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ListReportCardsParams {
  page: number;
  pageSize: number;
  student_id?: string;
  academic_period_id?: string;
  status?: string;
  include_revisions?: boolean;
  /**
   * B12 teacher scoping: when set, restrict results to report cards whose
   * student is enrolled in one of these class_ids. Used by the controller
   * to narrow non-admin requests to the teacher's own classes.
   */
  class_ids?: string[];
  /**
   * Student/parent scoping: when set, restrict results to report cards
   * belonging to these specific student IDs. Used by the controller to
   * scope parent/student users to their own linked students.
   */
  student_ids?: string[];
}

export interface ClassMatrixCell {
  score: number | null;
  grade: string | null;
  assessment_count: number;
  has_override: boolean;
}

export interface ClassMatrixResponse {
  class: {
    id: string;
    name: string;
    year_group: { id: string; name: string } | null;
  };
  period: { id: string; name: string } | { id: 'all'; name: string };
  students: Array<{
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
    preferred_second_language: string | null;
  }>;
  subjects: Array<{ id: string; name: string; code: string | null }>;
  /** cells[student_id][subject_id] */
  cells: Record<string, Record<string, ClassMatrixCell>>;
  overall_by_student: Record<
    string,
    {
      weighted_average: number | null;
      overall_grade: string | null;
      /** null unless the student is in the top 3 (dense rank, ties share). */
      rank_position: number | null;
    }
  >;
}

export interface ReportCardLibraryRow {
  id: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
  };
  class: { id: string; name: string } | null;
  academic_period: { id: string; name: string };
  template: {
    id: string | null;
    content_scope: string | null;
    locale: string;
  };
  pdf_storage_key: string | null;
  pdf_download_url: string | null;
  generated_at: string;
  languages_available: string[];
  status: 'draft' | 'published' | 'revised' | 'superseded';
  batch_job_id: string | null;
}

export interface GroupedLibraryStudentRow {
  id: string;
  student: {
    id: string;
    first_name: string;
    last_name: string;
    student_number: string | null;
  };
  status: 'draft' | 'published' | 'revised' | 'superseded';
  locale: string;
  template: { id: string | null; name: string | null };
  pdf_storage_key: string | null;
  pdf_download_url: string | null;
  generated_at: string;
}

export interface GroupedLibraryClassNode {
  class_id: string;
  class_name: string;
  year_group: { id: string; name: string } | null;
  student_count: number;
  report_card_count: number;
  report_cards: GroupedLibraryStudentRow[];
}

export interface GroupedLibraryRunNode {
  /** Null when the rows don't carry a batch_job_id (legacy pre-Phase-B rows). */
  batch_job_id: string | null;
  run_status: 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'legacy' | null;
  run_started_at: string;
  run_finished_at: string | null;
  period_label: string;
  template_name: string | null;
  design_key: string | null;
  total_report_cards: number;
  classes: GroupedLibraryClassNode[];
}

/**
 * Scope descriptor passed to `listReportCardLibrary` by the controller.
 * `isAdmin` is true for any user holding `report_cards.view` or
 * `report_cards.manage` — those roles see every document in the tenant.
 * Teachers (`report_cards.comment` only) are scoped to students enrolled
 * in classes where they teach subjects or are the homeroom teacher.
 */
export interface LibraryActorScope {
  user_id: string;
  is_admin: boolean;
}

interface MatrixAggregationRow {
  computed: number | null;
  display: string | null;
  has_override: boolean;
  assessment_count: number;
}

interface GradingScaleRange {
  min: number;
  label: string;
}

interface GradingScaleGrade {
  label: string;
  numeric_value?: number;
}

interface GradingScaleConfig {
  type?: 'numeric' | 'letter' | 'custom';
  ranges?: GradingScaleRange[];
  grades?: GradingScaleGrade[];
}

// ─── Signed URL TTL ─────────────────────────────────────────────────────────
// Library downloads use short-lived signed URLs. The frontend must request
// fresh URLs per download — they are not persisted anywhere client-side.
const LIBRARY_SIGNED_URL_TTL_SECONDS = 300; // 5 minutes

/**
 * Build the save-as filename for a single report card PDF download. We shape
 * it as `{Last} {First} — Report Card — {Period} ({LOCALE}).pdf` so the file
 * sorts sensibly in a downloads folder and the admin can spot the period and
 * locale at a glance. The S3 layer further sanitises to ASCII so this string
 * only needs to be human-readable, not shell-safe.
 */
function buildReportCardDownloadFilename(args: {
  first_name: string;
  last_name: string;
  period_name: string;
  locale: string;
}): string {
  const name = `${args.last_name} ${args.first_name}`.trim() || 'Report Card';
  const period = args.period_name || 'Full Year';
  const locale = (args.locale || 'en').toUpperCase();
  return `${name} — Report Card — ${period} (${locale}).pdf`;
}

/**
 * Read-only query operations for report cards.
 * Extracted from ReportCardsService as part of CQRS-lite split (M-16).
 *
 * All methods are side-effect-free — no writes, no cache invalidation, no state transitions.
 */
@Injectable()
export class ReportCardsQueriesService {
  private readonly logger = new Logger(ReportCardsQueriesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly staffProfileReadFacade: StaffProfileReadFacade,
    private readonly schedulesReadFacade: SchedulesReadFacade,
    private readonly s3Service: S3Service,
  ) {}
  // ─── LIST ───────────────────────────────────────────────────────────────────

  /**
   * List report cards with filters and pagination.
   * Excludes revised by default unless include_revisions=true.
   */
  async findAll(tenantId: string, params: ListReportCardsParams) {
    const {
      page,
      pageSize,
      student_id,
      student_ids,
      academic_period_id,
      status,
      include_revisions,
      class_ids,
    } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ReportCardWhereInput = { tenant_id: tenantId };

    if (student_id) {
      where.student_id = student_id;
    } else if (student_ids && student_ids.length > 0) {
      where.student_id = { in: student_ids };
    }

    if (academic_period_id) {
      where.academic_period_id = academic_period_id;
    }

    if (status) {
      where.status = status as $Enums.ReportCardStatus;
    }

    // Exclude revised report cards by default
    if (!include_revisions) {
      where.status = where.status ? where.status : { not: 'revised' };
    }

    // B12 teacher scoping: narrow to report cards for students who are
    // either the homeroom student of one of the allowed classes OR are
    // enrolled via class_enrolments. Either link is sufficient.
    if (class_ids && class_ids.length > 0) {
      where.student = {
        OR: [
          { class_homeroom_id: { in: class_ids } },
          { class_enrolments: { some: { class_id: { in: class_ids } } } },
        ],
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.reportCard.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ created_at: 'desc' }],
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              student_number: true,
            },
          },
          academic_period: {
            select: { id: true, name: true },
          },
          published_by: {
            select: { id: true, first_name: true, last_name: true },
          },
        },
      }),
      this.prisma.reportCard.count({ where }),
    ]);

    return {
      data,
      meta: { page, pageSize, total },
    };
  }

  // ─── FIND ONE ───────────────────────────────────────────────────────────────

  /**
   * Get a single report card with its revision chain.
   */
  async findOne(tenantId: string, id: string) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id, tenant_id: tenantId },
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
          },
        },
        academic_period: {
          select: { id: true, name: true },
        },
        published_by: {
          select: { id: true, first_name: true, last_name: true },
        },
        revision_of: {
          select: {
            id: true,
            status: true,
            published_at: true,
            created_at: true,
          },
        },
        revisions: {
          select: {
            id: true,
            status: true,
            published_at: true,
            created_at: true,
          },
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!reportCard) {
      throw new NotFoundException({
        code: 'REPORT_CARD_NOT_FOUND',
        message: `Report card with id "${id}" not found`,
      });
    }

    return reportCard;
  }

  // ─── CLASS MATRIX (impl 06) ─────────────────────────────────────────────────

  /**
   * Class-first matrix view for the report cards surface.
   *
   * Structurally mirrors the gradebook matrix and reuses the same
   * `period_grade_snapshots` source of truth — the grades rendered here are
   * identical to what the gradebook shows. This service does NOT recompute
   * any grades from assessments; it reads the denormalised snapshot rows and
   * applies the tenant's subject / period weights to derive per-student
   * weighted averages for rank calculation.
   *
   * The aggregation contract (snapshots + subject weights + period weights)
   * is the same contract used by `PeriodGradeComputationService.computeCrossSubject`
   * and `computeYearOverview`. If that contract changes, this method must
   * change with it — see `docs/architecture/danger-zones.md`.
   */
  async getClassMatrix(
    tenantId: string,
    params: { classId: string; academicPeriodId: string | 'all' },
  ): Promise<ClassMatrixResponse> {
    const { classId, academicPeriodId } = params;

    // 1. Verify the class belongs to the tenant and load its metadata via
    // the classes read facade (keeps gradebook off direct Prisma access).
    const classRows = (await this.classesReadFacade.findClassesGeneric(
      tenantId,
      { id: classId },
      {
        id: true,
        name: true,
        academic_year_id: true,
        year_group: { select: { id: true, name: true } },
      },
    )) as Array<{
      id: string;
      name: string;
      academic_year_id: string | null;
      year_group: { id: string; name: string } | null;
    }>;
    const classRow = classRows[0] ?? null;

    if (!classRow) {
      throw new NotFoundException({
        code: 'CLASS_NOT_FOUND',
        message: `Class with id "${classId}" not found`,
      });
    }

    // 2. Resolve the period (or 'all')
    const isAllPeriods = academicPeriodId === 'all';
    let periodMeta: { id: string; name: string } | { id: 'all'; name: string };
    let targetPeriodIds: string[] = [];

    if (isAllPeriods) {
      if (!classRow.academic_year_id) {
        // No academic year → no periods to aggregate
        periodMeta = { id: 'all', name: 'Full year' };
      } else {
        const periods = await this.academicReadFacade.findPeriodsForYear(
          tenantId,
          classRow.academic_year_id,
        );
        targetPeriodIds = periods.map((p) => p.id);
        periodMeta = { id: 'all', name: 'Full year' };
      }
    } else {
      const period = await this.academicReadFacade.findPeriodById(tenantId, academicPeriodId);
      if (!period) {
        throw new NotFoundException({
          code: 'PERIOD_NOT_FOUND',
          message: `Academic period with id "${academicPeriodId}" not found`,
        });
      }
      targetPeriodIds = [period.id];
      periodMeta = { id: period.id, name: period.name };
    }

    // 3. Load active students enrolled in the class
    const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
      tenantId,
      { class_id: classId, status: 'active' },
      {
        id: true,
        student_id: true,
        status: true,
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
            preferred_second_language: true,
          },
        },
      },
      { student: { last_name: 'asc' } },
    )) as Array<{
      student: {
        id: string;
        first_name: string;
        last_name: string;
        student_number: string | null;
        preferred_second_language: string | null;
      };
    }>;

    const students = enrolments.map((e) => e.student);
    const studentIds = students.map((s) => s.id);

    // 4. Load subjects assigned to the class via the curriculum matrix
    const classSubjects = await this.prisma.classSubjectGradeConfig.findMany({
      where: { tenant_id: tenantId, class_id: classId },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        grading_scale: { select: { config_json: true } },
      },
      orderBy: { subject: { name: 'asc' } },
    });

    const subjects = classSubjects.map((cs) => ({
      id: cs.subject.id,
      name: cs.subject.name,
      code: cs.subject.code,
    }));
    const subjectIds = subjects.map((s) => s.id);

    // Per-subject grading scale map — used to re-derive the letter grade for
    // each cell from the aggregated score. Without this we would echo the last
    // period's raw `display_value` token (which may be a percentage string,
    // and may not match the aggregated value).
    const subjectScaleMap = new Map<string, GradingScaleConfig>();
    for (const cs of classSubjects) {
      if (cs.grading_scale?.config_json) {
        subjectScaleMap.set(
          cs.subject.id,
          cs.grading_scale.config_json as unknown as GradingScaleConfig,
        );
      }
    }

    // Keep a grading scale around for the overall letter grade (heuristic:
    // first subject with a scale).
    let overallScale: GradingScaleConfig | null = null;
    for (const cs of classSubjects) {
      if (cs.grading_scale?.config_json) {
        overallScale = cs.grading_scale.config_json as unknown as GradingScaleConfig;
        break;
      }
    }

    // Early exit: no students, no subjects, or no periods — still return a
    // valid shell so the frontend can render an empty state.
    if (studentIds.length === 0 || subjectIds.length === 0 || targetPeriodIds.length === 0) {
      return {
        class: {
          id: classRow.id,
          name: classRow.name,
          year_group: classRow.year_group ?? null,
        },
        period: periodMeta,
        students,
        subjects,
        cells: this.emptyMatrixCells(studentIds, subjectIds),
        overall_by_student: Object.fromEntries(
          studentIds.map((sid) => [
            sid,
            { weighted_average: null, overall_grade: null, rank_position: null },
          ]),
        ),
      };
    }

    // 5. Load period grade snapshots for (students × subjects × periods)
    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: {
        tenant_id: tenantId,
        class_id: classId,
        student_id: { in: studentIds },
        subject_id: { in: subjectIds },
        academic_period_id: { in: targetPeriodIds },
      },
      select: {
        student_id: true,
        subject_id: true,
        academic_period_id: true,
        computed_value: true,
        display_value: true,
        overridden_value: true,
      },
    });

    // 6. Count graded assessments per (subject, period) for the matrix cells.
    // The per-cell count is the same for every student because the assessment
    // is assigned to the class; we attribute it to each student in the class.
    const assessmentCountRows = await this.prisma.assessment.groupBy({
      by: ['subject_id', 'academic_period_id'],
      where: {
        tenant_id: tenantId,
        class_id: classId,
        subject_id: { in: subjectIds },
        academic_period_id: { in: targetPeriodIds },
        status: { notIn: ['draft', 'closed'] },
      },
      _count: { _all: true },
    });
    const assessmentCountBySubject = new Map<string, number>();
    for (const row of assessmentCountRows) {
      const existing = assessmentCountBySubject.get(row.subject_id) ?? 0;
      assessmentCountBySubject.set(row.subject_id, existing + row._count._all);
    }

    // 7. Build per-(student, subject) aggregation rows from snapshots.
    // For the all-periods view, each subject cell pools the period snapshots
    // using the class's period weights (with equal-weight fallback) — the
    // same rule used by gradebook's `computeYearOverview`.
    const periodWeights = isAllPeriods
      ? await this.resolvePeriodWeightsForClass(
          tenantId,
          classId,
          classRow.academic_year_id,
          targetPeriodIds,
        )
      : new Map<string, number>([[targetPeriodIds[0]!, 1]]);

    const cellMap = this.buildMatrixCells(
      studentIds,
      subjectIds,
      snapshots,
      periodWeights,
      assessmentCountBySubject,
      subjectScaleMap,
    );

    // 8. Compute the weighted overall per student using the subject weights
    //    for the selected period (first period for all-periods view).
    // For the all-periods view we compute per-period overalls then combine
    // with period weights — same pattern as computeYearOverview.
    const overallByStudent = new Map<
      string,
      { weighted_average: number | null; overall_grade: string | null }
    >();

    if (isAllPeriods) {
      // Resolve subject weights per period, since they may differ.
      const subjectWeightsByPeriod = new Map<string, Map<string, number>>();
      for (const periodId of targetPeriodIds) {
        const weights = await this.resolveSubjectWeightsForClass(
          tenantId,
          classId,
          periodId,
          subjectIds,
        );
        subjectWeightsByPeriod.set(periodId, weights);
      }

      for (const studentId of studentIds) {
        const periodOveralls: Array<{ periodId: string; value: number }> = [];
        for (const periodId of targetPeriodIds) {
          const sw = subjectWeightsByPeriod.get(periodId) ?? new Map();
          const overall = this.computePeriodOverall(studentId, subjectIds, periodId, snapshots, sw);
          if (overall !== null) periodOveralls.push({ periodId, value: overall });
        }
        const year = this.combinePeriodsWithWeights(periodOveralls, periodWeights);
        overallByStudent.set(studentId, {
          weighted_average: year,
          overall_grade: year !== null ? this.applyGradingScale(year, overallScale) : null,
        });
      }
    } else {
      const periodId = targetPeriodIds[0]!;
      const subjectWeights = await this.resolveSubjectWeightsForClass(
        tenantId,
        classId,
        periodId,
        subjectIds,
      );
      for (const studentId of studentIds) {
        const overall = this.computePeriodOverall(
          studentId,
          subjectIds,
          periodId,
          snapshots,
          subjectWeights,
        );
        overallByStudent.set(studentId, {
          weighted_average: overall,
          overall_grade: overall !== null ? this.applyGradingScale(overall, overallScale) : null,
        });
      }
    }

    // 9. Dense rank on weighted_average (descending). Only ranks 1, 2, 3 are
    //    emitted — everyone else gets null. Ties share the rank.
    const rankByStudent = this.computeDenseRankTop3(overallByStudent);

    const overall_by_student: Record<
      string,
      {
        weighted_average: number | null;
        overall_grade: string | null;
        rank_position: number | null;
      }
    > = {};
    for (const studentId of studentIds) {
      const overall = overallByStudent.get(studentId) ?? {
        weighted_average: null,
        overall_grade: null,
      };
      overall_by_student[studentId] = {
        weighted_average: overall.weighted_average,
        overall_grade: overall.overall_grade,
        rank_position: rankByStudent.get(studentId) ?? null,
      };
    }

    return {
      class: {
        id: classRow.id,
        name: classRow.name,
        year_group: classRow.year_group ?? null,
      },
      period: periodMeta,
      students,
      subjects,
      cells: cellMap,
      overall_by_student,
    };
  }

  // ─── REPORT CARD LIBRARY (impl 06) ──────────────────────────────────────────

  /**
   * List current (non-superseded) report cards visible to the caller.
   *
   * Scoping rules:
   * - `is_admin=true` (holder of `report_cards.view` or `report_cards.manage`):
   *   every document in the tenant.
   * - `is_admin=false` (teacher — `report_cards.comment` only): only documents
   *   belonging to students in classes where the teacher has a teaching
   *   competency or is the homeroom teacher.
   *
   * Each returned row carries a short-lived signed download URL (5 minutes);
   * the frontend must request fresh URLs per download.
   */
  async listReportCardLibrary(
    tenantId: string,
    actor: LibraryActorScope,
    query: ListReportCardLibraryQuery,
  ): Promise<{
    data: ReportCardLibraryRow[];
    meta: { page: number; pageSize: number; total: number; next_cursor: string | null };
  }> {
    const { page, pageSize, class_id, year_group_id, academic_period_id, language } = query;
    const cursor = (query as { cursor?: string }).cursor;
    const academicYearId = (query as { academic_year_id?: string }).academic_year_id;
    // Keyset path skips the offset compute; offset path keeps the
    // traditional (page-1)*pageSize. Bug RC-C038.
    const skip = cursor ? 0 : (page - 1) * pageSize;

    // 1. Resolve teacher scoping (if applicable)
    let scopedStudentIds: string[] | null = null;
    if (!actor.is_admin) {
      scopedStudentIds = await this.resolveTeacherVisibleStudents(tenantId, actor.user_id);
      if (scopedStudentIds.length === 0) {
        return { data: [], meta: { page, pageSize, total: 0, next_cursor: null } };
      }
    }

    const where: Prisma.ReportCardWhereInput = {
      tenant_id: tenantId,
      status: { not: 'superseded' },
    };

    if (scopedStudentIds !== null) {
      where.student_id = { in: scopedStudentIds };
    }
    // Phase 1b — Option B: the library filter accepts a period UUID (per-
    // period scope) OR the literal "full_year" sentinel (NULL-period scope),
    // optionally narrowed by academic_year_id.
    if (academic_period_id === 'full_year') {
      where.academic_period_id = null;
      if (academicYearId) where.academic_year_id = academicYearId;
    } else if (academic_period_id) {
      where.academic_period_id = academic_period_id;
    } else if (academicYearId) {
      where.academic_year_id = academicYearId;
    }
    if (language) {
      where.template_locale = language;
    }

    if (class_id || year_group_id) {
      // Resolve classId filter via active enrolments to a student_id list, or
      // fall back to students.year_group_id for year-group filtering. We route
      // the query through StudentReadFacade to honour module boundaries.
      const studentFilter: Prisma.StudentWhereInput = {};
      if (year_group_id) studentFilter.year_group_id = year_group_id;
      if (class_id) {
        studentFilter.class_enrolments = {
          some: { tenant_id: tenantId, class_id, status: 'active' },
        };
      }
      const filteredStudents = (await this.studentReadFacade.findManyGeneric(tenantId, {
        where: studentFilter,
        select: { id: true },
      })) as Array<{ id: string }>;
      const filteredIds = filteredStudents.map((s) => s.id);
      // Intersect with existing scoping (if teachers)
      let effectiveIds = filteredIds;
      if (scopedStudentIds !== null) {
        const scopedSet = new Set(scopedStudentIds);
        effectiveIds = filteredIds.filter((id) => scopedSet.has(id));
      }
      if (effectiveIds.length === 0) {
        return { data: [], meta: { page, pageSize, total: 0, next_cursor: null } };
      }
      where.student_id = { in: effectiveIds };
    }

    // Keyset cursor decode: the cursor encodes the last row's
    // (created_at, id) pair so the next page skips rows that sort earlier.
    // Using `(created_at, id)` guarantees a total order even when many
    // rows share the same millisecond. Bug RC-C038.
    let keysetWhere: Prisma.ReportCardWhereInput | null = null;
    if (cursor) {
      try {
        const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
        const [createdAtIso, cursorId] = decoded.split('::');
        const createdAt = createdAtIso ? new Date(createdAtIso) : null;
        if (createdAt && !Number.isNaN(createdAt.getTime()) && cursorId) {
          keysetWhere = {
            OR: [
              { created_at: { lt: createdAt } },
              { created_at: createdAt, id: { lt: cursorId } },
            ],
          };
        }
      } catch (err) {
        // Invalid cursor falls through to offset mode — caller's problem.
        this.logger.warn(
          `[listReportCardLibrary] ignoring malformed cursor: ${(err as Error).message}`,
        );
      }
    }
    const effectiveWhere: Prisma.ReportCardWhereInput = keysetWhere
      ? { AND: [where, keysetWhere] }
      : where;

    // 2. Page of report cards with joins
    const [rows, total] = await Promise.all([
      this.prisma.reportCard.findMany({
        where: effectiveWhere,
        skip,
        take: pageSize,
        orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              student_number: true,
              homeroom_class: { select: { id: true, name: true } },
            },
          },
          academic_period: {
            select: { id: true, name: true },
          },
          template: {
            select: { id: true, content_scope: true, locale: true },
          },
        },
      }),
      this.prisma.reportCard.count({ where }),
    ]);

    // 3. Build a (student_id, period_id|year_id, template_id) → locales
    //    lookup so each row can report the other languages available for
    //    the same document. Full-year rows (period_id IS NULL) key on
    //    academic_year_id instead.
    const groupingKeys = rows.map((r) =>
      this.buildLibraryGroupKey(
        r.student_id,
        r.academic_period_id,
        r.academic_year_id,
        r.template_id,
      ),
    );
    const languageLookup = new Map<string, string[]>();
    if (groupingKeys.length > 0) {
      // Fetch all non-superseded siblings in a single query — limited to this
      // page's grouping keys plus the explicit tenant + status filter.
      const periodIds = rows
        .map((r) => r.academic_period_id)
        .filter((id): id is string => id !== null);
      const yearIds = Array.from(new Set(rows.map((r) => r.academic_year_id)));
      const siblings = await this.prisma.reportCard.findMany({
        where: {
          tenant_id: tenantId,
          status: { not: 'superseded' },
          student_id: { in: rows.map((r) => r.student_id) },
          OR: [
            ...(periodIds.length > 0 ? [{ academic_period_id: { in: periodIds } }] : []),
            { academic_period_id: null, academic_year_id: { in: yearIds } },
          ],
        },
        select: {
          student_id: true,
          academic_period_id: true,
          academic_year_id: true,
          template_id: true,
          template_locale: true,
        },
      });
      for (const s of siblings) {
        const key = this.buildLibraryGroupKey(
          s.student_id,
          s.academic_period_id,
          s.academic_year_id,
          s.template_id,
        );
        const list = languageLookup.get(key) ?? [];
        if (!list.includes(s.template_locale)) list.push(s.template_locale);
        languageLookup.set(key, list);
      }
    }

    // 4. Map to response rows with signed URLs
    const data: ReportCardLibraryRow[] = await Promise.all(
      rows.map(async (row) => {
        const key = this.buildLibraryGroupKey(
          row.student_id,
          row.academic_period_id,
          row.academic_year_id,
          row.template_id,
        );
        const languages_available = (languageLookup.get(key) ?? [row.template_locale]).sort();

        let pdfDownloadUrl: string | null = null;
        if (row.pdf_storage_key) {
          try {
            pdfDownloadUrl = await this.s3Service.getPresignedUrl(
              row.pdf_storage_key,
              LIBRARY_SIGNED_URL_TTL_SECONDS,
              {
                downloadFilename: buildReportCardDownloadFilename({
                  first_name: row.student.first_name,
                  last_name: row.student.last_name,
                  period_name: row.academic_period?.name ?? 'Full Year',
                  locale: row.template_locale,
                }),
              },
            );
          } catch (err) {
            this.logger.error(
              `[listReportCardLibrary] failed to presign ${row.pdf_storage_key}: ${(err as Error).message}`,
            );
            pdfDownloadUrl = null;
          }
        }

        return {
          id: row.id,
          student: {
            id: row.student.id,
            first_name: row.student.first_name,
            last_name: row.student.last_name,
            student_number: row.student.student_number,
          },
          class: row.student.homeroom_class
            ? { id: row.student.homeroom_class.id, name: row.student.homeroom_class.name }
            : null,
          // Full-year report cards (academic_period_id IS NULL) surface a
          // synthetic "Full Year" entry with a stable id derived from the
          // academic year so the frontend can group/filter them consistently.
          academic_period: row.academic_period
            ? { id: row.academic_period.id, name: row.academic_period.name }
            : { id: `full-year:${row.academic_year_id}`, name: 'Full Year' },
          template: {
            id: row.template?.id ?? null,
            content_scope: row.template?.content_scope ?? null,
            locale: row.template_locale,
          },
          pdf_storage_key: row.pdf_storage_key,
          pdf_download_url: pdfDownloadUrl,
          generated_at: row.created_at.toISOString(),
          languages_available,
          status: row.status,
          batch_job_id: row.batch_job_id ?? null,
        };
      }),
    );

    // Next cursor for keyset pagination: encode the last row so the next
    // page picks up after it. When `rows.length < pageSize` we're at the
    // end of the stream and return null instead. Bug RC-C038.
    let nextCursor: string | null = null;
    if (rows.length === pageSize) {
      const last = rows[rows.length - 1];
      if (last) {
        nextCursor = Buffer.from(`${last.created_at.toISOString()}::${last.id}`, 'utf8').toString(
          'base64url',
        );
      }
    }

    return {
      data,
      meta: { page, pageSize, total, next_cursor: nextCursor },
    };
  }

  // ─── Grouped library (Phase B) ──────────────────────────────────────────────
  //
  // Returns every non-superseded report card in the tenant bucketed by
  // generation run → class → student. The frontend library uses this to
  // render the "by run" view where admins see each run as a collapsible
  // group with per-class sub-rows they can delete, publish, or bundle.
  //
  // Teacher scoping is identical to `listReportCardLibrary`: admins see
  // every row; teachers (`report_cards.comment` only) are restricted to the
  // students they teach. Rows predating the batch_job_id column are gathered
  // under a synthetic `legacy` bucket so nothing is invisible.

  async listReportCardLibraryGrouped(
    tenantId: string,
    actor: LibraryActorScope,
  ): Promise<{ data: GroupedLibraryRunNode[] }> {
    let scopedStudentIds: string[] | null = null;
    if (!actor.is_admin) {
      scopedStudentIds = await this.resolveTeacherVisibleStudents(tenantId, actor.user_id);
      if (scopedStudentIds.length === 0) {
        return { data: [] };
      }
    }

    const where: Prisma.ReportCardWhereInput = {
      tenant_id: tenantId,
      status: { not: 'superseded' },
    };
    if (scopedStudentIds !== null) {
      where.student_id = { in: scopedStudentIds };
    }

    const rows = await this.prisma.reportCard.findMany({
      where,
      orderBy: [{ created_at: 'desc' }],
      include: {
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            student_number: true,
            homeroom_class: {
              select: {
                id: true,
                name: true,
                year_group: { select: { id: true, name: true } },
              },
            },
          },
        },
        academic_period: { select: { id: true, name: true } },
        template: {
          select: { id: true, name: true, branding_overrides_json: true },
        },
        batch_job: {
          select: { id: true, status: true, created_at: true, updated_at: true },
        },
      },
    });

    // Pre-compute presigned download URLs in parallel. The library grouped
    // view is admin-only so we cap this at the full result set rather than
    // paginating — for realistic schools (~1000 report cards) this is still
    // a single S3 round-trip per row and a few seconds total worst-case.
    const downloadUrlByRowId = new Map<string, string | null>();
    await Promise.all(
      rows.map(async (row) => {
        if (!row.pdf_storage_key) {
          downloadUrlByRowId.set(row.id, null);
          return;
        }
        try {
          const url = await this.s3Service.getPresignedUrl(
            row.pdf_storage_key,
            LIBRARY_SIGNED_URL_TTL_SECONDS,
            {
              downloadFilename: buildReportCardDownloadFilename({
                first_name: row.student.first_name,
                last_name: row.student.last_name,
                period_name: row.academic_period?.name ?? 'Full Year',
                locale: row.template_locale,
              }),
            },
          );
          downloadUrlByRowId.set(row.id, url);
        } catch (err) {
          this.logger.error(
            `[listReportCardLibraryGrouped] failed to presign ${row.pdf_storage_key}: ${(err as Error).message}`,
          );
          downloadUrlByRowId.set(row.id, null);
        }
      }),
    );

    // Group rows by batch_job_id (with a synthetic `legacy` bucket for
    // rows that don't carry one).
    const runBuckets = new Map<
      string,
      {
        batch_job_id: string | null;
        run_status: GroupedLibraryRunNode['run_status'];
        run_started_at: Date;
        run_finished_at: Date | null;
        period_label: string;
        template_name: string | null;
        design_key: string | null;
        classes: Map<string, GroupedLibraryClassNode>;
      }
    >();

    for (const row of rows) {
      const runKey = row.batch_job_id ?? 'legacy';
      const periodLabel = row.academic_period?.name ?? 'Full Year';
      const templateName = row.template?.name ?? null;
      const designKey =
        row.template?.branding_overrides_json &&
        typeof row.template.branding_overrides_json === 'object' &&
        !Array.isArray(row.template.branding_overrides_json)
          ? (((row.template.branding_overrides_json as Record<string, unknown>).design_key as
              | string
              | undefined) ?? null)
          : null;

      let bucket = runBuckets.get(runKey);
      if (!bucket) {
        bucket = {
          batch_job_id: row.batch_job_id ?? null,
          run_status: row.batch_job
            ? (row.batch_job.status as GroupedLibraryRunNode['run_status'])
            : 'legacy',
          run_started_at: row.batch_job?.created_at ?? row.created_at,
          run_finished_at: row.batch_job?.updated_at ?? null,
          period_label: periodLabel,
          template_name: templateName,
          design_key: designKey,
          classes: new Map<string, GroupedLibraryClassNode>(),
        };
        runBuckets.set(runKey, bucket);
      }

      const classId = row.student.homeroom_class?.id ?? '__unassigned';
      const className = row.student.homeroom_class?.name ?? 'Unassigned';
      const yearGroup = row.student.homeroom_class?.year_group ?? null;
      let classNode = bucket.classes.get(classId);
      if (!classNode) {
        classNode = {
          class_id: classId,
          class_name: className,
          year_group: yearGroup,
          student_count: 0,
          report_card_count: 0,
          report_cards: [],
        };
        bucket.classes.set(classId, classNode);
      }

      classNode.report_cards.push({
        id: row.id,
        student: {
          id: row.student.id,
          first_name: row.student.first_name,
          last_name: row.student.last_name,
          student_number: row.student.student_number,
        },
        status: row.status,
        locale: row.template_locale,
        template: {
          id: row.template?.id ?? null,
          name: row.template?.name ?? null,
        },
        pdf_storage_key: row.pdf_storage_key,
        pdf_download_url: downloadUrlByRowId.get(row.id) ?? null,
        generated_at: row.created_at.toISOString(),
      });
      classNode.report_card_count += 1;
    }

    // Fill in student_count per class — unique student_ids across the rows.
    for (const bucket of runBuckets.values()) {
      for (const classNode of bucket.classes.values()) {
        classNode.student_count = new Set(classNode.report_cards.map((r) => r.student.id)).size;
        // Sort students within a class alphabetically by last name then
        // first name so the list is predictable.
        classNode.report_cards.sort((a, b) => {
          const lastCmp = a.student.last_name.localeCompare(b.student.last_name);
          if (lastCmp !== 0) return lastCmp;
          return a.student.first_name.localeCompare(b.student.first_name);
        });
      }
    }

    // Emit runs newest-first; inside each run emit classes by name asc.
    const data: GroupedLibraryRunNode[] = Array.from(runBuckets.values())
      .sort((a, b) => b.run_started_at.getTime() - a.run_started_at.getTime())
      .map((bucket) => ({
        batch_job_id: bucket.batch_job_id,
        run_status: bucket.run_status,
        run_started_at: bucket.run_started_at.toISOString(),
        run_finished_at: bucket.run_finished_at ? bucket.run_finished_at.toISOString() : null,
        period_label: bucket.period_label,
        template_name: bucket.template_name,
        design_key: bucket.design_key,
        total_report_cards: Array.from(bucket.classes.values()).reduce(
          (sum, c) => sum + c.report_card_count,
          0,
        ),
        classes: Array.from(bucket.classes.values()).sort((a, b) =>
          a.class_name.localeCompare(b.class_name),
        ),
      }));

    return { data };
  }

  // ─── Library helpers ────────────────────────────────────────────────────────

  private buildLibraryGroupKey(
    studentId: string,
    periodId: string | null,
    academicYearId: string,
    templateId: string | null,
  ): string {
    // Full-year rows (periodId === null) group on the year id instead so
    // all languages for the same (student, year, template) cluster together.
    const scopeSegment = periodId !== null ? `p:${periodId}` : `y:${academicYearId}`;
    return `${studentId}::${scopeSegment}::${templateId ?? 'null'}`;
  }

  /**
   * Resolve the set of student_ids a teacher is allowed to see in the library.
   * Includes students enrolled in classes where the teacher has a current
   * teaching competency (subject × year group × curriculum matrix) OR is the
   * homeroom teacher.
   */
  private async resolveTeacherVisibleStudents(tenantId: string, userId: string): Promise<string[]> {
    let staffProfileId: string;
    try {
      staffProfileId = await this.staffProfileReadFacade.resolveProfileId(tenantId, userId);
    } catch {
      // No staff profile → no library visibility.
      return [];
    }

    // a. Homeroom classes (where the teacher is the homeroom owner) via
    // ClassesReadFacade.findClassesGeneric (module-boundary-safe escape
    // hatch — there is no dedicated homeroom-by-staff helper yet).
    const homeroomClasses = (await this.classesReadFacade.findClassesGeneric(
      tenantId,
      { homeroom_teacher_staff_id: staffProfileId, status: 'active' },
      { id: true },
    )) as Array<{ id: string }>;
    const classIdSet = new Set<string>(homeroomClasses.map((c) => c.id));
    // Also include classes where the teacher is assigned via ClassStaff
    // (e.g., an explicit assignment table used by some tenants).
    const assignedClassIds = await this.classesReadFacade.findClassIdsByStaff(
      tenantId,
      staffProfileId,
    );
    for (const id of assignedClassIds) classIdSet.add(id);

    // b. Classes the teacher is scheduled to teach for the active academic
    //    year. Stage 8: live `schedules` table is the source of truth, not
    //    teacher_competencies × curriculum-matrix derivation.
    const activeYear = await this.academicReadFacade.findCurrentYear(tenantId);
    if (activeYear) {
      const pairs = await this.schedulesReadFacade.getTeacherAssignmentsForYear(
        tenantId,
        activeYear.id,
        staffProfileId,
      );
      for (const p of pairs) classIdSet.add(p.class_id);
    }

    if (classIdSet.size === 0) return [];

    // c. Resolve all active enrolments in those classes → student_ids via
    //    ClassesReadFacade (owning module).
    const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
      tenantId,
      { class_id: { in: [...classIdSet] }, status: 'active' },
      { student_id: true },
    )) as Array<{ student_id: string }>;

    return [...new Set(enrolments.map((e) => e.student_id))];
  }

  // ─── Matrix helpers ─────────────────────────────────────────────────────────

  private emptyMatrixCells(
    studentIds: string[],
    subjectIds: string[],
  ): Record<string, Record<string, ClassMatrixCell>> {
    const out: Record<string, Record<string, ClassMatrixCell>> = {};
    for (const sid of studentIds) {
      out[sid] = {};
      for (const subjId of subjectIds) {
        out[sid]![subjId] = {
          score: null,
          grade: null,
          assessment_count: 0,
          has_override: false,
        };
      }
    }
    return out;
  }

  private buildMatrixCells(
    studentIds: string[],
    subjectIds: string[],
    snapshots: Array<{
      student_id: string;
      subject_id: string;
      academic_period_id: string;
      computed_value: Prisma.Decimal;
      display_value: string;
      overridden_value: string | null;
    }>,
    periodWeights: Map<string, number>,
    assessmentCountBySubject: Map<string, number>,
    subjectScaleMap: Map<string, GradingScaleConfig>,
  ): Record<string, Record<string, ClassMatrixCell>> {
    // Index snapshots by student → subject → period
    const bySubject = new Map<string, Map<string, Map<string, MatrixAggregationRow>>>();
    for (const snap of snapshots) {
      if (!bySubject.has(snap.student_id)) bySubject.set(snap.student_id, new Map());
      const subjMap = bySubject.get(snap.student_id)!;
      if (!subjMap.has(snap.subject_id)) subjMap.set(snap.subject_id, new Map());
      subjMap.get(snap.subject_id)!.set(snap.academic_period_id, {
        computed: Number(snap.computed_value),
        display: snap.overridden_value ?? snap.display_value,
        has_override: snap.overridden_value !== null,
        assessment_count: 0,
      });
    }

    const cells: Record<string, Record<string, ClassMatrixCell>> = {};
    for (const studentId of studentIds) {
      cells[studentId] = {};
      const subjMap = bySubject.get(studentId) ?? new Map();
      for (const subjectId of subjectIds) {
        const periodMap = (subjMap.get(subjectId) ?? new Map()) as Map<
          string,
          MatrixAggregationRow
        >;

        // Collect rows with actual data for weighted averaging.
        let weightedSum = 0;
        let weightSum = 0;
        let anyOverride = false;
        for (const [periodId, row] of periodMap) {
          if (row.computed === null) continue;
          const weight = periodWeights.get(periodId);
          // If no explicit period weights exist, treat each period equally (1).
          const effectiveWeight = weight ?? (periodWeights.size === 0 ? 1 : 0);
          if (effectiveWeight > 0) {
            weightedSum += row.computed * effectiveWeight;
            weightSum += effectiveWeight;
            if (row.has_override) anyOverride = true;
          }
        }

        const score = weightSum > 0 ? weightedSum / weightSum : null;
        // Derive the letter grade from the aggregated score using the subject's
        // grading scale. Falling back to the last period's raw display token
        // would be wrong: that token can be a stale percentage string or a
        // letter that doesn't match the weighted average. When the subject has
        // no grading scale configured, applyGradingScale returns the rounded
        // percentage as a fallback — same pattern used for overall_grade.
        const subjectScale = subjectScaleMap.get(subjectId) ?? null;
        const grade = score !== null ? this.applyGradingScale(score, subjectScale) : null;
        cells[studentId]![subjectId] = {
          score,
          grade,
          assessment_count: assessmentCountBySubject.get(subjectId) ?? 0,
          has_override: anyOverride,
        };
      }
    }

    return cells;
  }

  private computePeriodOverall(
    studentId: string,
    subjectIds: string[],
    periodId: string,
    snapshots: Array<{
      student_id: string;
      subject_id: string;
      academic_period_id: string;
      computed_value: Prisma.Decimal;
    }>,
    subjectWeights: Map<string, number>,
  ): number | null {
    let weightedSum = 0;
    let weightSum = 0;
    const studentSnapshots = snapshots.filter(
      (s) => s.student_id === studentId && s.academic_period_id === periodId,
    );

    // Build a quick lookup: subject → value
    const valueBySubject = new Map<string, number>();
    for (const snap of studentSnapshots) {
      valueBySubject.set(snap.subject_id, Number(snap.computed_value));
    }

    const hasExplicitWeights = subjectWeights.size > 0;
    for (const subjectId of subjectIds) {
      const value = valueBySubject.get(subjectId);
      if (value === undefined) continue;
      const weight = hasExplicitWeights ? (subjectWeights.get(subjectId) ?? 0) : 1;
      if (weight > 0) {
        weightedSum += value * weight;
        weightSum += weight;
      }
    }

    return weightSum > 0 ? weightedSum / weightSum : null;
  }

  private combinePeriodsWithWeights(
    periodOveralls: Array<{ periodId: string; value: number }>,
    periodWeights: Map<string, number>,
  ): number | null {
    if (periodOveralls.length === 0) return null;
    const hasExplicit = periodWeights.size > 0;
    let weightedSum = 0;
    let weightSum = 0;
    for (const { periodId, value } of periodOveralls) {
      const weight = hasExplicit ? (periodWeights.get(periodId) ?? 0) : 1;
      if (weight > 0) {
        weightedSum += value * weight;
        weightSum += weight;
      }
    }
    return weightSum > 0 ? weightedSum / weightSum : null;
  }

  /**
   * Standard competition rank on descending weighted_average. Only ranks 1,
   * 2, 3 are emitted — everyone else gets null. Tied students share the
   * rank; the next distinct value jumps ahead by the number of ties
   * (e.g., two students at 95 → both rank 1, next student at 90 → rank 3,
   * not 2). Matches the rule in design spec §14.
   *
   * The design spec colloquially calls this "dense rank" — it is NOT dense
   * rank in the database sense, which would produce 1, 1, 2. The method
   * name below reflects the spec's vocabulary for consistency with the
   * caller contract.
   */
  private computeDenseRankTop3(
    overallByStudent: Map<
      string,
      { weighted_average: number | null; overall_grade: string | null }
    >,
  ): Map<string, number> {
    const entries: Array<{ studentId: string; value: number }> = [];
    for (const [studentId, row] of overallByStudent) {
      if (row.weighted_average !== null) {
        entries.push({ studentId, value: row.weighted_average });
      }
    }
    entries.sort((a, b) => b.value - a.value);

    const out = new Map<string, number>();
    let i = 0;
    while (i < entries.length) {
      const rank = i + 1; // standard competition rank = 1-based index of first tied entry
      if (rank > 3) break;
      const value = entries[i]!.value;
      while (i < entries.length && entries[i]!.value === value) {
        out.set(entries[i]!.studentId, rank);
        i += 1;
      }
    }
    return out;
  }

  private async resolveSubjectWeightsForClass(
    tenantId: string,
    classId: string,
    academicPeriodId: string,
    subjectIds: string[],
  ): Promise<Map<string, number>> {
    // 1. Try class-specific weights
    const classWeights = await this.prisma.subjectPeriodWeight.findMany({
      where: {
        tenant_id: tenantId,
        academic_period_id: academicPeriodId,
        class_id: classId,
        subject_id: { in: subjectIds },
      },
      select: { subject_id: true, weight: true },
    });
    if (classWeights.length > 0) {
      return new Map(classWeights.map((w) => [w.subject_id, Number(w.weight)]));
    }

    // 2. Fall back to year-group weights
    const yearGroupId = await this.classesReadFacade.findYearGroupId(tenantId, classId);
    if (!yearGroupId) return new Map();

    const ygWeights = await this.prisma.subjectPeriodWeight.findMany({
      where: {
        tenant_id: tenantId,
        academic_period_id: academicPeriodId,
        year_group_id: yearGroupId,
        class_id: null,
        subject_id: { in: subjectIds },
      },
      select: { subject_id: true, weight: true },
    });
    return new Map(ygWeights.map((w) => [w.subject_id, Number(w.weight)]));
  }

  private async resolvePeriodWeightsForClass(
    tenantId: string,
    classId: string,
    academicYearId: string | null,
    periodIds: string[],
  ): Promise<Map<string, number>> {
    if (!academicYearId || periodIds.length === 0) return new Map();

    const classWeights = await this.prisma.periodYearWeight.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        class_id: classId,
        academic_period_id: { in: periodIds },
      },
      select: { academic_period_id: true, weight: true },
    });
    if (classWeights.length > 0) {
      return new Map(classWeights.map((w) => [w.academic_period_id, Number(w.weight)]));
    }

    const yearGroupId = await this.classesReadFacade.findYearGroupId(tenantId, classId);
    if (!yearGroupId) return new Map();

    const ygWeights = await this.prisma.periodYearWeight.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        year_group_id: yearGroupId,
        class_id: null,
        academic_period_id: { in: periodIds },
      },
      select: { academic_period_id: true, weight: true },
    });
    return new Map(ygWeights.map((w) => [w.academic_period_id, Number(w.weight)]));
  }

  private applyGradingScale(percentage: number, config: GradingScaleConfig | null): string | null {
    if (!config) {
      // Without a scale we simply return a rounded percentage string so the
      // frontend always has something to show next to the badge.
      return `${Math.round(percentage * 100) / 100}%`;
    }

    if (config.type === 'numeric' && config.ranges) {
      const sorted = [...config.ranges].sort((a, b) => b.min - a.min);
      for (const range of sorted) {
        if (percentage >= range.min) return range.label;
      }
      return `${Math.round(percentage * 100) / 100}%`;
    }

    if ((config.type === 'letter' || config.type === 'custom') && config.grades) {
      const gradesWithValues = config.grades
        .filter((g) => g.numeric_value !== undefined)
        .sort((a, b) => (b.numeric_value ?? 0) - (a.numeric_value ?? 0));

      for (const grade of gradesWithValues) {
        if (percentage >= (grade.numeric_value ?? 0)) return grade.label;
      }
      if (gradesWithValues.length > 0) {
        return gradesWithValues[gradesWithValues.length - 1]!.label;
      }
    }

    return `${Math.round(percentage * 100) / 100}%`;
  }

  // ─── GENERATE TRANSCRIPT ────────────────────────────────────────────────────

  /**
   * Generate full academic transcript for a student across all periods and years.
   * Aggregates period_grade_snapshots and gpa_snapshots, grouped by year -> period.
   */
  async generateTranscript(tenantId: string, studentId: string) {
    const student = (await this.studentReadFacade.findOneGeneric(tenantId, studentId, {
      select: {
        id: true,
        first_name: true,
        last_name: true,
        student_number: true,
        year_group: { select: { id: true, name: true } },
      },
    })) as {
      id: string;
      first_name: string;
      last_name: string;
      student_number: string | null;
      year_group: { id: string; name: string } | null;
    } | null;

    if (!student) {
      throw new NotFoundException({
        code: 'STUDENT_NOT_FOUND',
        message: `Student "${studentId}" not found`,
      });
    }

    // Load all period grade snapshots
    const snapshots = await this.prisma.periodGradeSnapshot.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      include: {
        subject: { select: { id: true, name: true, code: true } },
        academic_period: {
          select: {
            id: true,
            name: true,
            start_date: true,
            end_date: true,
            academic_year: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [
        { academic_period: { academic_year: { start_date: 'asc' } } },
        { academic_period: { start_date: 'asc' } },
        { subject: { name: 'asc' } },
      ],
    });

    // Load all GPA snapshots
    const gpaSnapshots = await this.prisma.gpaSnapshot.findMany({
      where: { tenant_id: tenantId, student_id: studentId },
      select: { academic_period_id: true, gpa_value: true },
    });
    const gpaByPeriod = new Map(
      gpaSnapshots.map((g) => [g.academic_period_id, Number(g.gpa_value)]),
    );

    // Load published report cards to get comment data
    const reportCards = await this.prisma.reportCard.findMany({
      where: {
        tenant_id: tenantId,
        student_id: studentId,
        status: 'published',
      },
      select: {
        academic_period_id: true,
        teacher_comment: true,
        principal_comment: true,
        published_at: true,
      },
    });
    const rcByPeriod = new Map(reportCards.map((rc) => [rc.academic_period_id, rc]));

    // Group by year -> period -> subject
    const yearMap = new Map<
      string,
      {
        academic_year_id: string;
        academic_year_name: string;
        periods: Map<
          string,
          {
            period_id: string;
            period_name: string;
            start_date: string;
            end_date: string;
            gpa: number | null;
            teacher_comment: string | null;
            principal_comment: string | null;
            subjects: Array<{
              subject_id: string;
              subject_name: string;
              subject_code: string | null;
              computed_value: number;
              display_value: string;
              overridden_value: string | null;
            }>;
          }
        >;
      }
    >();

    for (const snapshot of snapshots) {
      const yearId = snapshot.academic_period.academic_year.id;
      const yearName = snapshot.academic_period.academic_year.name;
      const periodId = snapshot.academic_period.id;

      if (!yearMap.has(yearId)) {
        yearMap.set(yearId, {
          academic_year_id: yearId,
          academic_year_name: yearName,
          periods: new Map(),
        });
      }

      const year = yearMap.get(yearId)!;

      if (!year.periods.has(periodId)) {
        const rc = rcByPeriod.get(periodId);
        year.periods.set(periodId, {
          period_id: periodId,
          period_name: snapshot.academic_period.name,
          start_date: snapshot.academic_period.start_date.toISOString().slice(0, 10),
          end_date: snapshot.academic_period.end_date.toISOString().slice(0, 10),
          gpa: gpaByPeriod.get(periodId) ?? null,
          teacher_comment: rc?.teacher_comment ?? null,
          principal_comment: rc?.principal_comment ?? null,
          subjects: [],
        });
      }

      const period = year.periods.get(periodId)!;

      period.subjects.push({
        subject_id: snapshot.subject.id,
        subject_name: snapshot.subject.name,
        subject_code: snapshot.subject.code ?? null,
        computed_value: Number(snapshot.computed_value),
        display_value: snapshot.display_value,
        overridden_value: snapshot.overridden_value ?? null,
      });
    }

    const academicYears = [...yearMap.values()].map((year) => ({
      academic_year_id: year.academic_year_id,
      academic_year_name: year.academic_year_name,
      periods: [...year.periods.values()],
    }));

    return {
      student: {
        id: student.id,
        first_name: student.first_name,
        last_name: student.last_name,
        student_number: student.student_number ?? null,
        year_group: student.year_group?.name ?? null,
      },
      academic_years: academicYears,
    };
  }
}
