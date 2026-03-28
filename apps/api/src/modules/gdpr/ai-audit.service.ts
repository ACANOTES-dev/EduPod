import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

// ─── DTOs ─────────────────────────────────────────────────────────────────────

export interface CreateAiLogDto {
  tenantId: string;
  aiService: string;
  subjectType?: string | null;
  subjectId?: string | null;
  modelUsed: string;
  promptHash: string;
  promptSummary: string;
  responseSummary: string;
  inputDataCategories: string[];
  tokenised: boolean;
  tokenUsageLogId?: string | null;
  confidenceScore?: number | null;
  processingTimeMs: number;
}

export interface AiDecisionDto {
  outputUsed: boolean;
  acceptedByUserId?: string;
  acceptedAt?: Date;
  rejectedReason?: string | null;
}

export interface AiUsageStats {
  totalLogs: number;
  byService: Record<string, number>;
  acceptanceRate: number | null;
  avgProcessingTimeMs: number | null;
  tokenisationRate: number;
}

interface AiLogStatRow {
  ai_service: string;
  processing_time_ms: number | null;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class AiAuditService {
  private readonly logger = new Logger(AiAuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Log an AI processing event. Returns the log ID.
   * MUST NOT throw on failure — AI features must not break if audit logging fails.
   */
  async log(entry: CreateAiLogDto): Promise<string> {
    try {
      const rlsClient = createRlsClient(this.prisma, {
        tenant_id: entry.tenantId,
      });

      const result = await rlsClient.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        return db.aiProcessingLog.create({
          data: {
            tenant_id: entry.tenantId,
            ai_service: entry.aiService,
            subject_type: entry.subjectType ?? null,
            subject_id: entry.subjectId ?? null,
            model_used: entry.modelUsed,
            prompt_hash: entry.promptHash,
            prompt_summary: entry.promptSummary,
            response_summary: entry.responseSummary,
            input_data_categories: entry.inputDataCategories,
            tokenised: entry.tokenised,
            token_usage_log_id: entry.tokenUsageLogId ?? null,
            confidence_score: entry.confidenceScore ?? null,
            processing_time_ms: entry.processingTimeMs,
          },
          select: { id: true },
        });
      });

      const created = result as { id: string };
      return created.id;
    } catch (error) {
      this.logger.error(
        `[log] Failed to write AI audit log for service="${entry.aiService}"`,
        error instanceof Error ? error.stack : String(error),
      );
      return '';
    }
  }

  /**
   * Update a log with the human review decision (accept/reject).
   * Used when a teacher accepts or rejects an AI suggestion.
   */
  async recordDecision(
    tenantId: string,
    logId: string,
    decision: AiDecisionDto,
  ): Promise<void> {
    const existing = await this.prisma.aiProcessingLog.findFirst({
      where: { id: logId, tenant_id: tenantId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException({
        code: 'AI_LOG_NOT_FOUND',
        message: `AI processing log "${logId}" not found`,
      });
    }

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });
    await rlsClient.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.aiProcessingLog.update({
        where: { id: logId },
        data: {
          output_used: decision.outputUsed,
          accepted_by_user_id: decision.acceptedByUserId ?? null,
          accepted_at: decision.acceptedAt ?? null,
          rejected_reason: decision.rejectedReason ?? null,
        },
      });
    });
  }

  /**
   * Get a single AI processing log by ID.
   * Used by the Article 22 right-to-explanation endpoint.
   */
  async getLogById(tenantId: string, logId: string) {
    return this.prisma.aiProcessingLog.findFirst({
      where: { id: logId, tenant_id: tenantId },
    });
  }

  /**
   * Get AI log history for a specific subject (student/staff).
   */
  async getLogsForSubject(
    tenantId: string,
    subjectType: string,
    subjectId: string,
    page: number,
    pageSize: number,
  ) {
    const [data, total] = await Promise.all([
      this.prisma.aiProcessingLog.findMany({
        where: {
          tenant_id: tenantId,
          subject_type: subjectType,
          subject_id: subjectId,
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aiProcessingLog.count({
        where: {
          tenant_id: tenantId,
          subject_type: subjectType,
          subject_id: subjectId,
        },
      }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  /**
   * Get logs filtered by AI service type.
   */
  async getLogsByService(
    tenantId: string,
    service: string,
    page: number,
    pageSize: number,
  ) {
    const [data, total] = await Promise.all([
      this.prisma.aiProcessingLog.findMany({
        where: {
          tenant_id: tenantId,
          ai_service: service,
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aiProcessingLog.count({
        where: {
          tenant_id: tenantId,
          ai_service: service,
        },
      }),
    ]);

    return { data, meta: { page, pageSize, total } };
  }

  /**
   * Aggregate statistics for AI usage.
   * Used for DPIA evidence (Article 35) and transparency dashboards.
   */
  async getStats(
    tenantId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<AiUsageStats> {
    const dateFilter: { created_at?: { gte?: Date; lte?: Date } } = {};
    if (dateFrom || dateTo) {
      dateFilter.created_at = {};
      if (dateFrom) dateFilter.created_at.gte = new Date(dateFrom);
      if (dateTo) dateFilter.created_at.lte = new Date(dateTo);
    }

    const baseWhere = { tenant_id: tenantId, ...dateFilter };

    const [totalLogs, allLogs, decisioned, accepted, tokenised]: [
      number,
      AiLogStatRow[],
      number,
      number,
      number,
    ] = await Promise.all([
        // Total count
        this.prisma.aiProcessingLog.count({ where: baseWhere }),

        // All logs for per-service aggregation and average processing time
        this.prisma.aiProcessingLog.findMany({
          where: baseWhere,
          select: {
            ai_service: true,
            processing_time_ms: true,
          },
        }),

        // Count of logs where output_used is not null (a decision was made)
        this.prisma.aiProcessingLog.count({
          where: { ...baseWhere, output_used: { not: null } },
        }),

        // Count of accepted (output_used = true)
        this.prisma.aiProcessingLog.count({
          where: { ...baseWhere, output_used: true },
        }),

        // Count of tokenised logs
        this.prisma.aiProcessingLog.count({
          where: { ...baseWhere, tokenised: true },
        }),
      ]);

    // Build per-service counts
    const byService: Record<string, number> = {};
    for (const log of allLogs) {
      byService[log.ai_service] = (byService[log.ai_service] ?? 0) + 1;
    }

    // Average processing time
    const timings = allLogs
      .map((l) => l.processing_time_ms)
      .filter((t): t is number => t !== null);
    const avgProcessingTimeMs =
      timings.length > 0
        ? Math.round(timings.reduce((a, b) => a + b, 0) / timings.length)
        : null;

    // Acceptance rate: accepted / decisioned
    const acceptanceRate = decisioned > 0 ? accepted / decisioned : null;

    // Tokenisation rate: tokenised / total
    const tokenisationRate = totalLogs > 0 ? tokenised / totalLogs : 0;

    return {
      totalLogs,
      byService,
      acceptanceRate,
      avgProcessingTimeMs,
      tokenisationRate,
    };
  }
}
