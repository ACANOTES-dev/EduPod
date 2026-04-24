import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import type { SavedReportDraftDto, UpsertSavedReportDraftDto } from '@school/shared/reports';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * `SavedReportDraft` is the autosave surface for the custom report
 * builder. At most one draft exists per (tenant_id, user_id) — the
 * schema enforces this via a unique composite index. The UI debounces
 * `PUT /v1/reports/builder/draft` on every change and calls DELETE on
 * formal save.
 *
 * Writes flow through an interactive `createRlsClient` transaction so
 * the row is subject to the same `saved_report_drafts_tenant_isolation`
 * policy applied in Impl 01's schema foundation. Reads go through the
 * same transaction for symmetry with write-path RLS.
 */
@Injectable()
export class SavedReportDraftService {
  constructor(private readonly prisma: PrismaService) {}

  async get(tenantId: string, userId: string): Promise<SavedReportDraftDto | null> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });

    return (await rlsClient.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const row = await txClient.savedReportDraft.findUnique({
        where: { tenant_id_user_id: { tenant_id: tenantId, user_id: userId } },
      });

      if (!row) return null;
      return toDto(row);
    })) as SavedReportDraftDto | null;
  }

  async upsert(
    tenantId: string,
    userId: string,
    dto: UpsertSavedReportDraftDto,
  ): Promise<SavedReportDraftDto> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });

    return (await rlsClient.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const row = await txClient.savedReportDraft.upsert({
        where: { tenant_id_user_id: { tenant_id: tenantId, user_id: userId } },
        create: {
          tenant_id: tenantId,
          user_id: userId,
          subject_key: dto.subject_key,
          columns_json: dto.columns_json as unknown as Prisma.InputJsonValue,
          filters_json: dto.filters_json as unknown as Prisma.InputJsonValue,
          group_by_json: dto.group_by_json
            ? (dto.group_by_json as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          chart_type: dto.chart_type ?? null,
          chart_config_json: dto.chart_config_json
            ? (dto.chart_config_json as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
        update: {
          subject_key: dto.subject_key,
          columns_json: dto.columns_json as unknown as Prisma.InputJsonValue,
          filters_json: dto.filters_json as unknown as Prisma.InputJsonValue,
          group_by_json: dto.group_by_json
            ? (dto.group_by_json as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
          chart_type: dto.chart_type ?? null,
          chart_config_json: dto.chart_config_json
            ? (dto.chart_config_json as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
        },
      });

      return toDto(row);
    })) as SavedReportDraftDto;
  }

  async clear(tenantId: string, userId: string): Promise<void> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });

    await rlsClient.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      await txClient.savedReportDraft.deleteMany({
        where: { tenant_id: tenantId, user_id: userId },
      });
    });
  }
}

// ─── Internals ───────────────────────────────────────────────────────────────

type DraftRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  subject_key: string;
  columns_json: unknown;
  filters_json: unknown;
  group_by_json: unknown;
  chart_type: string | null;
  chart_config_json: unknown;
  updated_at: Date;
};

function toDto(row: DraftRow): SavedReportDraftDto {
  // The shared Zod schemas parse these JSON blobs on the read side. The
  // service layer does not re-validate — Wave 4 frontend calls the
  // builder UI's own Zod schemas against the response.
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    user_id: row.user_id,
    subject_key: row.subject_key as SavedReportDraftDto['subject_key'],
    columns_json: row.columns_json as SavedReportDraftDto['columns_json'],
    filters_json: row.filters_json as SavedReportDraftDto['filters_json'],
    group_by_json: row.group_by_json as SavedReportDraftDto['group_by_json'],
    chart_type: row.chart_type as SavedReportDraftDto['chart_type'],
    chart_config_json: row.chart_config_json as SavedReportDraftDto['chart_config_json'],
    updated_at: row.updated_at.toISOString(),
  };
}
