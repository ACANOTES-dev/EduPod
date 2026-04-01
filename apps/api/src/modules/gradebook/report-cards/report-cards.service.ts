import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, $Enums } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import type { UpdateReportCardDto } from '../dto/gradebook.dto';

import { ReportCardGenerationService } from './report-card-generation.service';
import { ReportCardTranscriptService } from './report-card-transcript.service';

interface ListReportCardsParams {
  page: number;
  pageSize: number;
  student_id?: string;
  academic_period_id?: string;
  status?: string;
  include_revisions?: boolean;
}

@Injectable()
export class ReportCardsService {
  private readonly generationService: ReportCardGenerationService;
  private readonly transcriptService: ReportCardTranscriptService;

  constructor(
    private readonly prisma: PrismaService,
    redisService: RedisService,
  ) {
    this.generationService = new ReportCardGenerationService(this.prisma);
    this.transcriptService = new ReportCardTranscriptService(this.prisma, redisService);
  }

  /**
   * Generate report cards for multiple students in a given period.
   * Builds snapshot_payload_json from period_grade_snapshots + attendance + metadata.
   */
  async generate(tenantId: string, studentIds: string[], periodId: string) {
    return this.generationService.generate(tenantId, studentIds, periodId);
  }

  /**
   * List report cards with filters and pagination.
   * Excludes revised by default unless include_revisions=true.
   */
  async findAll(tenantId: string, params: ListReportCardsParams) {
    const { page, pageSize, student_id, academic_period_id, status, include_revisions } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.ReportCardWhereInput = { tenant_id: tenantId };

    if (student_id) {
      where.student_id = student_id;
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

      // 2. Create new draft with copied snapshot
      const newReportCard = await db.reportCard.create({
        data: {
          tenant_id: tenantId,
          student_id: reportCard.student_id,
          academic_period_id: reportCard.academic_period_id,
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

  /**
   * Build snapshot payloads for all active students in a class for the given period.
   * Returns an array of { student, snapshotPayload } objects, one per student.
   */
  async buildBatchSnapshots(tenantId: string, classId: string, periodId: string) {
    return this.generationService.buildBatchSnapshots(tenantId, classId, periodId);
  }

  /**
   * Overview: paginated list of period grade snapshots showing Student | Period | Final Grade | Status.
   */
  async gradeOverview(
    tenantId: string,
    params: {
      page: number;
      pageSize: number;
      class_id?: string;
      academic_period_id?: string;
    },
  ) {
    const { page, pageSize, class_id, academic_period_id } = params;
    const skip = (page - 1) * pageSize;

    const where: Prisma.PeriodGradeSnapshotWhereInput = {
      tenant_id: tenantId,
    };

    if (class_id) {
      where.class_id = class_id;
    }
    if (academic_period_id) {
      where.academic_period_id = academic_period_id;
    }

    const [data, total] = await Promise.all([
      this.prisma.periodGradeSnapshot.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ student: { last_name: 'asc' } }, { subject: { name: 'asc' } }],
        include: {
          student: {
            select: {
              id: true,
              first_name: true,
              last_name: true,
              student_number: true,
            },
          },
          subject: {
            select: { id: true, name: true },
          },
          academic_period: {
            select: { id: true, name: true },
          },
          class_entity: {
            select: { id: true, name: true },
          },
        },
      }),
      this.prisma.periodGradeSnapshot.count({ where }),
    ]);

    return {
      data: data.map((row) => ({
        id: row.id,
        student_name: `${row.student.first_name} ${row.student.last_name}`,
        student_number: row.student.student_number,
        subject_name: row.subject.name,
        class_name: row.class_entity.name,
        period_name: row.academic_period.name,
        academic_period_id: row.academic_period.id,
        final_grade: row.overridden_value ?? row.display_value,
        computed_value: Number(row.computed_value),
        has_override: row.overridden_value !== null,
      })),
      meta: { page, pageSize, total },
    };
  }

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

  /**
   * Generate full academic transcript for a student across all periods and years.
   * Aggregates period_grade_snapshots and gpa_snapshots, grouped by year -> period.
   */
  async generateTranscript(tenantId: string, studentId: string) {
    return this.transcriptService.generateTranscript(tenantId, studentId);
  }
}
