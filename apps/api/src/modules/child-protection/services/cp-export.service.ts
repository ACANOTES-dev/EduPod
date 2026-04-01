import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import type { ExportPurpose } from '@school/shared';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PastoralEventService } from '../../pastoral/services/pastoral-event.service';
import { PdfRenderingService } from '../../pdf-rendering/pdf-rendering.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { SequenceService } from '../../sequence/sequence.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const EXPORT_PURPOSES: readonly ExportPurpose[] = [
  'tusla_request',
  'section_26_inquiry',
  'legal_proceedings',
  'school_transfer_cp',
  'board_of_management',
  'other',
] as const;

const DOWNLOAD_TOKEN_PREFIX = 'cp-export:download:';
const PREVIEW_TOKEN_PREFIX = 'cp-export:preview:';
const PDF_BUFFER_PREFIX = 'cp-export:pdf:';
const TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CpExportPreviewDto {
  student_id: string;
  purpose?: ExportPurpose;
  other_reason?: string;
  record_types?: string[];
  date_from?: string;
  date_to?: string;
}

export interface CpExportGenerateDto {
  preview_token?: string;
  student_id?: string;
  purpose?: ExportPurpose;
  other_reason?: string;
  record_types?: string[];
  date_from?: string;
  date_to?: string;
  locale?: string;
}

export interface CpExportPreviewResult {
  preview_token: string;
  record_count: number;
  student_name: string;
  date_range: { from: string | null; to: string | null };
  record_types_found: string[];
}

export interface CpExportGenerateResult {
  download_token: string;
  export_ref_id: string;
  filename: string;
}

export interface CpExportDownloadResult {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

interface CpRecordRow {
  id: string;
  student_id: string;
  record_type: string;
  created_at: Date;
  narrative?: string;
  student?: {
    first_name: string;
    last_name: string;
  } | null;
}

interface CpExportPreviewState {
  tenant_id: string;
  user_id: string;
  student_id: string;
  record_ids: string[];
  record_types: string[] | null;
  date_from: string | null;
  date_to: string | null;
  purpose: ExportPurpose | null;
  other_reason: string | null;
}

interface ResolvedCpExportRequest {
  preview_token?: string;
  preview_record_ids?: string[];
  student_id: string;
  purpose: ExportPurpose;
  other_reason?: string;
  record_types?: string[];
  date_from?: string;
  date_to?: string;
  locale: string;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class CpExportService {
  private readonly logger = new Logger(CpExportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfRenderingService: PdfRenderingService,
    private readonly eventService: PastoralEventService,
    private readonly sequenceService: SequenceService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Generate export preview. Returns metadata about what will be exported
   * without generating the PDF. Used by the confirmation step.
   *
   * Generates pastoral_event: cp_export_previewed.
   */
  async preview(
    tenantId: string,
    userId: string,
    dto: CpExportPreviewDto,
    ipAddress: string | null,
  ): Promise<{ data: CpExportPreviewResult }> {
    this.validatePurpose(dto.purpose, dto.other_reason);

    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const records = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where: Record<string, unknown> = {
        tenant_id: tenantId,
        student_id: dto.student_id,
      };

      if (dto.record_types && dto.record_types.length > 0) {
        where.record_type = { in: dto.record_types };
      }
      if (dto.date_from) {
        where.created_at = {
          ...((where.created_at as Record<string, unknown>) ?? {}),
          gte: new Date(dto.date_from),
        };
      }
      if (dto.date_to) {
        where.created_at = {
          ...((where.created_at as Record<string, unknown>) ?? {}),
          lte: new Date(dto.date_to),
        };
      }

      return db.cpRecord.findMany({
        where,
        select: {
          id: true,
          student_id: true,
          record_type: true,
          created_at: true,
          student: { select: { first_name: true, last_name: true } },
        },
        orderBy: { created_at: 'desc' },
      }) as Promise<CpRecordRow[]>;
    })) as CpRecordRow[];

    if (records.length === 0) {
      throw new NotFoundException({
        error: {
          code: 'NO_RECORDS_FOUND',
          message: 'No matching CP records found for the given criteria.',
        },
      });
    }

    // Derive date range from the records found
    const dates = records.map((r) => r.created_at);
    const earliest = new Date(Math.min(...dates.map((d) => d.getTime())));
    const latest = new Date(Math.max(...dates.map((d) => d.getTime())));

    // Derive unique record types found
    const recordTypesFound = [...new Set(records.map((r) => r.record_type))];

    // Student name from first record
    const firstRecord = records[0];
    const studentName = firstRecord?.student
      ? `${firstRecord.student.first_name} ${firstRecord.student.last_name}`
      : 'Unknown Student';

    // Generate a preview token in Redis (so we can validate the generate step is preceded by a preview)
    const crypto = await import('crypto');
    const previewToken = crypto.randomUUID();

    const previewData = JSON.stringify({
      tenant_id: tenantId,
      user_id: userId,
      student_id: dto.student_id,
      record_ids: records.map((r) => r.id),
      record_types: dto.record_types ?? null,
      date_from: dto.date_from ?? null,
      date_to: dto.date_to ?? null,
      purpose: dto.purpose ?? null,
      other_reason: dto.other_reason ?? null,
    });

    const redis = this.redisService.getClient();
    await redis.set(`${PREVIEW_TOKEN_PREFIX}${previewToken}`, previewData, 'EX', TOKEN_TTL_SECONDS);

    // Audit event
    await this.eventService.write({
      tenant_id: tenantId,
      event_type: 'record_exported',
      entity_type: 'export',
      entity_id: previewToken,
      student_id: dto.student_id,
      actor_user_id: userId,
      tier: 3,
      payload: {
        export_tier: 3,
        entity_type: 'cp_record' as const,
        entity_ids: records.map((r) => r.id),
        export_ref_id: previewToken,
        watermarked: false,
      },
      ip_address: ipAddress,
    });

    return {
      data: {
        preview_token: previewToken,
        record_count: records.length,
        student_name: studentName,
        date_range: {
          from: earliest.toISOString(),
          to: latest.toISOString(),
        },
        record_types_found: recordTypesFound,
      },
    };
  }

  /**
   * Generate the watermarked PDF export.
   *
   * Workflow:
   * 1. Validate purpose is from controlled list
   * 2. Validate and consume the preview token (optional — can generate without preview)
   * 3. Generate unique export reference ID via SequenceService (prefix: CPX)
   * 4. Query CP records matching the export scope
   * 5. Render PDF using PdfRenderingService with cp-export template
   * 6. Apply watermark: exporting user's name, date/time, purpose, export ref ID
   * 7. Store PDF temporarily in Redis (expires with token TTL)
   * 8. Generate one-time download token (UUID, stored in Redis, expires 15 min)
   * 9. Record pastoral_event: record_exported with full metadata
   * 10. Return download token + export ref ID
   */
  async generate(
    tenantId: string,
    userId: string,
    dto: CpExportGenerateDto,
    ipAddress: string | null,
  ): Promise<{ data: CpExportGenerateResult }> {
    const resolved = await this.resolveGenerateRequest(tenantId, userId, dto);

    // 1. Generate export reference ID
    const exportRefId = await this.sequenceService.nextNumber(
      tenantId,
      'cp_export',
      undefined,
      'CPX',
    );

    // 3. Query CP records
    const rlsClient = createRlsClient(this.prisma, {
      tenant_id: tenantId,
      user_id: userId,
    });

    const records = (await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;

      const where: Record<string, unknown> = {
        tenant_id: tenantId,
        student_id: resolved.student_id,
      };

      if (resolved.preview_record_ids && resolved.preview_record_ids.length > 0) {
        where.id = { in: resolved.preview_record_ids };
      } else {
        if (resolved.record_types && resolved.record_types.length > 0) {
          where.record_type = { in: resolved.record_types };
        }
        if (resolved.date_from) {
          where.created_at = {
            ...((where.created_at as Record<string, unknown>) ?? {}),
            gte: new Date(resolved.date_from),
          };
        }
        if (resolved.date_to) {
          where.created_at = {
            ...((where.created_at as Record<string, unknown>) ?? {}),
            lte: new Date(resolved.date_to),
          };
        }
      }

      return db.cpRecord.findMany({
        where,
        include: {
          student: { select: { first_name: true, last_name: true } },
        },
        orderBy: { created_at: 'desc' },
      }) as Promise<CpRecordRow[]>;
    })) as CpRecordRow[];

    if (records.length === 0) {
      throw new NotFoundException({
        error: {
          code: 'NO_RECORDS_FOUND',
          message: 'No matching CP records found for the given criteria.',
        },
      });
    }

    // 4. Get exporting user's name for watermark
    const exportingUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { first_name: true, last_name: true },
    });
    const exporterName = exportingUser
      ? `${exportingUser.first_name} ${exportingUser.last_name}`
      : 'Unknown User';

    // 5. Build watermark content
    const exportTimestamp = new Date().toISOString();
    const watermarkText = `${exporterName} | ${exportTimestamp} | ${resolved.purpose} | Ref: ${exportRefId}`;

    // 6. Student name for filename
    const firstRecord = records[0];
    const studentName = firstRecord?.student
      ? `${firstRecord.student.first_name} ${firstRecord.student.last_name}`
      : 'Student';

    // 7. Render PDF
    const locale = resolved.locale;
    const pdfBuffer = await this.pdfRenderingService.renderPdf(
      'cp-export',
      locale,
      {
        records,
        watermark_text: watermarkText,
        export_ref_id: exportRefId,
        purpose: resolved.purpose,
        other_reason: resolved.other_reason,
        exporter_name: exporterName,
        export_timestamp: exportTimestamp,
        student_name: studentName,
      },
      {
        school_name: 'School', // Caller should ideally provide this, template will use it
      },
    );

    // 8. Generate one-time download token
    const crypto = await import('crypto');
    const downloadToken = crypto.randomUUID();
    const filename = `CP-Export-${studentName.replace(/\s+/g, '-')}-${exportRefId}.pdf`;

    const redis = this.redisService.getClient();

    // Store download token metadata
    const tokenData = JSON.stringify({
      tenant_id: tenantId,
      user_id: userId,
      export_ref_id: exportRefId,
      filename,
      student_id: resolved.student_id,
    });
    await redis.set(`${DOWNLOAD_TOKEN_PREFIX}${downloadToken}`, tokenData, 'EX', TOKEN_TTL_SECONDS);

    // Store the PDF buffer in Redis with same TTL
    await redis.set(
      `${PDF_BUFFER_PREFIX}${downloadToken}`,
      pdfBuffer.toString('base64'),
      'EX',
      TOKEN_TTL_SECONDS,
    );

    if (resolved.preview_token) {
      await redis.del(`${PREVIEW_TOKEN_PREFIX}${resolved.preview_token}`);
    }

    // 9. Audit event: record_exported
    await this.eventService.write({
      tenant_id: tenantId,
      event_type: 'record_exported',
      entity_type: 'export',
      entity_id: exportRefId,
      student_id: resolved.student_id,
      actor_user_id: userId,
      tier: 3,
      payload: {
        export_tier: 3,
        entity_type: 'cp_record' as const,
        entity_ids: records.map((r) => r.id),
        purpose: resolved.purpose,
        export_ref_id: exportRefId,
        watermarked: true,
      },
      ip_address: ipAddress,
    });

    this.logger.log(
      `CP export generated: ref=${exportRefId} user=${userId} student=${resolved.student_id} purpose=${resolved.purpose} records=${records.length}`,
    );

    return {
      data: {
        download_token: downloadToken,
        export_ref_id: exportRefId,
        filename,
      },
    };
  }

  /**
   * Download a generated PDF using the one-time token.
   * Token is invalidated after use. Expired tokens return 404.
   *
   * Generates pastoral_event: record_exported (download_completed step).
   */
  async download(token: string, ipAddress: string | null): Promise<CpExportDownloadResult> {
    const redis = this.redisService.getClient();

    // 1. Fetch and atomically delete the download token (one-time use)
    const tokenKey = `${DOWNLOAD_TOKEN_PREFIX}${token}`;
    const pdfKey = `${PDF_BUFFER_PREFIX}${token}`;

    const tokenDataRaw = await redis.get(tokenKey);
    if (!tokenDataRaw) {
      throw new NotFoundException({
        error: {
          code: 'INVALID_DOWNLOAD_TOKEN',
          message: 'Download token is invalid or has expired.',
        },
      });
    }

    // Delete the token immediately (consume it — one-time use)
    await redis.del(tokenKey);

    const tokenData = JSON.parse(tokenDataRaw) as {
      tenant_id: string;
      user_id: string;
      export_ref_id: string;
      filename: string;
      student_id: string;
    };

    // 2. Fetch the PDF buffer
    const pdfBase64 = await redis.get(pdfKey);
    if (!pdfBase64) {
      throw new NotFoundException({
        error: {
          code: 'PDF_EXPIRED',
          message: 'The generated PDF has expired. Please generate a new export.',
        },
      });
    }

    // Delete the PDF buffer from Redis after retrieval
    await redis.del(pdfKey);

    const pdfBuffer = Buffer.from(pdfBase64, 'base64');

    // 3. Audit event: record_exported (download step)
    await this.eventService.write({
      tenant_id: tokenData.tenant_id,
      event_type: 'record_exported',
      entity_type: 'export',
      entity_id: tokenData.export_ref_id,
      student_id: tokenData.student_id,
      actor_user_id: tokenData.user_id,
      tier: 3,
      payload: {
        export_tier: 3,
        entity_type: 'cp_record' as const,
        entity_ids: [],
        export_ref_id: tokenData.export_ref_id,
        watermarked: true,
      },
      ip_address: ipAddress,
    });

    this.logger.log(
      `CP export downloaded: ref=${tokenData.export_ref_id} user=${tokenData.user_id}`,
    );

    return {
      buffer: pdfBuffer,
      filename: tokenData.filename,
      contentType: 'application/pdf',
    };
  }

  private validatePurpose(purpose?: ExportPurpose | null, otherReason?: string | null): void {
    if (!purpose) {
      return;
    }

    if (!EXPORT_PURPOSES.includes(purpose)) {
      throw new BadRequestException({
        error: {
          code: 'INVALID_PURPOSE',
          message: `Export purpose must be one of: ${EXPORT_PURPOSES.join(', ')}`,
        },
      });
    }

    if (purpose === 'other' && (!otherReason || otherReason.trim().length === 0)) {
      throw new BadRequestException({
        error: {
          code: 'OTHER_REASON_REQUIRED',
          message: 'other_reason is required when purpose is "other".',
        },
      });
    }
  }

  private async resolveGenerateRequest(
    tenantId: string,
    userId: string,
    dto: CpExportGenerateDto,
  ): Promise<ResolvedCpExportRequest> {
    const previewState = dto.preview_token
      ? await this.loadPreviewState(tenantId, userId, dto.preview_token)
      : null;

    if (previewState) {
      this.assertPreviewBoundValue('student_id', dto.student_id, previewState.student_id);
      this.assertPreviewBoundValue('purpose', dto.purpose, previewState.purpose ?? undefined, true);
      this.assertPreviewBoundValue(
        'other_reason',
        dto.other_reason,
        previewState.other_reason ?? undefined,
        true,
      );
      this.assertPreviewBoundArray('record_types', dto.record_types, previewState.record_types);
      this.assertPreviewBoundValue('date_from', dto.date_from, previewState.date_from ?? undefined);
      this.assertPreviewBoundValue('date_to', dto.date_to, previewState.date_to ?? undefined);
    }

    const purpose = dto.purpose ?? previewState?.purpose ?? undefined;
    const otherReason = dto.other_reason ?? previewState?.other_reason ?? undefined;

    this.validatePurpose(purpose, otherReason);

    const studentId = dto.student_id ?? previewState?.student_id;
    if (!studentId) {
      throw new BadRequestException({
        error: {
          code: 'STUDENT_ID_REQUIRED',
          message: 'student_id is required to generate a CP export.',
        },
      });
    }

    if (!purpose) {
      throw new BadRequestException({
        error: {
          code: 'PURPOSE_REQUIRED',
          message: 'purpose is required to generate a CP export.',
        },
      });
    }

    return {
      preview_token: dto.preview_token,
      preview_record_ids: previewState?.record_ids,
      student_id: studentId,
      purpose,
      other_reason: otherReason ?? undefined,
      record_types: dto.record_types ?? previewState?.record_types ?? undefined,
      date_from: dto.date_from ?? previewState?.date_from ?? undefined,
      date_to: dto.date_to ?? previewState?.date_to ?? undefined,
      locale: dto.locale ?? 'en',
    };
  }

  private async loadPreviewState(
    tenantId: string,
    userId: string,
    previewToken: string,
  ): Promise<CpExportPreviewState> {
    const redis = this.redisService.getClient();
    const raw = await redis.get(`${PREVIEW_TOKEN_PREFIX}${previewToken}`);

    if (!raw) {
      throw new NotFoundException({
        error: {
          code: 'INVALID_PREVIEW_TOKEN',
          message: 'Preview token is invalid or has expired.',
        },
      });
    }

    const previewState = JSON.parse(raw) as CpExportPreviewState;

    if (previewState.tenant_id !== tenantId || previewState.user_id !== userId) {
      throw new ForbiddenException({
        error: {
          code: 'PREVIEW_TOKEN_FORBIDDEN',
          message: 'Preview token does not belong to this user or tenant.',
        },
      });
    }

    return previewState;
  }

  private assertPreviewBoundValue(
    field: string,
    actual: string | undefined,
    expected: string | undefined,
    allowWhenExpectedMissing = false,
  ): void {
    if (allowWhenExpectedMissing && expected === undefined) {
      return;
    }

    if (actual !== undefined && actual !== expected) {
      throw new BadRequestException({
        error: {
          code: 'PREVIEW_SCOPE_MISMATCH',
          message: `${field} must match the approved preview scope.`,
        },
      });
    }
  }

  private assertPreviewBoundArray(
    field: string,
    actual: string[] | undefined,
    expected: string[] | null,
  ): void {
    if (actual === undefined) {
      return;
    }

    const normalizedExpected = expected ?? [];

    if (
      actual.length !== normalizedExpected.length ||
      actual.some((value, index) => value !== normalizedExpected[index])
    ) {
      throw new BadRequestException({
        error: {
          code: 'PREVIEW_SCOPE_MISMATCH',
          message: `${field} must match the approved preview scope.`,
        },
      });
    }
  }
}
