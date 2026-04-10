import { InjectQueue } from '@nestjs/bullmq';
import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Queue } from 'bullmq';

import type {
  CommentGateDryRunResult,
  DryRunGenerationCommentGateDto,
  GenerationScope,
  ListGenerationRunsQuery,
  StartGenerationRunDto,
} from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { AttendanceReadFacade } from '../../attendance/attendance-read.facade';
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { StudentReadFacade } from '../../students/student-read.facade';
import { TenantReadFacade } from '../../tenants/tenant-read.facade';

import { ReportCardTemplateService } from './report-card-template.service';
import { ReportCardTenantSettingsService } from './report-card-tenant-settings.service';

// ─── Generation job BullMQ constants ─────────────────────────────────────────
// The job name matches the catalog entry in docs/architecture/event-job-catalog.md.
export const REPORT_CARD_GENERATE_JOB = 'report-cards:generate';
export const REPORT_CARD_GENERATE_QUEUE = 'gradebook';

// ─── Generation run response shapes ──────────────────────────────────────────

export interface GenerationRunSummary {
  id: string;
  status: string;
  scope_type: string | null;
  scope_ids: string[];
  /** NULL for full-year runs (Phase 1b — Option B). */
  academic_period_id: string | null;
  /** Always populated; authoritative when `academic_period_id` is null. */
  academic_year_id: string;
  template_id: string | null;
  personal_info_fields: string[];
  languages_requested: string[];
  students_generated_count: number;
  students_blocked_count: number;
  total_count: number;
  errors: Array<{ student_id: string; message: string }>;
  requested_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class ReportCardGenerationService {
  private readonly logger = new Logger(ReportCardGenerationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly studentReadFacade: StudentReadFacade,
    private readonly tenantReadFacade: TenantReadFacade,
    private readonly attendanceReadFacade: AttendanceReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
    @Optional() private readonly templateService?: ReportCardTemplateService,
    @Optional() private readonly tenantSettingsService?: ReportCardTenantSettingsService,
    @Optional()
    @InjectQueue(REPORT_CARD_GENERATE_QUEUE)
    private readonly generationQueue?: Queue,
  ) {}

  // ─── Legacy: generate draft report cards inline (existing flow) ───────────
  // Preserved for backwards compatibility with the legacy
  // POST /v1/report-cards/generate-batch endpoint. New work should route
  // through `generateRun`; legacy removal is scheduled for impl 12.

  async generate(tenantId: string, studentIds: string[], periodId: string) {
    const period = await this.academicReadFacade.findPeriodById(tenantId, periodId);

    if (!period) {
      throw new NotFoundException({
        code: 'PERIOD_NOT_FOUND',
        message: `Academic period with id "${periodId}" not found`,
      });
    }

    const periodWithYear = period as typeof period & { academic_year: { name: string } };

    const students = (await this.studentReadFacade.findManyGeneric(tenantId, {
      where: { id: { in: studentIds } },
      include: {
        year_group: {
          select: { id: true, name: true },
        },
        homeroom_class: {
          select: { id: true, name: true },
        },
        household: {
          select: {
            id: true,
            billing_parent: {
              select: {
                id: true,
                user: {
                  select: { preferred_locale: true },
                },
              },
            },
          },
        },
      },
    })) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      student_number: string | null;
      year_group: { id: string; name: string } | null;
      homeroom_class: { id: string; name: true } | null;
      household: {
        id: string;
        billing_parent: {
          id: string;
          user: { preferred_locale: string | null } | null;
        } | null;
      } | null;
    }>;

    if (students.length !== studentIds.length) {
      const foundIds = new Set(students.map((student) => student.id));
      const missing = studentIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException({
        code: 'STUDENTS_NOT_FOUND',
        message: `Students not found: ${missing.join(', ')}`,
      });
    }

    const tenantDefaultLocale = await this.tenantReadFacade.findDefaultLocale(tenantId);

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const reportCards = [];

    for (const student of students) {
      const snapshots = await this.prisma.periodGradeSnapshot.findMany({
        where: {
          tenant_id: tenantId,
          student_id: student.id,
          academic_period_id: periodId,
        },
        include: {
          subject: {
            select: { id: true, name: true, code: true },
          },
        },
      });

      const subjectIds = snapshots.map((snapshot) => snapshot.subject_id);
      const assessments =
        subjectIds.length > 0
          ? await this.prisma.assessment.findMany({
              where: {
                tenant_id: tenantId,
                academic_period_id: periodId,
                subject_id: { in: subjectIds },
                class_id: { in: snapshots.map((snapshot) => snapshot.class_id) },
                status: { not: 'draft' },
              },
              include: {
                grades: {
                  where: { student_id: student.id },
                },
                category: {
                  select: { name: true },
                },
              },
            })
          : [];

      const subjects = snapshots.map((snapshot) => {
        const subjectAssessments = assessments.filter((assessment) => {
          return (
            assessment.subject_id === snapshot.subject_id &&
            assessment.class_id === snapshot.class_id
          );
        });

        return {
          subject_name: snapshot.subject.name,
          subject_code: snapshot.subject.code ?? null,
          computed_value: Number(snapshot.computed_value),
          display_value: snapshot.overridden_value ?? snapshot.display_value,
          overridden_value: snapshot.overridden_value ?? null,
          assessments: subjectAssessments.map((assessment) => {
            const grade = assessment.grades[0];
            return {
              title: assessment.title,
              category: assessment.category.name,
              max_score: Number(assessment.max_score),
              raw_score:
                grade?.raw_score !== null && grade?.raw_score !== undefined
                  ? Number(grade.raw_score)
                  : null,
              is_missing: grade?.is_missing ?? true,
            };
          }),
        };
      });

      const attendanceSummaries = await this.attendanceReadFacade.groupSummariesByStatus(
        tenantId,
        student.id,
        { from: period.start_date, to: period.end_date },
      );

      const statusCounts = new Map(
        attendanceSummaries.map((summary) => [summary.derived_status, summary._count._all]),
      );

      const totalDays = attendanceSummaries.reduce((sum, summary) => sum + summary._count._all, 0);
      const presentDays = (statusCounts.get('present') ?? 0) + (statusCounts.get('late') ?? 0);
      const absentDays =
        (statusCounts.get('absent') ?? 0) + (statusCounts.get('partially_absent') ?? 0);
      const lateDays = statusCounts.get('late') ?? 0;

      const attendanceSummary =
        totalDays > 0
          ? {
              total_days: totalDays,
              present_days: presentDays,
              absent_days: absentDays,
              late_days: lateDays,
            }
          : undefined;

      const billingParentLocale = student.household?.billing_parent?.user?.preferred_locale;
      const templateLocale = billingParentLocale ?? tenantDefaultLocale;

      const snapshotPayload = {
        student: {
          full_name: `${student.first_name} ${student.last_name}`,
          student_number: student.student_number ?? null,
          year_group: student.year_group?.name ?? '',
          class_homeroom: student.homeroom_class?.name ?? null,
        },
        period: {
          name: period.name,
          academic_year: periodWithYear.academic_year.name,
          start_date: period.start_date.toISOString().slice(0, 10),
          end_date: period.end_date.toISOString().slice(0, 10),
        },
        subjects,
        attendance_summary: attendanceSummary,
        teacher_comment: null,
        principal_comment: null,
      };

      const reportCard = await prismaWithRls.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;

        return db.reportCard.create({
          data: {
            tenant_id: tenantId,
            student_id: student.id,
            academic_period_id: periodId,
            academic_year_id: period.academic_year_id,
            status: 'draft',
            template_locale: templateLocale,
            snapshot_payload_json: snapshotPayload as unknown as Prisma.InputJsonValue,
          },
        });
      });

      reportCards.push(reportCard);
    }

    return { data: reportCards };
  }

  async generateBulkDrafts(tenantId: string, classId: string, periodId: string) {
    const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
      tenantId,
      { class_id: classId, status: 'active' },
      { student_id: true },
    )) as Array<{ student_id: string }>;

    if (enrolments.length === 0) {
      return { data: [], skipped: 0, generated: 0 };
    }

    const studentIds = enrolments.map((enrolment) => enrolment.student_id);

    const existing = await this.prisma.reportCard.findMany({
      where: {
        tenant_id: tenantId,
        student_id: { in: studentIds },
        academic_period_id: periodId,
        status: { not: 'revised' },
      },
      select: { student_id: true },
    });

    const existingStudentIds = new Set(existing.map((reportCard) => reportCard.student_id));
    const newStudentIds = studentIds.filter((id) => !existingStudentIds.has(id));

    if (newStudentIds.length === 0) {
      return { data: [], skipped: studentIds.length, generated: 0 };
    }

    const result = await this.generate(tenantId, newStudentIds, periodId);

    return {
      data: result.data,
      skipped: existingStudentIds.size,
      generated: result.data.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Report Cards Redesign (impl 04) — new generation run flow
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Resolves a `GenerationScope` into a concrete, tenant-scoped list of
   * student IDs plus the primary class IDs that back them. The scope modes
   * expand via existing joins; no new schema is introduced.
   *
   * Returns both the student IDs (dedupe-ordered) and the ordered set of
   * class IDs involved so the caller can populate the (currently non-null)
   * `report_card_batch_jobs.class_id` column with a representative class.
   */
  async resolveScope(
    tenantId: string,
    scope: GenerationScope,
  ): Promise<{ studentIds: string[]; classIds: string[] }> {
    if (scope.mode === 'class') {
      if (scope.class_ids.length === 0) {
        return { studentIds: [], classIds: [] };
      }

      const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
        tenantId,
        { class_id: { in: scope.class_ids }, status: 'active' },
        { student_id: true, class_id: true },
      )) as Array<{ student_id: string; class_id: string }>;

      const seen = new Set<string>();
      const studentIds: string[] = [];
      for (const row of enrolments) {
        if (!seen.has(row.student_id)) {
          seen.add(row.student_id);
          studentIds.push(row.student_id);
        }
      }

      return { studentIds, classIds: scope.class_ids };
    }

    if (scope.mode === 'year_group') {
      if (scope.year_group_ids.length === 0) {
        return { studentIds: [], classIds: [] };
      }

      // Pull active enrolments whose parent class belongs to one of the
      // requested year groups. Uses the classes facade's generic helper with
      // a nested relation filter so gradebook never touches the classes
      // Prisma models directly.
      const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
        tenantId,
        {
          status: 'active',
          class_entity: { year_group_id: { in: scope.year_group_ids } },
        },
        { student_id: true, class_id: true },
      )) as Array<{ student_id: string; class_id: string }>;

      const seenStudents = new Set<string>();
      const studentIds: string[] = [];
      const seenClasses = new Set<string>();
      const classIds: string[] = [];
      for (const row of enrolments) {
        if (!seenStudents.has(row.student_id)) {
          seenStudents.add(row.student_id);
          studentIds.push(row.student_id);
        }
        if (!seenClasses.has(row.class_id)) {
          seenClasses.add(row.class_id);
          classIds.push(row.class_id);
        }
      }

      return { studentIds, classIds };
    }

    // individual
    if (scope.student_ids.length === 0) {
      return { studentIds: [], classIds: [] };
    }

    const students = (await this.studentReadFacade.findManyGeneric(tenantId, {
      where: { id: { in: scope.student_ids } },
      select: { id: true, class_homeroom_id: true },
    })) as Array<{ id: string; class_homeroom_id: string | null }>;

    if (students.length !== scope.student_ids.length) {
      const foundIds = new Set(students.map((s) => s.id));
      const missing = scope.student_ids.filter((id) => !foundIds.has(id));
      throw new NotFoundException({
        code: 'STUDENTS_NOT_FOUND',
        message: `Students not found: ${missing.join(', ')}`,
      });
    }

    // Prefer homeroom class; fall back to the student's first active
    // enrolment when no homeroom is set.
    const classIds: string[] = [];
    const seenClasses = new Set<string>();
    const missingHomeroom: string[] = [];
    for (const student of students) {
      if (student.class_homeroom_id) {
        if (!seenClasses.has(student.class_homeroom_id)) {
          seenClasses.add(student.class_homeroom_id);
          classIds.push(student.class_homeroom_id);
        }
      } else {
        missingHomeroom.push(student.id);
      }
    }

    if (missingHomeroom.length > 0) {
      const enrolments = (await this.classesReadFacade.findEnrolmentsGeneric(
        tenantId,
        { student_id: { in: missingHomeroom }, status: 'active' },
        { class_id: true },
      )) as Array<{ class_id: string }>;
      for (const row of enrolments) {
        if (!seenClasses.has(row.class_id)) {
          seenClasses.add(row.class_id);
          classIds.push(row.class_id);
        }
      }
    }

    return { studentIds: scope.student_ids, classIds };
  }

  /**
   * Dry-run the comment gate for the wizard's final validation step.
   * Computes missing and unfinalised subject and overall comments across the
   * resolved scope + period/year + tenant setting combination.
   *
   * Phase 1b — Option B: when `dto.academic_period_id` is null (full-year),
   * snapshots are loaded across every period in the academic year and
   * comments are filtered by `(student, academic_year_id)` with NULL period.
   */
  async dryRunCommentGate(
    tenantId: string,
    dto: DryRunGenerationCommentGateDto,
  ): Promise<CommentGateDryRunResult> {
    if (!this.tenantSettingsService) {
      throw new Error('ReportCardTenantSettingsService dependency missing');
    }

    const { studentIds } = await this.resolveScope(tenantId, dto.scope);

    if (studentIds.length === 0) {
      throw new NotFoundException({
        code: 'SCOPE_EMPTY',
        message: 'The selected scope does not resolve to any students',
      });
    }

    // Resolve period/year. Exactly one of the two is the authoritative scope.
    const { periodId, academicYearId } = await this.resolvePeriodOrYear(tenantId, {
      academic_period_id: dto.academic_period_id ?? null,
      academic_year_id: dto.academic_year_id ?? null,
    });

    const settings = await this.tenantSettingsService.getPayload(tenantId);

    // Snapshot filter: by period (per-period run) OR by all periods in year
    // (full-year run).
    const snapshotPeriodFilter =
      periodId !== null
        ? { academic_period_id: periodId }
        : await this.buildYearPeriodInFilter(tenantId, academicYearId);

    // Comment filter: per-period uses NOT NULL period clause; full-year uses
    // NULL period + year clause.
    const commentScopeFilter =
      periodId !== null
        ? { academic_period_id: periodId }
        : { academic_period_id: null, academic_year_id: academicYearId };

    // Gather data in parallel — RLS is enforced globally on reads.
    const [studentsRaw, snapshots, subjectComments, overallComments] = await Promise.all([
      this.studentReadFacade.findManyGeneric(tenantId, {
        where: { id: { in: studentIds } },
        select: {
          id: true,
          first_name: true,
          last_name: true,
          preferred_second_language: true,
        },
      }) as Promise<
        Array<{
          id: string;
          first_name: string;
          last_name: string;
          preferred_second_language: string | null;
        }>
      >,
      this.prisma.periodGradeSnapshot.findMany({
        where: {
          tenant_id: tenantId,
          student_id: { in: studentIds },
          ...snapshotPeriodFilter,
        },
        select: {
          student_id: true,
          subject_id: true,
          subject: { select: { id: true, name: true } },
        },
      }),
      this.prisma.reportCardSubjectComment.findMany({
        where: {
          tenant_id: tenantId,
          student_id: { in: studentIds },
          ...commentScopeFilter,
        },
        select: {
          student_id: true,
          subject_id: true,
          finalised_at: true,
          comment_text: true,
        },
      }),
      this.prisma.reportCardOverallComment.findMany({
        where: {
          tenant_id: tenantId,
          student_id: { in: studentIds },
          ...commentScopeFilter,
        },
        select: {
          student_id: true,
          finalised_at: true,
          comment_text: true,
        },
      }),
    ]);

    const students = studentsRaw;
    const studentName = new Map<string, string>();
    const arStudents = new Set<string>();
    for (const student of students) {
      studentName.set(student.id, `${student.first_name} ${student.last_name}`);
      if (student.preferred_second_language === 'ar') {
        arStudents.add(student.id);
      }
    }

    const subjectCommentKey = new Map<string, { finalised: boolean }>();
    for (const row of subjectComments) {
      subjectCommentKey.set(`${row.student_id}:${row.subject_id}`, {
        finalised: row.finalised_at !== null,
      });
    }

    const overallCommentByStudent = new Map<string, { finalised: boolean }>();
    for (const row of overallComments) {
      overallCommentByStudent.set(row.student_id, { finalised: row.finalised_at !== null });
    }

    const missingSubjectComments: CommentGateDryRunResult['missing_subject_comments'] = [];
    const unfinalisedSubjectComments: CommentGateDryRunResult['unfinalised_subject_comments'] = [];

    const seenPair = new Set<string>();
    for (const snapshot of snapshots) {
      const pairKey = `${snapshot.student_id}:${snapshot.subject_id}`;
      if (seenPair.has(pairKey)) {
        continue;
      }
      seenPair.add(pairKey);

      const name = studentName.get(snapshot.student_id) ?? snapshot.student_id;
      const existing = subjectCommentKey.get(pairKey);
      if (!existing) {
        missingSubjectComments.push({
          student_id: snapshot.student_id,
          student_name: name,
          subject_id: snapshot.subject_id,
          subject_name: snapshot.subject.name,
        });
      } else if (!existing.finalised) {
        unfinalisedSubjectComments.push({
          student_id: snapshot.student_id,
          student_name: name,
          subject_id: snapshot.subject_id,
          subject_name: snapshot.subject.name,
        });
      }
    }

    const missingOverallComments: CommentGateDryRunResult['missing_overall_comments'] = [];
    const unfinalisedOverallComments: CommentGateDryRunResult['unfinalised_overall_comments'] = [];
    for (const student of students) {
      const existing = overallCommentByStudent.get(student.id);
      const name = `${student.first_name} ${student.last_name}`;
      if (!existing) {
        missingOverallComments.push({ student_id: student.id, student_name: name });
      } else if (!existing.finalised) {
        unfinalisedOverallComments.push({ student_id: student.id, student_name: name });
      }
    }

    const anyMissing =
      missingSubjectComments.length > 0 ||
      unfinalisedSubjectComments.length > 0 ||
      missingOverallComments.length > 0 ||
      unfinalisedOverallComments.length > 0;

    // Check whether the template has an Arabic locale for the languages preview.
    let hasArabicLocale = false;
    if (this.templateService) {
      const arTemplate = await this.templateService.resolveForGeneration(tenantId, {
        contentScope: dto.content_scope,
        locale: 'ar',
        // Dry-run ignores design_key — comment-gate preview only cares
        // whether ANY AR template exists for this scope, not which design
        // will render it.
      });
      hasArabicLocale = arTemplate !== null;
    }

    const arCount = hasArabicLocale ? studentIds.filter((id) => arStudents.has(id)).length : 0;

    return {
      students_total: studentIds.length,
      languages_preview: {
        en: studentIds.length,
        ar: arCount,
      },
      missing_subject_comments: missingSubjectComments,
      unfinalised_subject_comments: unfinalisedSubjectComments,
      missing_overall_comments: missingOverallComments,
      unfinalised_overall_comments: unfinalisedOverallComments,
      require_finalised_comments: settings.require_finalised_comments,
      allow_admin_force_generate: settings.allow_admin_force_generate,
      would_block: settings.require_finalised_comments && anyMissing,
    };
  }

  /**
   * Kicks off a new generation run. Validates the scope, gates comments,
   * inserts a `ReportCardBatchJob` row, and enqueues the background job.
   *
   * Phase 1b — Option B: `dto.academic_period_id` may be null for a
   * full-year run; `dto.academic_year_id` is then authoritative. The batch
   * job row stores both, and the worker branches on period IS NULL to
   * aggregate snapshots across every period in the year.
   */
  async generateRun(
    tenantId: string,
    actorUserId: string,
    dto: StartGenerationRunDto,
  ): Promise<{ batch_job_id: string }> {
    if (!this.templateService || !this.tenantSettingsService || !this.generationQueue) {
      throw new Error('ReportCardGenerationService is not wired for generateRun');
    }

    // Resolve period/year combination. The helper validates that exactly
    // one of the two is the authoritative scope and returns both IDs
    // (period may be null for a full-year run).
    const { periodId, academicYearId } = await this.resolvePeriodOrYear(tenantId, {
      academic_period_id: dto.academic_period_id ?? null,
      academic_year_id: dto.academic_year_id ?? null,
    });

    const { studentIds, classIds } = await this.resolveScope(tenantId, dto.scope);
    if (studentIds.length === 0) {
      throw new NotFoundException({
        code: 'SCOPE_EMPTY',
        message: 'The selected scope does not resolve to any students',
      });
    }
    if (classIds.length === 0) {
      throw new NotFoundException({
        code: 'SCOPE_EMPTY',
        message: 'The selected scope does not map to any class',
      });
    }

    const dryRun = await this.dryRunCommentGate(tenantId, {
      scope: dto.scope,
      academic_period_id: periodId,
      academic_year_id: academicYearId,
      content_scope: dto.content_scope,
    });

    if (dryRun.would_block && !dto.override_comment_gate) {
      throw new ForbiddenException({
        code: 'COMMENT_GATE_BLOCKING',
        message:
          'Generation is blocked because finalised comments are required and some are missing or unfinalised',
        details: {
          missing_subject_comments: dryRun.missing_subject_comments.length,
          unfinalised_subject_comments: dryRun.unfinalised_subject_comments.length,
          missing_overall_comments: dryRun.missing_overall_comments.length,
          unfinalised_overall_comments: dryRun.unfinalised_overall_comments.length,
        },
      });
    }

    if (dto.override_comment_gate && !dryRun.allow_admin_force_generate) {
      throw new ForbiddenException({
        code: 'FORCE_GENERATE_DISABLED',
        message: 'Force generate is not enabled for this tenant',
      });
    }

    const settings = await this.tenantSettingsService.getPayload(tenantId);
    const personalInfoFields =
      dto.personal_info_fields && dto.personal_info_fields.length > 0
        ? dto.personal_info_fields
        : settings.default_personal_info_fields;

    // Phase C — honour the wizard's explicit design pick when present.
    const template = await this.templateService.resolveForGeneration(tenantId, {
      contentScope: dto.content_scope,
      locale: 'en',
      designKey: dto.design_key ?? null,
    });

    if (!template) {
      throw new NotFoundException({
        code: 'TEMPLATE_NOT_FOUND',
        message: `No English template available for content scope "${dto.content_scope}"`,
      });
    }

    const languages: string[] = ['en'];
    if (dryRun.languages_preview.ar > 0) {
      languages.push('ar');
    }

    // Representative class for the legacy non-null column. Picked from the
    // resolved scope (first class in deterministic order) — see the
    // danger-zones entry added in this impl.
    const representativeClassId = classIds[0]!;

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const batchJob = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.reportCardBatchJob.create({
        data: {
          tenant_id: tenantId,
          class_id: representativeClassId,
          academic_period_id: periodId,
          academic_year_id: academicYearId,
          template_id: template.id,
          status: 'queued',
          total_count: studentIds.length,
          completed_count: 0,
          requested_by_user_id: actorUserId,
          scope_type: dto.scope.mode,
          scope_ids_json: scopeToIdList(dto.scope) as unknown as Prisma.InputJsonValue,
          personal_info_fields_json: personalInfoFields as unknown as Prisma.InputJsonValue,
          languages_requested: languages,
          students_generated_count: 0,
          students_blocked_count: 0,
          errors_json: [] as unknown as Prisma.InputJsonValue,
        },
      });
    });

    await this.generationQueue.add(
      REPORT_CARD_GENERATE_JOB,
      {
        tenant_id: tenantId,
        user_id: actorUserId,
        batch_job_id: batchJob.id,
      },
      { jobId: `${REPORT_CARD_GENERATE_JOB}:${batchJob.id}` },
    );

    this.logger.log(
      `Enqueued ${REPORT_CARD_GENERATE_JOB} for tenant ${tenantId} batch=${batchJob.id} students=${studentIds.length} languages=[${languages.join(',')}]`,
    );

    return { batch_job_id: batchJob.id };
  }

  async getRun(tenantId: string, runId: string): Promise<GenerationRunSummary> {
    const run = await this.prisma.reportCardBatchJob.findFirst({
      where: { id: runId, tenant_id: tenantId },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'GENERATION_RUN_NOT_FOUND',
        message: `Generation run with id "${runId}" not found`,
      });
    }

    return toGenerationRunSummary(run);
  }

  /**
   * Resolves a `{period_id?, year_id?}` pair into the authoritative
   * `{periodId, academicYearId}` combination used throughout the generation
   * flow. Accepts exactly one of:
   *
   *   - period_id set, year_id absent → per-period run; year is derived from
   *     the period's parent year.
   *   - period_id null/absent, year_id set → full-year run; period stays null.
   *   - period_id set, year_id set → allowed if year matches the period's
   *     parent year (otherwise rejected).
   *
   * Throws NotFoundException or BadRequestException otherwise.
   */
  async resolvePeriodOrYear(
    tenantId: string,
    input: { academic_period_id: string | null; academic_year_id: string | null },
  ): Promise<{ periodId: string | null; academicYearId: string }> {
    const rawPeriod = input.academic_period_id;
    const rawYear = input.academic_year_id;

    if ((rawPeriod === null || rawPeriod === '') && (rawYear === null || rawYear === '')) {
      throw new NotFoundException({
        code: 'PERIOD_OR_YEAR_REQUIRED',
        message: 'Either academic_period_id or academic_year_id is required',
      });
    }

    // Per-period branch.
    if (rawPeriod !== null && rawPeriod !== '') {
      const period = await this.academicReadFacade.findPeriodById(tenantId, rawPeriod);
      if (!period) {
        throw new NotFoundException({
          code: 'PERIOD_NOT_FOUND',
          message: `Academic period with id "${rawPeriod}" not found`,
        });
      }
      if (rawYear !== null && rawYear !== '' && rawYear !== period.academic_year_id) {
        throw new NotFoundException({
          code: 'PERIOD_YEAR_MISMATCH',
          message: `Period "${rawPeriod}" does not belong to academic year "${rawYear}"`,
        });
      }
      return { periodId: rawPeriod, academicYearId: period.academic_year_id };
    }

    // Full-year branch — year is authoritative.
    const year = await this.academicReadFacade.findYearById(tenantId, rawYear!);
    if (!year) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year with id "${rawYear}" not found`,
      });
    }
    return { periodId: null, academicYearId: year.id };
  }

  /**
   * Builds a Prisma `where` fragment that restricts `academic_period_id` to
   * the IN-list of every period belonging to a given academic year. Used by
   * the full-year dry-run path to look up snapshots across all periods.
   */
  private async buildYearPeriodInFilter(
    tenantId: string,
    academicYearId: string,
  ): Promise<{ academic_period_id: { in: string[] } }> {
    const periods = await this.academicReadFacade.findPeriodsForYear(tenantId, academicYearId);
    const periodIds = periods.map((p) => p.id);
    return { academic_period_id: { in: periodIds } };
  }

  async listRuns(tenantId: string, query: ListGenerationRunsQuery) {
    const [rows, total] = await Promise.all([
      this.prisma.reportCardBatchJob.findMany({
        where: { tenant_id: tenantId },
        orderBy: { created_at: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.reportCardBatchJob.count({ where: { tenant_id: tenantId } }),
    ]);

    return {
      data: rows.map(toGenerationRunSummary),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scopeToIdList(scope: GenerationScope): string[] {
  if (scope.mode === 'year_group') return scope.year_group_ids;
  if (scope.mode === 'class') return scope.class_ids;
  return scope.student_ids;
}

function toGenerationRunSummary(row: {
  id: string;
  tenant_id: string;
  status: string;
  class_id: string;
  scope_type: string | null;
  scope_ids_json: Prisma.JsonValue | null;
  academic_period_id: string | null;
  academic_year_id: string;
  template_id: string | null;
  personal_info_fields_json: Prisma.JsonValue | null;
  languages_requested: string[];
  students_generated_count: number;
  students_blocked_count: number;
  total_count: number;
  errors_json: Prisma.JsonValue | null;
  requested_by_user_id: string;
  created_at: Date;
  updated_at: Date;
}): GenerationRunSummary {
  const scopeIds = Array.isArray(row.scope_ids_json)
    ? (row.scope_ids_json.filter((v) => typeof v === 'string') as string[])
    : [];
  const personalInfoFields = Array.isArray(row.personal_info_fields_json)
    ? (row.personal_info_fields_json.filter((v) => typeof v === 'string') as string[])
    : [];

  let errors: GenerationRunSummary['errors'] = [];
  if (Array.isArray(row.errors_json)) {
    errors = row.errors_json.flatMap((entry) => {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        return [];
      }
      const obj = entry as Record<string, unknown>;
      return [
        {
          student_id: typeof obj.student_id === 'string' ? obj.student_id : '',
          message: typeof obj.message === 'string' ? obj.message : 'Unknown error',
        },
      ];
    });
  }

  return {
    id: row.id,
    status: row.status,
    scope_type: row.scope_type,
    scope_ids: scopeIds,
    academic_period_id: row.academic_period_id,
    academic_year_id: row.academic_year_id,
    template_id: row.template_id,
    personal_info_fields: personalInfoFields,
    languages_requested: row.languages_requested,
    students_generated_count: row.students_generated_count,
    students_blocked_count: row.students_blocked_count,
    total_count: row.total_count,
    errors,
    requested_by_user_id: row.requested_by_user_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
