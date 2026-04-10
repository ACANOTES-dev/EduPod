import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import AdmZip from 'adm-zip';
import { PDFDocument } from 'pdf-lib';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { AttendanceReadFacade } from '../../attendance/attendance-read.facade';
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { S3Service } from '../../s3/s3.service';
import { StudentReadFacade } from '../../students/student-read.facade';
import { TenantReadFacade } from '../../tenants/tenant-read.facade';
import type { UpdateReportCardDto } from '../dto/gradebook.dto';

import { ReportCardGenerationService } from './report-card-generation.service';
import { ReportCardTranscriptService } from './report-card-transcript.service';

@Injectable()
export class ReportCardsService {
  private readonly logger = new Logger(ReportCardsService.name);
  private readonly generationService: ReportCardGenerationService;
  private readonly transcriptService: ReportCardTranscriptService;
  private readonly studentReadFacade: StudentReadFacade;

  constructor(
    private readonly prisma: PrismaService,
    redisService: RedisService,
    academicReadFacade: AcademicReadFacade,
    studentReadFacade: StudentReadFacade,
    tenantReadFacade: TenantReadFacade,
    attendanceReadFacade: AttendanceReadFacade,
    classesReadFacade: ClassesReadFacade,
    private readonly s3Service: S3Service,
  ) {
    this.studentReadFacade = studentReadFacade;
    this.generationService = new ReportCardGenerationService(
      this.prisma,
      academicReadFacade,
      studentReadFacade,
      tenantReadFacade,
      attendanceReadFacade,
      classesReadFacade,
    );
    this.transcriptService = new ReportCardTranscriptService(
      this.prisma,
      redisService,
      studentReadFacade,
    );
  }

  /**
   * Generate report cards for multiple students in a given period.
   * Builds snapshot_payload_json from period_grade_snapshots + attendance + metadata.
   */
  async generate(tenantId: string, studentIds: string[], periodId: string) {
    return this.generationService.generate(tenantId, studentIds, periodId);
  }

  // findAll and findOne moved to ReportCardsQueriesService (M-16 CQRS-lite split)

  /**
   * Update a draft report card (comments and locale).
   * Updates both the record fields and the snapshot_payload_json.
   */
  async update(tenantId: string, id: string, dto: UpdateReportCardDto) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true, updated_at: true, snapshot_payload_json: true },
    });

    if (!reportCard) {
      throw new NotFoundException({
        code: 'REPORT_CARD_NOT_FOUND',
        message: `Report card with id "${id}" not found`,
      });
    }

    if (reportCard.status !== 'draft') {
      throw new ConflictException({
        code: 'REPORT_CARD_NOT_DRAFT',
        message: 'Only draft report cards can be updated',
      });
    }

    // Optimistic concurrency check
    if (dto.expected_updated_at) {
      const expectedDate = new Date(dto.expected_updated_at);
      if (reportCard.updated_at.getTime() !== expectedDate.getTime()) {
        throw new ConflictException({
          code: 'CONCURRENT_MODIFICATION',
          message:
            'The report card has been modified by another user. Please refresh and try again.',
        });
      }
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const updateData: Prisma.ReportCardUpdateInput = {};
      const snapshotPayload = reportCard.snapshot_payload_json as Record<string, unknown>;

      if (dto.teacher_comment !== undefined) {
        updateData.teacher_comment = dto.teacher_comment ?? null;
        snapshotPayload['teacher_comment'] = dto.teacher_comment ?? null;
      }

      if (dto.principal_comment !== undefined) {
        updateData.principal_comment = dto.principal_comment ?? null;
        snapshotPayload['principal_comment'] = dto.principal_comment ?? null;
      }

      if (dto.template_locale !== undefined) {
        updateData.template_locale = dto.template_locale;
      }

      updateData.snapshot_payload_json = snapshotPayload as unknown as Prisma.InputJsonValue;

      return db.reportCard.update({
        where: { id },
        data: updateData,
      });
    });
  }

  /**
   * Publish a report card. Sets status=published, published_at, published_by.
   * Invalidates transcript cache for the student.
   */
  async publish(tenantId: string, id: string, userId: string) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true, student_id: true },
    });

    if (!reportCard) {
      throw new NotFoundException({
        code: 'REPORT_CARD_NOT_FOUND',
        message: `Report card with id "${id}" not found`,
      });
    }

    if (reportCard.status !== 'draft') {
      throw new ConflictException({
        code: 'REPORT_CARD_NOT_DRAFT',
        message: 'Only draft report cards can be published',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const published = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      return db.reportCard.update({
        where: { id },
        data: {
          status: 'published',
          published_at: new Date(),
          published_by_user_id: userId,
        },
      });
    });

    // Invalidate transcript cache
    await this.invalidateTranscriptCache(tenantId, reportCard.student_id);

    return published;
  }

  /**
   * Revise a published report card.
   * Creates a new draft with revision_of_report_card_id, copies snapshot,
   * sets original to 'revised'.
   */
  async revise(tenantId: string, id: string) {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!reportCard) {
      throw new NotFoundException({
        code: 'REPORT_CARD_NOT_FOUND',
        message: `Report card with id "${id}" not found`,
      });
    }

    if (reportCard.status !== 'published') {
      throw new ConflictException({
        code: 'REPORT_CARD_NOT_PUBLISHED',
        message: 'Only published report cards can be revised',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      // 1. Set original to revised FIRST to clear the partial unique constraint
      await db.reportCard.update({
        where: { id: reportCard.id },
        data: { status: 'revised' },
      });

      // 2. Create new draft with copied snapshot. Full-year revisions
      // preserve the null academic_period_id but keep the year scope.
      const newReportCard = await db.reportCard.create({
        data: {
          tenant_id: tenantId,
          student_id: reportCard.student_id,
          academic_period_id: reportCard.academic_period_id,
          academic_year_id: reportCard.academic_year_id,
          status: 'draft',
          template_locale: reportCard.template_locale,
          teacher_comment: reportCard.teacher_comment,
          principal_comment: reportCard.principal_comment,
          revision_of_report_card_id: reportCard.id,
          snapshot_payload_json: reportCard.snapshot_payload_json as Prisma.InputJsonValue,
        },
      });

      return newReportCard;
    });
  }

  // buildBatchSnapshots and gradeOverview moved to ReportCardsQueriesService (M-16)

  /**
   * Invalidate transcript cache for a given tenant+student.
   */
  async invalidateTranscriptCache(tenantId: string, studentId: string) {
    return this.transcriptService.invalidateTranscriptCache(tenantId, studentId);
  }

  /**
   * Generate draft report cards for all active students in a class for a period.
   * Skips students who already have a report card for this period.
   */
  async generateBulkDrafts(tenantId: string, classId: string, periodId: string) {
    return this.generationService.generateBulkDrafts(tenantId, classId, periodId);
  }

  /**
   * Bulk publish multiple report cards.
   */
  async publishBulk(tenantId: string, reportCardIds: string[], userId: string) {
    const results: Array<{ report_card_id: string; success: boolean; error?: string }> = [];

    for (const id of reportCardIds) {
      try {
        await this.publish(tenantId, id, userId);
        results.push({ report_card_id: id, success: true });
      } catch (err) {
        results.push({
          report_card_id: id,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return { results, succeeded, failed };
  }

  // generateTranscript moved to ReportCardsQueriesService (M-16)

  /**
   * Delete a report card. Only draft/revised rows are deletable — published
   * rows must be unpublished via `revise()` first. Removes the DB row and
   * best-effort deletes the S3 object; an S3 failure is logged but does not
   * block the DB mutation because orphan S3 objects are reaped by the
   * tenant-wide cleanup crons.
   */
  async delete(tenantId: string, id: string): Promise<{ id: string }> {
    const reportCard = await this.prisma.reportCard.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true, pdf_storage_key: true, student_id: true },
    });

    if (!reportCard) {
      throw new NotFoundException({
        code: 'REPORT_CARD_NOT_FOUND',
        message: `Report card with id "${id}" not found`,
      });
    }

    if (reportCard.status === 'published') {
      throw new ConflictException({
        code: 'REPORT_CARD_PUBLISHED',
        message:
          'Published report cards cannot be deleted. Unpublish (revise) the card first, then delete the resulting draft.',
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.reportCard.delete({ where: { id } });
    });

    if (reportCard.pdf_storage_key) {
      try {
        await this.s3Service.delete(reportCard.pdf_storage_key);
      } catch (err) {
        this.logger.warn(
          `Failed to delete S3 object ${reportCard.pdf_storage_key} for report card ${id}: ${
            err instanceof Error ? err.message : 'unknown'
          } — row already removed, object will be reaped by cleanup cron.`,
        );
      }
    }

    // Transcript cache invalidation so the student's transcript view
    // reflects the deletion immediately.
    await this.invalidateTranscriptCache(tenantId, reportCard.student_id);

    return { id };
  }

  /**
   * Bulk delete report cards. Accepts either an explicit list of ids or a
   * set of scope filters (class_ids, year_group_ids, period/year). Rejects
   * the whole request with 409 if ANY matching row is published — the
   * caller is expected to split published-vs-draft selections before
   * calling. Returns the count deleted.
   */
  async bulkDelete(
    tenantId: string,
    params: {
      report_card_ids?: string[];
      class_ids?: string[];
      year_group_ids?: string[];
      academic_period_id?: string | null;
      academic_year_id?: string;
    },
  ): Promise<{ deleted_count: number }> {
    const { report_card_ids, class_ids, year_group_ids, academic_period_id, academic_year_id } =
      params;

    const where: Prisma.ReportCardWhereInput = { tenant_id: tenantId };

    if (report_card_ids && report_card_ids.length > 0) {
      where.id = { in: report_card_ids };
    }
    if (academic_period_id !== undefined) {
      // `null` here maps to the full-year scope (Phase 1b — Option B).
      where.academic_period_id = academic_period_id;
    }
    if (academic_year_id) {
      where.academic_year_id = academic_year_id;
    }
    if (class_ids || year_group_ids) {
      // Resolve class/year-group filter into a student id list via the
      // StudentReadFacade so we honour the module boundary rule
      // (no direct cross-module Prisma access).
      const studentFilter: Prisma.StudentWhereInput = {};
      if (year_group_ids && year_group_ids.length > 0) {
        studentFilter.year_group_id = { in: year_group_ids };
      }
      if (class_ids && class_ids.length > 0) {
        studentFilter.class_enrolments = {
          some: { tenant_id: tenantId, class_id: { in: class_ids }, status: 'active' },
        };
      }
      const matchedStudents = (await this.studentReadFacade.findManyGeneric(tenantId, {
        where: studentFilter,
        select: { id: true },
      })) as Array<{ id: string }>;
      if (matchedStudents.length === 0) {
        return { deleted_count: 0 };
      }
      where.student_id = { in: matchedStudents.map((s) => s.id) };
    }

    const noFilters =
      !report_card_ids?.length &&
      !class_ids?.length &&
      !year_group_ids?.length &&
      !academic_period_id &&
      !academic_year_id;

    if (noFilters) {
      throw new ConflictException({
        code: 'BULK_DELETE_UNSCOPED',
        message:
          'Bulk delete refused — at least one of report_card_ids, class_ids, year_group_ids, academic_period_id or academic_year_id must be supplied.',
      });
    }

    // Load matching rows so we can validate none are published AND so we
    // can issue S3 deletes after the DB wipe. `pdf_storage_key` may be
    // null if the row was generated before the S3 writer was wired, so
    // we filter those out before enqueueing S3 deletes.
    const candidates = await this.prisma.reportCard.findMany({
      where,
      select: { id: true, status: true, pdf_storage_key: true, student_id: true },
    });

    const publishedHits = candidates.filter((c) => c.status === 'published');
    if (publishedHits.length > 0) {
      throw new ConflictException({
        code: 'REPORT_CARD_PUBLISHED_IN_SELECTION',
        message: `Bulk delete refused — ${publishedHits.length} of the matching rows are published. Unpublish (revise) them first, then retry.`,
      });
    }

    if (candidates.length === 0) {
      return { deleted_count: 0 };
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.reportCard.deleteMany({
        where: { id: { in: candidates.map((c) => c.id) } },
      });
    });

    // Best-effort S3 cleanup — errors are logged but don't fail the call.
    for (const row of candidates) {
      if (!row.pdf_storage_key) continue;
      try {
        await this.s3Service.delete(row.pdf_storage_key);
      } catch (err) {
        this.logger.warn(
          `Bulk delete: failed to remove S3 object ${row.pdf_storage_key}: ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        );
      }
    }

    // Invalidate transcript cache for every distinct student touched.
    const studentIds = Array.from(new Set(candidates.map((c) => c.student_id)));
    for (const studentId of studentIds) {
      await this.invalidateTranscriptCache(tenantId, studentId);
    }

    return { deleted_count: candidates.length };
  }

  // ─── Bundle PDF download (Phase B) ────────────────────────────────────────
  //
  // Stitches together every report card in a scope into either one merged
  // PDF or a ZIP of per-class merged PDFs. Admins use this to print 500
  // documents as 20 files (one per class) or as a single stream.
  //
  // The method resolves the scope to a list of row ids + pdf_storage_keys,
  // streams each PDF from S3, and concatenates them in batch_job/class
  // order so the resulting document reads predictably.

  async bundlePdfs(
    tenantId: string,
    params: {
      class_ids?: string[];
      report_card_ids?: string[];
      academic_period_id?: string | null;
      academic_year_id?: string;
      locale: string;
      merge_mode: 'single' | 'per_class';
    },
  ): Promise<{ buffer: Buffer; filename: string; mime: string }> {
    const where: Prisma.ReportCardWhereInput = {
      tenant_id: tenantId,
      status: { not: 'superseded' },
      template_locale: params.locale,
      pdf_storage_key: { not: null },
    };
    if (params.report_card_ids && params.report_card_ids.length > 0) {
      where.id = { in: params.report_card_ids };
    }
    if (params.academic_period_id !== undefined) {
      where.academic_period_id = params.academic_period_id;
    }
    if (params.academic_year_id) {
      where.academic_year_id = params.academic_year_id;
    }
    if (params.class_ids && params.class_ids.length > 0) {
      const students = (await this.studentReadFacade.findManyGeneric(tenantId, {
        where: {
          class_enrolments: {
            some: { tenant_id: tenantId, class_id: { in: params.class_ids }, status: 'active' },
          },
        },
        select: { id: true },
      })) as Array<{ id: string }>;
      if (students.length === 0) {
        throw new NotFoundException({
          code: 'BUNDLE_SCOPE_EMPTY',
          message: 'No students match the requested class scope.',
        });
      }
      where.student_id = { in: students.map((s) => s.id) };
    }

    const rows = await this.prisma.reportCard.findMany({
      where,
      orderBy: [{ created_at: 'asc' }],
      select: {
        id: true,
        pdf_storage_key: true,
        student: {
          select: {
            id: true,
            first_name: true,
            last_name: true,
            homeroom_class: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (rows.length === 0) {
      throw new NotFoundException({
        code: 'BUNDLE_EMPTY',
        message: 'No report cards match the requested bundle scope.',
      });
    }

    // Download each PDF from S3 once. Report cards without a storage key
    // were filtered out by the `where` above, so every row here has one.
    const pdfBuffers = new Map<string, Buffer>();
    await Promise.all(
      rows.map(async (row) => {
        if (!row.pdf_storage_key) return;
        try {
          const buf = await this.s3Service.download(row.pdf_storage_key);
          pdfBuffers.set(row.id, buf);
        } catch (err) {
          this.logger.warn(
            `Bundle: failed to download ${row.pdf_storage_key}: ${
              err instanceof Error ? err.message : 'unknown'
            } — row will be skipped.`,
          );
        }
      }),
    );

    // Sort rows per class by student last name then first name so the
    // merged stream reads alphabetically within each class bucket.
    const sortRows = (a: (typeof rows)[number], b: (typeof rows)[number]) => {
      const lastCmp = a.student.last_name.localeCompare(b.student.last_name);
      if (lastCmp !== 0) return lastCmp;
      return a.student.first_name.localeCompare(b.student.first_name);
    };

    if (params.merge_mode === 'single') {
      const merged = await mergePdfBuffers(
        rows
          .slice()
          .sort((a, b) => {
            const classA = a.student.homeroom_class?.name ?? '';
            const classB = b.student.homeroom_class?.name ?? '';
            const cmp = classA.localeCompare(classB);
            if (cmp !== 0) return cmp;
            return sortRows(a, b);
          })
          .map((row) => pdfBuffers.get(row.id))
          .filter((buf): buf is Buffer => Buffer.isBuffer(buf)),
      );
      return {
        buffer: merged,
        filename: `report-cards-${Date.now()}.pdf`,
        mime: 'application/pdf',
      };
    }

    // per_class: group rows by homeroom_class then merge each group
    // separately and zip them together.
    const byClass = new Map<string, { className: string; rows: typeof rows }>();
    for (const row of rows) {
      const classId = row.student.homeroom_class?.id ?? '__unassigned';
      const className = row.student.homeroom_class?.name ?? 'Unassigned';
      const bucket = byClass.get(classId) ?? { className, rows: [] as typeof rows };
      bucket.rows.push(row);
      byClass.set(classId, bucket);
    }

    const zip = new AdmZip();
    for (const bucket of byClass.values()) {
      const pdfs = bucket.rows
        .sort(sortRows)
        .map((row) => pdfBuffers.get(row.id))
        .filter((buf): buf is Buffer => Buffer.isBuffer(buf));
      if (pdfs.length === 0) continue;
      const merged = await mergePdfBuffers(pdfs);
      // ASCII-safe filename so unzip tools don't choke on exotic class
      // names. Non-alnum/space characters are replaced with `-`.
      const safeName = bucket.className.replace(/[^A-Za-z0-9 _-]+/g, '-').trim() || 'class';
      zip.addFile(`${safeName}.pdf`, merged);
    }

    return {
      buffer: zip.toBuffer(),
      filename: `report-cards-by-class-${Date.now()}.zip`,
      mime: 'application/zip',
    };
  }
}

/**
 * Concatenate a list of PDF buffers into a single document via pdf-lib.
 * Each source PDF's pages are appended in order; the resulting document
 * keeps their original page dimensions and metadata.
 */
async function mergePdfBuffers(buffers: Buffer[]): Promise<Buffer> {
  if (buffers.length === 0) {
    // pdf-lib refuses to save a document with zero pages; return a
    // single-page sentinel rather than throwing because the caller has
    // already asserted the scope is non-empty.
    const empty = await PDFDocument.create();
    empty.addPage();
    return Buffer.from(await empty.save());
  }
  if (buffers.length === 1) {
    // Fast path: single-PDF bundles skip the merge round-trip entirely.
    const only = buffers[0];
    if (only) return only;
  }
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const src = await PDFDocument.load(buf);
    const pages = await merged.copyPages(src, src.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }
  return Buffer.from(await merged.save());
}
