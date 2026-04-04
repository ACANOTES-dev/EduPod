import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../../academics/academic-read.facade';
import { AttendanceReadFacade } from '../../attendance/attendance-read.facade';
import { ClassesReadFacade } from '../../classes/classes-read.facade';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
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

  constructor(
    private readonly prisma: PrismaService,
    redisService: RedisService,
    academicReadFacade: AcademicReadFacade,
    studentReadFacade: StudentReadFacade,
    tenantReadFacade: TenantReadFacade,
    attendanceReadFacade: AttendanceReadFacade,
    classesReadFacade: ClassesReadFacade,
  ) {
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
}
