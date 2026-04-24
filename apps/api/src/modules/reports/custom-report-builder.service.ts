import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { CreateSavedReportDto, UpdateSavedReportDto } from '@school/shared';
import { reportSubjectKeySchema } from '@school/shared/reports';
import type {
  ColumnSpec,
  FilterGroup,
  QueryExecutionResult,
  SavedReportQuery,
  SortSpec,
} from '@school/shared/reports';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { QueryEngineService } from './query-engine/query-engine.service';
import { ReportsDataAccessService } from './reports-data-access.service';

export interface SavedReportRow {
  id: string;
  name: string;
  data_source: string;
  dimensions_json: unknown;
  measures_json: unknown;
  filters_json: unknown;
  chart_type: string | null;
  is_shared: boolean;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
}

@Injectable()
export class CustomReportBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    // Retained on the constructor so the legacy cross-module reads proxy
    // is still wired. The new query-engine path does not call it.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    private readonly dataAccess: ReportsDataAccessService,
    private readonly queryEngine: QueryEngineService,
  ) {}

  async listSavedReports(
    tenantId: string,
    userId: string,
    includeShared: boolean,
    page: number,
    pageSize: number,
  ): Promise<{ data: SavedReportRow[]; meta: { page: number; pageSize: number; total: number } }> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const where: Record<string, unknown> = {
        tenant_id: tenantId,
      };

      if (!includeShared) {
        where.OR = [{ created_by_user_id: userId }, { is_shared: true }];
      }

      const skip = (page - 1) * pageSize;

      const [reports, total] = await Promise.all([
        txClient.savedReport.findMany({
          where,
          orderBy: { updated_at: 'desc' },
          skip,
          take: pageSize,
        }),
        txClient.savedReport.count({ where }),
      ]);

      return {
        data: reports.map((r) => ({
          id: r.id,
          name: r.name,
          data_source: r.data_source,
          dimensions_json: r.dimensions_json,
          measures_json: r.measures_json,
          filters_json: r.filters_json,
          chart_type: r.chart_type,
          is_shared: r.is_shared,
          created_by_user_id: r.created_by_user_id,
          created_at: r.created_at.toISOString(),
          updated_at: r.updated_at.toISOString(),
        })),
        meta: { page, pageSize, total },
      };
    }) as unknown as {
      data: SavedReportRow[];
      meta: { page: number; pageSize: number; total: number };
    };
  }

  async getSavedReport(tenantId: string, reportId: string): Promise<SavedReportRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const report = await txClient.savedReport.findFirst({
        where: { id: reportId, tenant_id: tenantId },
      });

      if (!report) {
        throw new NotFoundException({
          code: 'SAVED_REPORT_NOT_FOUND',
          message: `Saved report with id "${reportId}" not found`,
        });
      }

      return {
        id: report.id,
        name: report.name,
        data_source: report.data_source,
        dimensions_json: report.dimensions_json,
        measures_json: report.measures_json,
        filters_json: report.filters_json,
        chart_type: report.chart_type,
        is_shared: report.is_shared,
        created_by_user_id: report.created_by_user_id,
        created_at: report.created_at.toISOString(),
        updated_at: report.updated_at.toISOString(),
      };
    }) as unknown as SavedReportRow;
  }

  async createSavedReport(
    tenantId: string,
    userId: string,
    dto: CreateSavedReportDto,
  ): Promise<SavedReportRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      // Check for name uniqueness
      const existing = await txClient.savedReport.findFirst({
        where: { tenant_id: tenantId, name: dto.name },
      });

      if (existing) {
        throw new BadRequestException({
          code: 'SAVED_REPORT_NAME_TAKEN',
          message: `A saved report named "${dto.name}" already exists`,
        });
      }

      const report = await txClient.savedReport.create({
        data: {
          tenant_id: tenantId,
          name: dto.name,
          data_source: dto.data_source,
          dimensions_json: dto.dimensions_json as Prisma.InputJsonValue,
          measures_json: dto.measures_json as Prisma.InputJsonValue,
          filters_json: (dto.filters_json ?? {}) as Prisma.InputJsonValue,
          chart_type: dto.chart_type ?? null,
          is_shared: dto.is_shared ?? false,
          created_by_user_id: userId,
        },
      });

      return {
        id: report.id,
        name: report.name,
        data_source: report.data_source,
        dimensions_json: report.dimensions_json,
        measures_json: report.measures_json,
        filters_json: report.filters_json,
        chart_type: report.chart_type,
        is_shared: report.is_shared,
        created_by_user_id: report.created_by_user_id,
        created_at: report.created_at.toISOString(),
        updated_at: report.updated_at.toISOString(),
      };
    }) as unknown as SavedReportRow;
  }

  async updateSavedReport(
    tenantId: string,
    reportId: string,
    dto: UpdateSavedReportDto,
  ): Promise<SavedReportRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const existing = await txClient.savedReport.findFirst({
        where: { id: reportId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'SAVED_REPORT_NOT_FOUND',
          message: `Saved report with id "${reportId}" not found`,
        });
      }

      // Check name uniqueness if name changed
      if (dto.name && dto.name !== existing.name) {
        const nameConflict = await txClient.savedReport.findFirst({
          where: { tenant_id: tenantId, name: dto.name },
        });
        if (nameConflict) {
          throw new BadRequestException({
            code: 'SAVED_REPORT_NAME_TAKEN',
            message: `A saved report named "${dto.name}" already exists`,
          });
        }
      }

      const updated = await txClient.savedReport.update({
        where: { id: reportId },
        data: {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.data_source !== undefined && { data_source: dto.data_source }),
          ...(dto.dimensions_json !== undefined && {
            dimensions_json: dto.dimensions_json as Prisma.InputJsonValue,
          }),
          ...(dto.measures_json !== undefined && {
            measures_json: dto.measures_json as Prisma.InputJsonValue,
          }),
          ...(dto.filters_json !== undefined && {
            filters_json: dto.filters_json as Prisma.InputJsonValue,
          }),
          ...(dto.chart_type !== undefined && { chart_type: dto.chart_type }),
          ...(dto.is_shared !== undefined && { is_shared: dto.is_shared }),
        },
      });

      return {
        id: updated.id,
        name: updated.name,
        data_source: updated.data_source,
        dimensions_json: updated.dimensions_json,
        measures_json: updated.measures_json,
        filters_json: updated.filters_json,
        chart_type: updated.chart_type,
        is_shared: updated.is_shared,
        created_by_user_id: updated.created_by_user_id,
        created_at: updated.created_at.toISOString(),
        updated_at: updated.updated_at.toISOString(),
      };
    }) as unknown as SavedReportRow;
  }

  async deleteSavedReport(tenantId: string, reportId: string): Promise<void> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaService;

      const existing = await txClient.savedReport.findFirst({
        where: { id: reportId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'SAVED_REPORT_NOT_FOUND',
          message: `Saved report with id "${reportId}" not found`,
        });
      }

      await txClient.savedReport.delete({ where: { id: reportId } });
    });
  }

  // ─── Execute a saved report ───────────────────────────────────────────────

  /**
   * Execute a saved report. Routes through the subject registry + query
   * engine so every query respects RLS, per-field permission scoping, a
   * 50 000-row cap, and a 30-second timeout budget.
   *
   * Legacy reports (where `data_source` is a pre-rebuild enum like
   * `students`/`staff`/`admissions`) are rejected with
   * `REPORT_LEGACY_FORMAT`. Wave 4's saved-report management UI will
   * offer a migration path; we intentionally do not emulate the old
   * stub executor because it produced incomplete results — the root
   * cause of this rebuild.
   */
  async executeReport(
    tenantId: string,
    userId: string,
    permissions: string[],
    reportId: string,
    page: number,
    pageSize: number,
  ): Promise<QueryExecutionResult> {
    const report = await this.getSavedReport(tenantId, reportId);
    const query = deserialiseQuery(report);
    return this.queryEngine.execute(tenantId, userId, permissions, query, { page, pageSize });
  }
}

// ─── Legacy → new query deserialiser ────────────────────────────────────────

/**
 * Re-hydrate the persisted columns/filters/group-by into a
 * `SavedReportQuery`. New builder saves encode the entire query under
 * `dimensions_json` (columns), `measures_json` (group-by + sort), and
 * `filters_json` (filter tree).
 *
 * Legacy saves (pre-rebuild `data_source`: 'students' | 'staff' |
 * 'admissions' | 'attendance' | 'grades' | 'finance') are rejected with
 * `REPORT_LEGACY_FORMAT`. Wave 4's saved-report management UI will
 * offer a migration path; we intentionally do not emulate the old stub
 * executor because it produced incomplete results — the motivator for
 * this rebuild.
 */
export function deserialiseQuery(report: SavedReportRow): SavedReportQuery {
  const subjectCandidate = reportSubjectKeySchema.safeParse(report.data_source);
  if (!subjectCandidate.success) {
    throw new BadRequestException({
      code: 'REPORT_LEGACY_FORMAT',
      message: `Saved report "${report.name}" was created under the legacy schema. Open it in the builder to migrate.`,
    });
  }

  const dims = report.dimensions_json;
  if (!Array.isArray(dims) || dims.length === 0) {
    throw new BadRequestException({
      code: 'REPORT_INVALID_STATE',
      message: `Saved report "${report.name}" has no columns selected.`,
    });
  }

  // Accept two shapes: a plain string[] of field ids (no aggregations),
  // and a `ColumnSpec[]` with optional aggregations. The former is what
  // early builder saves produce before group-by support lands.
  const columns: ColumnSpec[] = dims.map((entry) => {
    if (typeof entry === 'string') {
      return { field_id: entry };
    }
    if (entry && typeof entry === 'object' && 'field_id' in entry) {
      const e = entry as { field_id: string; aggregation?: ColumnSpec['aggregation'] };
      return { field_id: e.field_id, ...(e.aggregation ? { aggregation: e.aggregation } : {}) };
    }
    throw new BadRequestException({
      code: 'REPORT_INVALID_STATE',
      message: `Saved report "${report.name}" has an unrecognised column shape.`,
    });
  });

  const measures = report.measures_json;
  const sort: SortSpec[] = [];
  let group_by: SavedReportQuery['group_by'];

  if (measures && typeof measures === 'object' && !Array.isArray(measures)) {
    const m = measures as {
      sort?: Array<{ field_id: string; direction: 'asc' | 'desc' }>;
      group_by?: Array<{ field_id: string }>;
    };
    if (Array.isArray(m.sort)) sort.push(...m.sort);
    if (Array.isArray(m.group_by)) group_by = m.group_by;
  }

  // Filters: accept a FilterGroup. The legacy record-shape filter blob
  // cannot be faithfully round-tripped into the new operator model, so
  // we ignore it — the builder UI will prompt the author to re-specify
  // filters on migration.
  let filters: FilterGroup | undefined;
  const rawFilters = report.filters_json;
  if (rawFilters && typeof rawFilters === 'object' && 'combinator' in rawFilters) {
    filters = rawFilters as FilterGroup;
  }

  return {
    subject: subjectCandidate.data,
    columns,
    filters,
    group_by,
    sort: sort.length > 0 ? sort : undefined,
  };
}
