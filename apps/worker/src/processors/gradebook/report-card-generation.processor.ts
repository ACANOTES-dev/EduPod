import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import type { PersonalInfoFieldKey, ReportCardRenderPayload } from '@school/shared';

import { TenantAwareJob, TenantJobPayload } from '../../base/tenant-aware-job';
import {
  REPORT_CARD_RENDERER_TOKEN,
  type ReportCardRenderer,
} from '../report-card-render.contract';

// ─── Payload ─────────────────────────────────────────────────────────────────

export interface ReportCardGenerationPayload extends TenantJobPayload {
  batch_job_id: string;
}

// ─── Job name ─────────────────────────────────────────────────────────────────

export const REPORT_CARD_GENERATION_JOB = 'report-cards:generate';

// ─── Storage writer contract ─────────────────────────────────────────────────
// The worker does not yet have a first-party S3 helper; the existing
// mass-report-card-pdf processor also leaves upload as a TODO. Impl 04 ships
// with a storage abstraction that the worker module can bind to S3 in prod.

export interface ReportCardStorageWriter {
  upload(tenantId: string, key: string, body: Buffer, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
}

export const REPORT_CARD_STORAGE_WRITER_TOKEN = 'REPORT_CARD_STORAGE_WRITER';

/**
 * No-op storage writer used by tests and the workerless default. Swap this
 * binding in production to an S3-backed implementation.
 */
export class NullReportCardStorageWriter implements ReportCardStorageWriter {
  async upload(tenantId: string, key: string): Promise<string> {
    return `${tenantId}/${key}`;
  }
  async delete(): Promise<void> {
    /* no-op */
  }
}

// ─── Processor ───────────────────────────────────────────────────────────────
// Plain @Injectable service — no @Processor decorator, no WorkerHost. The
// single `GradebookQueueDispatcher` owns the queue subscription and routes
// by `job.name` to this class, eliminating the competitive-consumer race
// that used to silently drop jobs on the gradebook queue.

@Injectable()
export class ReportCardGenerationProcessor {
  private readonly logger = new Logger(ReportCardGenerationProcessor.name);

  constructor(
    @Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient,
    @Inject(REPORT_CARD_RENDERER_TOKEN) private readonly renderer: ReportCardRenderer,
    @Inject(REPORT_CARD_STORAGE_WRITER_TOKEN)
    private readonly storage: ReportCardStorageWriter,
  ) {}

  async process(job: Job<ReportCardGenerationPayload>): Promise<void> {
    this.logger.log(
      `Processing ${REPORT_CARD_GENERATION_JOB} — tenant=${job.data.tenant_id} batch=${job.data.batch_job_id}`,
    );

    const impl = new ReportCardGenerationJob(this.prisma, this.renderer, this.storage);
    await impl.execute(job.data);
  }
}

// ─── TenantAwareJob implementation ───────────────────────────────────────────

export class ReportCardGenerationJob extends TenantAwareJob<ReportCardGenerationPayload> {
  private readonly logger = new Logger(ReportCardGenerationJob.name);

  constructor(
    prisma: PrismaClient,
    private readonly renderer: ReportCardRenderer,
    private readonly storage: ReportCardStorageWriter,
  ) {
    super(prisma);
  }

  protected async processJob(data: ReportCardGenerationPayload, tx: PrismaClient): Promise<void> {
    const { tenant_id, batch_job_id } = data;

    const batchJob = await tx.reportCardBatchJob.findFirst({
      where: { id: batch_job_id, tenant_id },
    });

    if (!batchJob) {
      this.logger.error(
        `Batch job ${batch_job_id} not found for tenant ${tenant_id} — aborting job`,
      );
      return;
    }

    // Transition to processing (maps spec concept "running")
    await tx.reportCardBatchJob.update({
      where: { id: batch_job_id },
      data: { status: 'processing' },
    });

    const tenantRow = await tx.tenant.findFirst({
      where: { id: tenant_id },
      select: {
        id: true,
        name: true,
        default_locale: true,
        branding: { select: { logo_url: true } },
      },
    });
    if (!tenantRow) {
      await this.failBatch(tx, batch_job_id, 'Tenant not found');
      return;
    }
    const tenantForRender = {
      id: tenantRow.id,
      name: tenantRow.name,
      logo_url: tenantRow.branding?.logo_url ?? null,
    };

    const tenantSettings = await tx.reportCardTenantSettings.findFirst({
      where: { tenant_id },
    });

    const settingsPayload = parseTenantSettings(tenantSettings?.settings_json);

    const template = batchJob.template_id
      ? await tx.reportCardTemplate.findFirst({ where: { id: batchJob.template_id, tenant_id } })
      : null;

    if (!template) {
      await this.failBatch(tx, batch_job_id, 'Template not resolved');
      return;
    }

    const arTemplate = await tx.reportCardTemplate.findFirst({
      where: {
        tenant_id,
        content_scope: template.content_scope,
        locale: 'ar',
      },
    });

    const studentIds = resolveStudentIds(batchJob.scope_ids_json);
    const scopeMode = batchJob.scope_type ?? 'individual';

    const resolvedStudentIds = await expandScope(tx, tenant_id, scopeMode, studentIds);

    if (resolvedStudentIds.length === 0) {
      await tx.reportCardBatchJob.update({
        where: { id: batch_job_id },
        data: {
          status: 'completed',
          total_count: 0,
          completed_count: 0,
          students_generated_count: 0,
        },
      });
      return;
    }

    // Phase 1b — Option B: full-year batch jobs have a NULL
    // academic_period_id and rely on academic_year_id. Per-period jobs use
    // their period as both the snapshot filter and the synthetic "period"
    // object passed to the renderer. Full-year jobs aggregate snapshots
    // across every period in the year and pass a synthetic "Full Year"
    // period to the renderer.
    const isFullYear = batchJob.academic_period_id === null;

    let renderPeriod: {
      id: string;
      name: string;
      academic_year: { name: string } | null;
    };
    let snapshotPeriodFilter: { in: string[] } | string;

    if (isFullYear) {
      const year = await tx.academicYear.findFirst({
        where: { id: batchJob.academic_year_id, tenant_id },
      });
      if (!year) {
        await this.failBatch(tx, batch_job_id, 'Academic year not found');
        return;
      }
      const yearPeriods = await tx.academicPeriod.findMany({
        where: { tenant_id, academic_year_id: batchJob.academic_year_id },
        select: { id: true },
        orderBy: { start_date: 'asc' },
      });
      if (yearPeriods.length === 0) {
        await this.failBatch(tx, batch_job_id, 'Academic year has no periods to aggregate');
        return;
      }
      // Synthetic "Full Year" period passed to the renderer. The id uses a
      // `full-year:<yearId>` prefix so transcript caches and the storage key
      // construction stay disjoint from real period UUIDs.
      renderPeriod = {
        id: `full-year:${year.id}`,
        name: 'Full Year',
        academic_year: { name: year.name },
      };
      snapshotPeriodFilter = { in: yearPeriods.map((p) => p.id) };
    } else {
      const period = await tx.academicPeriod.findFirst({
        where: { id: batchJob.academic_period_id!, tenant_id },
        include: { academic_year: { select: { name: true } } },
      });
      if (!period) {
        await this.failBatch(tx, batch_job_id, 'Academic period not found');
        return;
      }
      renderPeriod = {
        id: period.id,
        name: period.name,
        academic_year: period.academic_year,
      };
      snapshotPeriodFilter = batchJob.academic_period_id!;
    }

    const personalInfoFields = parsePersonalInfoFields(batchJob.personal_info_fields_json);

    // Load all students once for speed and to preserve a stable rank order.
    const students = await tx.student.findMany({
      where: { tenant_id, id: { in: resolvedStudentIds } },
      select: {
        id: true,
        first_name: true,
        last_name: true,
        student_number: true,
        date_of_birth: true,
        gender: true,
        nationality: true,
        entry_date: true,
        preferred_second_language: true,
        year_group: { select: { id: true, name: true } },
        homeroom_class: { select: { id: true, name: true } },
      },
    });

    const studentById = new Map(students.map((s) => [s.id, s] as const));

    // Load grade snapshots in bulk. Per-period: filter by single period.
    // Full-year: filter by IN-list of every period in the year.
    const snapshots = await tx.periodGradeSnapshot.findMany({
      where: {
        tenant_id,
        student_id: { in: resolvedStudentIds },
        academic_period_id:
          typeof snapshotPeriodFilter === 'string' ? snapshotPeriodFilter : snapshotPeriodFilter,
      },
      include: {
        subject: { select: { id: true, name: true, code: true } },
      },
    });

    // Bucket snapshots by student. For full-year runs we then collapse each
    // student's per-period rows into a single row per subject by averaging
    // computed_value across periods. The renderer downstream sees the same
    // shape it does today (one snapshot per subject per student).
    const snapshotsByStudent = new Map<string, typeof snapshots>();
    if (isFullYear) {
      // Group by (student, subject) and produce a single mean snapshot.
      type Acc = {
        sample: (typeof snapshots)[number];
        sum: number;
        n: number;
      };
      const studentSubjectAcc = new Map<string, Map<string, Acc>>();
      for (const snapshot of snapshots) {
        const subjectMap = studentSubjectAcc.get(snapshot.student_id) ?? new Map<string, Acc>();
        const score = Number(snapshot.computed_value);
        const existing = subjectMap.get(snapshot.subject_id);
        if (existing) {
          existing.sum += Number.isFinite(score) ? score : 0;
          existing.n += 1;
        } else {
          subjectMap.set(snapshot.subject_id, {
            sample: snapshot,
            sum: Number.isFinite(score) ? score : 0,
            n: 1,
          });
        }
        studentSubjectAcc.set(snapshot.student_id, subjectMap);
      }
      for (const [studentId, subjectMap] of studentSubjectAcc) {
        const collapsed = Array.from(subjectMap.values()).map((acc) => {
          const mean = acc.n > 0 ? acc.sum / acc.n : 0;
          // Recreate a snapshot row using the sample as a template, with the
          // mean injected as computed_value. display_value is null'd out so
          // the renderer falls through to the score formatter.
          return {
            ...acc.sample,
            computed_value: new Prisma.Decimal(mean),
            display_value: '',
            overridden_value: null,
          } as (typeof snapshots)[number];
        });
        snapshotsByStudent.set(studentId, collapsed);
      }
    } else {
      for (const snapshot of snapshots) {
        const bucket = snapshotsByStudent.get(snapshot.student_id) ?? [];
        bucket.push(snapshot);
        snapshotsByStudent.set(snapshot.student_id, bucket);
      }
    }

    // Comments: per-period jobs filter by the period; full-year jobs filter
    // by (year, NULL period) to load the brand-new full-year comments
    // teachers wrote during the full-year window.
    const commentScopeFilter = isFullYear
      ? { academic_period_id: null, academic_year_id: batchJob.academic_year_id }
      : { academic_period_id: batchJob.academic_period_id! };

    const subjectCommentRows = await tx.reportCardSubjectComment.findMany({
      where: {
        tenant_id,
        student_id: { in: resolvedStudentIds },
        ...commentScopeFilter,
      },
      select: {
        student_id: true,
        subject_id: true,
        comment_text: true,
        finalised_at: true,
      },
    });

    const subjectComments = new Map<string, string>();
    for (const row of subjectCommentRows) {
      if (row.finalised_at) {
        subjectComments.set(`${row.student_id}:${row.subject_id}`, row.comment_text);
      }
    }

    const overallCommentRows = await tx.reportCardOverallComment.findMany({
      where: {
        tenant_id,
        student_id: { in: resolvedStudentIds },
        ...commentScopeFilter,
      },
      select: {
        student_id: true,
        comment_text: true,
        finalised_at: true,
      },
    });

    const overallComments = new Map<string, string>();
    for (const row of overallCommentRows) {
      if (row.finalised_at) {
        overallComments.set(row.student_id, row.comment_text);
      }
    }

    // Compute top-3 rank badges if enabled.
    const rankBadges = settingsPayload.show_top_rank_badge
      ? computeRankBadges(resolvedStudentIds, snapshotsByStudent)
      : new Map<string, 1 | 2 | 3 | null>();

    const errors: Array<{ student_id: string; message: string }> = [];
    let generated = 0;
    let blocked = 0;

    for (const studentId of resolvedStudentIds) {
      try {
        const student = studentById.get(studentId);
        if (!student) {
          throw new Error('Student metadata missing');
        }

        const englishPayload = buildRenderPayload({
          tenant: tenantForRender,
          template,
          student,
          period: renderPeriod,
          language: 'en',
          personalInfoFields,
          subjectSnapshots: snapshotsByStudent.get(studentId) ?? [],
          subjectComments,
          overallComment: overallComments.get(studentId) ?? '',
          settingsPayload,
          rankBadge: rankBadges.get(studentId) ?? null,
        });

        await this.renderAndUpsert(tx, {
          tenantId: tenant_id,
          template,
          studentId,
          periodId: batchJob.academic_period_id,
          academicYearId: batchJob.academic_year_id,
          personalInfoFields,
          payload: englishPayload,
          locale: 'en',
          batchJobId: batch_job_id,
        });

        if (student.preferred_second_language === 'ar' && arTemplate) {
          const arabicPayload = buildRenderPayload({
            tenant: tenantForRender,
            template: arTemplate,
            student,
            period: renderPeriod,
            language: 'ar',
            personalInfoFields,
            subjectSnapshots: snapshotsByStudent.get(studentId) ?? [],
            subjectComments,
            overallComment: overallComments.get(studentId) ?? '',
            settingsPayload,
            rankBadge: rankBadges.get(studentId) ?? null,
          });

          await this.renderAndUpsert(tx, {
            tenantId: tenant_id,
            template: arTemplate,
            studentId,
            periodId: batchJob.academic_period_id,
            academicYearId: batchJob.academic_year_id,
            personalInfoFields,
            payload: arabicPayload,
            locale: 'ar',
            batchJobId: batch_job_id,
          });
        }

        generated += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        this.logger.error(
          `Failed to render report card for student ${studentId} (tenant ${tenant_id}): ${message}`,
        );
        errors.push({ student_id: studentId, message });
        blocked += 1;
      }
    }

    await tx.reportCardBatchJob.update({
      where: { id: batch_job_id },
      data: {
        status: 'completed',
        total_count: resolvedStudentIds.length,
        completed_count: generated,
        students_generated_count: generated,
        students_blocked_count: blocked,
        errors_json: errors as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(
      `Generation run ${batch_job_id} complete — generated=${generated} blocked=${blocked}`,
    );
  }

  private async failBatch(tx: PrismaClient, batchJobId: string, reason: string): Promise<void> {
    await tx.reportCardBatchJob.update({
      where: { id: batchJobId },
      data: {
        status: 'failed',
        error_message: reason,
      },
    });
  }

  private async renderAndUpsert(
    tx: PrismaClient,
    params: {
      tenantId: string;
      template: { id: string; locale: string };
      studentId: string;
      /** NULL for full-year report cards (Phase 1b — Option B). */
      periodId: string | null;
      academicYearId: string;
      personalInfoFields: PersonalInfoFieldKey[];
      payload: ReportCardRenderPayload;
      locale: string;
      batchJobId: string;
    },
  ): Promise<void> {
    const pdf = await this.renderer.render(params.payload);

    // Storage key — full-year rows use a `full-year-<yearId>` segment so
    // they live in a sibling directory to per-period PDFs and never collide.
    const periodSegment =
      params.periodId !== null ? params.periodId : `full-year-${params.academicYearId}`;
    const key = `report-cards/${params.studentId}/${periodSegment}/${params.template.id}/${params.locale}.pdf`;
    const storageKey = await this.storage.upload(params.tenantId, key, pdf, 'application/pdf');

    // Dedup lookup: per-period uses (student, period); full-year uses
    // (student, NULL period, year). This matches the partial unique index
    // pair created in the migration.
    const scopeWhere =
      params.periodId !== null
        ? { academic_period_id: params.periodId }
        : { academic_period_id: null, academic_year_id: params.academicYearId };

    const existing = await tx.reportCard.findFirst({
      where: {
        tenant_id: params.tenantId,
        student_id: params.studentId,
        ...scopeWhere,
        template_id: params.template.id,
        template_locale: params.locale,
      },
      select: { id: true, pdf_storage_key: true },
    });

    if (existing) {
      if (existing.pdf_storage_key && existing.pdf_storage_key !== storageKey) {
        try {
          await this.storage.delete(existing.pdf_storage_key);
        } catch (err) {
          this.logger.warn(
            `Failed to delete previous PDF ${existing.pdf_storage_key}: ${err instanceof Error ? err.message : 'unknown'}`,
          );
        }
      }

      await tx.reportCard.update({
        where: { id: existing.id },
        data: {
          pdf_storage_key: storageKey,
          personal_info_fields_json: params.personalInfoFields as unknown as Prisma.InputJsonValue,
          snapshot_payload_json: params.payload as unknown as Prisma.InputJsonValue,
          overall_comment_text: params.payload.grades.overall.overall_comment || null,
          // Re-point the row at the current run so the library groups the
          // regenerated card under the new batch rather than the original.
          batch_job_id: params.batchJobId,
        },
      });
    } else {
      await tx.reportCard.create({
        data: {
          tenant_id: params.tenantId,
          student_id: params.studentId,
          academic_period_id: params.periodId,
          academic_year_id: params.academicYearId,
          template_id: params.template.id,
          template_locale: params.locale,
          status: 'draft',
          pdf_storage_key: storageKey,
          personal_info_fields_json: params.personalInfoFields as unknown as Prisma.InputJsonValue,
          snapshot_payload_json: params.payload as unknown as Prisma.InputJsonValue,
          overall_comment_text: params.payload.grades.overall.overall_comment || null,
          batch_job_id: params.batchJobId,
        },
      });
    }
  }
}

// ─── Pure helpers ────────────────────────────────────────────────────────────

interface TenantSettingsShape {
  show_top_rank_badge: boolean;
  principal_signature_storage_key: string | null;
  principal_name: string | null;
}

function parseTenantSettings(json: Prisma.JsonValue | null | undefined): TenantSettingsShape {
  const defaults: TenantSettingsShape = {
    show_top_rank_badge: false,
    principal_signature_storage_key: null,
    principal_name: null,
  };
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return defaults;
  }
  const obj = json as Record<string, unknown>;
  return {
    show_top_rank_badge:
      typeof obj.show_top_rank_badge === 'boolean' ? obj.show_top_rank_badge : false,
    principal_signature_storage_key:
      typeof obj.principal_signature_storage_key === 'string'
        ? obj.principal_signature_storage_key
        : null,
    principal_name: typeof obj.principal_name === 'string' ? obj.principal_name : null,
  };
}

function parsePersonalInfoFields(
  json: Prisma.JsonValue | null | undefined,
): PersonalInfoFieldKey[] {
  if (!Array.isArray(json)) return [];
  return json.filter((v): v is PersonalInfoFieldKey => typeof v === 'string');
}

function resolveStudentIds(json: Prisma.JsonValue | null | undefined): string[] {
  if (!Array.isArray(json)) return [];
  return json.filter((v): v is string => typeof v === 'string');
}

async function expandScope(
  tx: PrismaClient,
  tenantId: string,
  scopeMode: string,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) {
    return [];
  }

  if (scopeMode === 'individual') {
    return ids;
  }

  if (scopeMode === 'class') {
    const rows = await tx.classEnrolment.findMany({
      where: { tenant_id: tenantId, class_id: { in: ids }, status: 'active' },
      select: { student_id: true },
    });
    return dedupe(rows.map((r) => r.student_id));
  }

  if (scopeMode === 'year_group') {
    const classes = await tx.class.findMany({
      where: { tenant_id: tenantId, year_group_id: { in: ids } },
      select: { id: true },
    });
    const classIds = classes.map((c) => c.id);
    if (classIds.length === 0) return [];
    const rows = await tx.classEnrolment.findMany({
      where: { tenant_id: tenantId, class_id: { in: classIds }, status: 'active' },
      select: { student_id: true },
    });
    return dedupe(rows.map((r) => r.student_id));
  }

  return [];
}

function dedupe<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const item of items) {
    if (!seen.has(item)) {
      seen.add(item);
      out.push(item);
    }
  }
  return out;
}

interface StudentForRender {
  id: string;
  first_name: string;
  last_name: string;
  student_number: string | null;
  date_of_birth: Date;
  gender: string | null;
  nationality: string | null;
  entry_date: Date | null;
  preferred_second_language: string | null;
  year_group: { id: string; name: string } | null;
  homeroom_class: { id: string; name: string } | null;
}

interface SnapshotRow {
  subject_id: string;
  computed_value: Prisma.Decimal;
  display_value: string;
  overridden_value: string | null;
  subject: { id: string; name: string; code: string | null };
}

function buildRenderPayload(args: {
  tenant: { id: string; name: string; logo_url: string | null };
  template: { id: string };
  student: StudentForRender;
  // The period object may be a real AcademicPeriod or a synthetic
  // "Full Year" entry constructed by the full-year branch above.
  period: {
    id: string;
    name: string;
    academic_year: { name: string } | null;
  };
  language: 'en' | 'ar';
  personalInfoFields: PersonalInfoFieldKey[];
  subjectSnapshots: SnapshotRow[];
  subjectComments: Map<string, string>;
  overallComment: string;
  settingsPayload: TenantSettingsShape;
  rankBadge: 1 | 2 | 3 | null;
}): ReportCardRenderPayload {
  const personalInfo: Partial<Record<PersonalInfoFieldKey, string | null>> = {};
  for (const field of args.personalInfoFields) {
    personalInfo[field] = resolvePersonalInfoValue(field, args.student);
  }

  const subjects = args.subjectSnapshots.map((snapshot) => {
    const score = Number(snapshot.computed_value);
    return {
      subject_id: snapshot.subject_id,
      subject_name: snapshot.subject.name,
      teacher_name: null,
      score: Number.isFinite(score) ? score : null,
      grade: snapshot.overridden_value ?? snapshot.display_value ?? null,
      subject_comment: args.subjectComments.get(`${args.student.id}:${snapshot.subject_id}`) ?? '',
    };
  });

  const weightedAverage =
    subjects.length > 0
      ? subjects.reduce((sum, s) => sum + (s.score ?? 0), 0) / subjects.length
      : null;

  return {
    tenant: {
      id: args.tenant.id,
      name: args.tenant.name,
      logo_storage_key: args.tenant.logo_url ?? null,
      principal_name: args.settingsPayload.principal_name,
      principal_signature_storage_key: args.settingsPayload.principal_signature_storage_key,
      address: null,
    },
    language: args.language,
    direction: args.language === 'ar' ? 'rtl' : 'ltr',
    template: {
      id: args.template.id,
      content_scope: 'grades_only',
    },
    student: {
      id: args.student.id,
      personal_info: personalInfo,
      rank_badge: args.rankBadge,
    },
    academic_period: {
      id: args.period.id,
      name: args.period.name,
      academic_year_name: args.period.academic_year?.name ?? '',
    },
    grades: {
      subjects,
      overall: {
        weighted_average: weightedAverage,
        overall_grade: null,
        overall_comment: args.overallComment,
      },
      grading_scale: [],
    },
    issued_at: new Date().toISOString(),
  };
}

function resolvePersonalInfoValue(
  field: PersonalInfoFieldKey,
  student: StudentForRender,
): string | null {
  switch (field) {
    case 'full_name':
      return `${student.first_name} ${student.last_name}`;
    case 'student_number':
      return student.student_number;
    case 'date_of_birth':
      return student.date_of_birth.toISOString().slice(0, 10);
    case 'sex':
      return student.gender;
    case 'nationality':
      return student.nationality;
    case 'national_id':
      // Encrypted at rest; not materialised here. Impl 11 will wire the
      // decrypt-on-read flow when it has the decryption context.
      return null;
    case 'admission_date':
      return student.entry_date ? student.entry_date.toISOString().slice(0, 10) : null;
    case 'photo':
      return null;
    case 'homeroom_teacher':
      return null;
    case 'year_group':
      return student.year_group?.name ?? null;
    case 'class_name':
      return student.homeroom_class?.name ?? null;
    default:
      return null;
  }
}

/**
 * Dense rank on weighted overall average, capped at top 3. Ties share the
 * same rank. Everyone else receives null.
 */
function computeRankBadges(
  studentIds: string[],
  snapshotsByStudent: Map<string, SnapshotRow[]>,
): Map<string, 1 | 2 | 3 | null> {
  const averages = studentIds.map((id) => {
    const rows = snapshotsByStudent.get(id) ?? [];
    if (rows.length === 0) {
      return { id, avg: null as number | null };
    }
    const sum = rows.reduce((acc, row) => acc + Number(row.computed_value), 0);
    return { id, avg: sum / rows.length };
  });

  const scored = averages
    .filter((row): row is { id: string; avg: number } => row.avg !== null)
    .sort((a, b) => b.avg - a.avg);

  const result = new Map<string, 1 | 2 | 3 | null>();
  for (const id of studentIds) {
    result.set(id, null);
  }

  let rank = 0;
  let lastAvg: number | null = null;
  let processed = 0;
  for (const row of scored) {
    if (lastAvg === null || row.avg < lastAvg) {
      rank = processed + 1;
      lastAvg = row.avg;
    }
    if (rank <= 3) {
      result.set(row.id, rank as 1 | 2 | 3);
    } else {
      break;
    }
    processed += 1;
  }

  return result;
}
