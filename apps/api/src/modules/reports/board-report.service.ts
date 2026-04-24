import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

import type { CreateBoardReportDto } from '@school/shared';
import {
  BOARD_REPORT_SECTION_KEYS,
  type BoardReport,
  type BoardReportHistoryEntry,
  type BoardReportHistoryResponse,
  type BoardReportRequest,
  type BoardReportSectionKey,
} from '@school/shared/reports';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import {
  AcademicSectionAggregator,
  AttendanceSectionAggregator,
  BehaviourSectionAggregator,
  EnrolmentSectionAggregator,
  ExecutiveSummarySectionAggregator,
  FinanceSectionAggregator,
  SafeguardingSectionAggregator,
  StaffingSectionAggregator,
} from './board-report/sections';
import type {
  PrismaTransaction,
  ResolvedTerm,
  SectionAggregatorOptions,
} from './board-report/sections/section-aggregator.types';

// ─── Legacy row shape (kept for backwards compat with existing callers) ───

export interface BoardReportRow {
  id: string;
  title: string;
  academic_period_id: string | null;
  report_type: string;
  sections_json: unknown;
  generated_at: string;
  generated_by_user_id: string;
  file_url: string | null;
  created_at: string;
}

/**
 * BoardReportService — impl 06 rewrite.
 *
 * Legacy CRUD surface (`listBoardReports` / `getBoardReport` /
 * `generateBoardReport` / `deleteBoardReport`) is preserved unchanged so
 * the existing Wave 4 frontend routes that call them keep working.
 *
 * The new `generate()` method is the Wave 4 / export-pipeline entry
 * point: it resolves the term, opens ONE `createRlsClient.$transaction`,
 * dispatches to each requested section's aggregator inside that
 * transaction, then persists a `BoardReport` row and returns the
 * assembled `BoardReport` envelope.
 *
 * `listHistory()` feeds `GET /v1/reports/board/history` with the
 * lightweight metadata a settings UI needs to let an admin re-download
 * a prior packet.
 */
@Injectable()
export class BoardReportService {
  private readonly logger = new Logger(BoardReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly executiveSummarySection: ExecutiveSummarySectionAggregator,
    private readonly enrolmentSection: EnrolmentSectionAggregator,
    private readonly attendanceSection: AttendanceSectionAggregator,
    private readonly academicSection: AcademicSectionAggregator,
    private readonly behaviourSection: BehaviourSectionAggregator,
    private readonly safeguardingSection: SafeguardingSectionAggregator,
    private readonly financeSection: FinanceSectionAggregator,
    private readonly staffingSection: StaffingSectionAggregator,
  ) {}

  // ─── New-style API (Wave 4 + export pipeline) ──────────────────────────

  async generate(
    tenantId: string,
    userId: string,
    request: BoardReportRequest,
  ): Promise<BoardReport> {
    const sectionsRequested = this.dedupeSections(request.sections);
    const options: SectionAggregatorOptions = { anonymise: request.anonymise };

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const result = (await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaTransaction;
      const term = await this.resolveTerm(txClient, tenantId, request.term);
      const tenantMeta = await this.resolveTenantMeta(txClient, tenantId);

      const sections = await this.runAggregators(
        txClient,
        tenantId,
        term,
        options,
        sectionsRequested,
      );

      const generatedAt = new Date();

      const persistedTitle = this.deriveTitle(tenantMeta.name, term);
      const persistedSectionsPayload = this.buildPersistedPayload({
        term,
        sectionsIncluded: sectionsRequested,
        anonymise: request.anonymise,
        sections,
      });

      await (
        txClient.boardReport as unknown as {
          create: (args: {
            data: Prisma.BoardReportUncheckedCreateInput;
          }) => Promise<{ id: string }>;
        }
      ).create({
        data: {
          tenant_id: tenantId,
          title: persistedTitle,
          academic_period_id: term.academic_period_id ?? null,
          report_type: 'termly',
          sections_json: persistedSectionsPayload,
          generated_at: generatedAt,
          generated_by_user_id: userId,
          file_url: null,
        },
      });

      return {
        tenant: {
          tenant_id: tenantId,
          name: tenantMeta.name,
          academic_year_id: term.academic_year_id,
          academic_year_name: term.academic_year_name,
          term_number: term.term_number,
          term_label: term.term_label,
        },
        generated_at: generatedAt.toISOString(),
        generated_by_user_id: userId,
        anonymise: request.anonymise,
        sections_included: sectionsRequested,
        sections,
      } satisfies BoardReport;
    })) as BoardReport;

    return result;
  }

  async listHistory(
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<BoardReportHistoryResponse> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaTransaction;
      const skip = (page - 1) * pageSize;

      const [rows, total] = await Promise.all([
        txClient.boardReport.findMany({
          where: { tenant_id: tenantId },
          orderBy: { generated_at: 'desc' },
          skip,
          take: pageSize,
          select: {
            id: true,
            academic_period_id: true,
            period: {
              select: {
                academic_year_id: true,
                name: true,
                academic_year: { select: { id: true, name: true } },
              },
            },
            sections_json: true,
            generated_at: true,
            generated_by_user_id: true,
            generated_by: {
              select: {
                first_name: true,
                last_name: true,
                email: true,
              },
            },
          },
        }),
        txClient.boardReport.count({ where: { tenant_id: tenantId } }),
      ]);

      const data: BoardReportHistoryEntry[] = rows.map((r) => {
        const sections_included = this.extractSectionsIncluded(r.sections_json);
        const anonymise = this.extractAnonymiseFlag(r.sections_json);
        const generated_by_display_name = r.generated_by
          ? [r.generated_by.first_name, r.generated_by.last_name]
              .filter((s): s is string => Boolean(s && s.trim()))
              .join(' ') || r.generated_by.email
          : null;

        return {
          id: r.id,
          academic_year_id: r.period?.academic_year_id ?? null,
          academic_year_name: r.period?.academic_year?.name ?? null,
          term_label: r.period?.name ?? 'Custom term',
          sections_included,
          anonymise,
          generated_at: r.generated_at.toISOString(),
          generated_by_user_id: r.generated_by_user_id,
          generated_by_display_name,
        };
      });

      return { data, meta: { page, pageSize, total } };
    })) as BoardReportHistoryResponse;
  }

  // ─── Legacy CRUD (kept for backwards compat) ───────────────────────────

  async listBoardReports(
    tenantId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: BoardReportRow[]; meta: { page: number; pageSize: number; total: number } }> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaTransaction;
      const skip = (page - 1) * pageSize;

      const [reports, total] = await Promise.all([
        txClient.boardReport.findMany({
          where: { tenant_id: tenantId },
          orderBy: { generated_at: 'desc' },
          skip,
          take: pageSize,
        }),
        txClient.boardReport.count({ where: { tenant_id: tenantId } }),
      ]);

      return {
        data: reports.map((r) => this.toRow(r)),
        meta: { page, pageSize, total },
      };
    })) as { data: BoardReportRow[]; meta: { page: number; pageSize: number; total: number } };
  }

  async getBoardReport(tenantId: string, reportId: string): Promise<BoardReportRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    return (await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaTransaction;

      const report = await txClient.boardReport.findFirst({
        where: { id: reportId, tenant_id: tenantId },
      });

      if (!report) {
        throw new NotFoundException({
          code: 'BOARD_REPORT_NOT_FOUND',
          message: `Board report with id "${reportId}" not found`,
        });
      }

      return this.toRow(report);
    })) as BoardReportRow;
  }

  /**
   * Legacy generate path. The Wave 4 UI (impl 20) will migrate to
   * `generate()`; until then this keeps the existing `POST /v1/reports/board`
   * surface intact with the legacy `{ title, academic_period_id,
   * report_type, sections_json }` body shape.
   */
  async generateBoardReport(
    tenantId: string,
    userId: string,
    dto: CreateBoardReportDto,
  ): Promise<BoardReportRow> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });
    const sectionsPayload = dto.sections_json as unknown as Prisma.InputJsonValue;

    const report = (await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaTransaction;

      return (
        txClient.boardReport as unknown as {
          create: (args: { data: Prisma.BoardReportUncheckedCreateInput }) => Promise<{
            id: string;
            title: string;
            academic_period_id: string | null;
            report_type: string;
            sections_json: unknown;
            generated_at: Date;
            generated_by_user_id: string;
            file_url: string | null;
            created_at: Date;
          }>;
        }
      ).create({
        data: {
          tenant_id: tenantId,
          title: dto.title,
          academic_period_id: dto.academic_period_id ?? null,
          report_type: dto.report_type,
          sections_json: sectionsPayload,
          generated_at: new Date(),
          generated_by_user_id: userId,
          file_url: null,
        },
      });
    })) as {
      id: string;
      title: string;
      academic_period_id: string | null;
      report_type: string;
      sections_json: unknown;
      generated_at: Date;
      generated_by_user_id: string;
      file_url: string | null;
      created_at: Date;
    };

    return this.toRow(report);
  }

  async deleteBoardReport(tenantId: string, reportId: string): Promise<void> {
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    await prismaWithRls.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaTransaction;

      const existing = await txClient.boardReport.findFirst({
        where: { id: reportId, tenant_id: tenantId },
      });

      if (!existing) {
        throw new NotFoundException({
          code: 'BOARD_REPORT_NOT_FOUND',
          message: `Board report with id "${reportId}" not found`,
        });
      }

      await txClient.boardReport.delete({ where: { id: reportId } });
    });
  }

  // ─── Internals ─────────────────────────────────────────────────────────

  private dedupeSections(requested: ReadonlyArray<BoardReportSectionKey>): BoardReportSectionKey[] {
    const seen = new Set<BoardReportSectionKey>();
    const ordered: BoardReportSectionKey[] = [];
    for (const key of requested) {
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    }
    // Preserve canonical ordering when the caller passed the default full set.
    if (ordered.length === BOARD_REPORT_SECTION_KEYS.length) {
      return [...BOARD_REPORT_SECTION_KEYS];
    }
    return ordered;
  }

  private async runAggregators(
    tx: PrismaTransaction,
    tenantId: string,
    term: ResolvedTerm,
    options: SectionAggregatorOptions,
    sectionsRequested: ReadonlyArray<BoardReportSectionKey>,
  ): Promise<BoardReport['sections']> {
    const sections: BoardReport['sections'] = {};
    const wants = new Set<BoardReportSectionKey>(sectionsRequested);

    // Run all requested aggregators concurrently — they each only read
    // via `tx`, so Prisma's serialisable isolation keeps the view
    // consistent.
    const tasks: Promise<void>[] = [];

    if (wants.has('executive')) {
      tasks.push(
        this.executiveSummarySection.aggregate(tx, tenantId, term, options).then((r) => {
          sections.executive = r;
        }),
      );
    }
    if (wants.has('enrolment')) {
      tasks.push(
        this.enrolmentSection.aggregate(tx, tenantId, term, options).then((r) => {
          sections.enrolment = r;
        }),
      );
    }
    if (wants.has('attendance')) {
      tasks.push(
        this.attendanceSection.aggregate(tx, tenantId, term, options).then((r) => {
          sections.attendance = r;
        }),
      );
    }
    if (wants.has('academic')) {
      tasks.push(
        this.academicSection.aggregate(tx, tenantId, term, options).then((r) => {
          sections.academic = r;
        }),
      );
    }
    if (wants.has('behaviour')) {
      tasks.push(
        this.behaviourSection.aggregate(tx, tenantId, term, options).then((r) => {
          sections.behaviour = r;
        }),
      );
    }
    if (wants.has('safeguarding')) {
      tasks.push(
        this.safeguardingSection.aggregate(tx, tenantId, term, options).then((r) => {
          sections.safeguarding = r;
        }),
      );
    }
    if (wants.has('finance')) {
      tasks.push(
        this.financeSection.aggregate(tx, tenantId, term, options).then((r) => {
          sections.finance = r;
        }),
      );
    }
    if (wants.has('staffing')) {
      tasks.push(
        this.staffingSection.aggregate(tx, tenantId, term, options).then((r) => {
          sections.staffing = r;
        }),
      );
    }

    await Promise.all(tasks);
    return sections;
  }

  private async resolveTerm(
    tx: PrismaTransaction,
    tenantId: string,
    requested: BoardReportRequest['term'],
  ): Promise<ResolvedTerm> {
    const academicYear = await tx.academicYear.findFirst({
      where: { id: requested.academic_year_id, tenant_id: tenantId },
      select: { id: true, name: true, start_date: true, end_date: true },
    });
    if (!academicYear) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year "${requested.academic_year_id}" not found`,
      });
    }

    const periods = await tx.academicPeriod.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYear.id,
        period_type: { in: ['term', 'semester', 'quarter'] },
      },
      select: { id: true, name: true, start_date: true, end_date: true },
      orderBy: { start_date: 'asc' },
    });

    // `term_number` is a 1-indexed ordinal over the year's periods.
    const idx = requested.term_number - 1;
    const period = periods[idx];

    if (!period) {
      // Fall back to the academic-year window so the caller still
      // gets data, but attach a meaningful term label. This avoids a
      // hard failure on tenants that haven't defined periods yet — the
      // owner can still generate a board packet for the whole year.
      this.logger.warn(
        `[resolveTerm] tenant ${tenantId} has ${periods.length} periods in AY ${academicYear.id}; term ${requested.term_number} not found — falling back to full-year window`,
      );
      return {
        academic_year_id: academicYear.id,
        academic_year_name: academicYear.name,
        term_number: requested.term_number,
        term_label: `Term ${requested.term_number}`,
        academic_period_id: null,
        term_start: academicYear.start_date,
        term_end: academicYear.end_date,
        prior_term: null,
      };
    }

    const prior = idx > 0 ? periods[idx - 1] : undefined;

    return {
      academic_year_id: academicYear.id,
      academic_year_name: academicYear.name,
      term_number: requested.term_number,
      term_label: period.name,
      academic_period_id: period.id,
      term_start: period.start_date,
      term_end: period.end_date,
      prior_term: prior
        ? {
            academic_period_id: prior.id,
            term_start: prior.start_date,
            term_end: prior.end_date,
          }
        : null,
    };
  }

  private async resolveTenantMeta(
    tx: PrismaTransaction,
    tenantId: string,
  ): Promise<{ name: string }> {
    const tenant = await tx.tenant.findFirst({
      where: { id: tenantId },
      select: { name: true },
    });
    if (!tenant) {
      throw new BadRequestException({
        code: 'TENANT_NOT_FOUND',
        message: `Tenant "${tenantId}" could not be read inside board-report transaction`,
      });
    }
    return { name: tenant.name };
  }

  private deriveTitle(tenantName: string, term: ResolvedTerm): string {
    return `${tenantName} — Board Report (${term.term_label}, ${term.academic_year_name})`;
  }

  private buildPersistedPayload(args: {
    term: ResolvedTerm;
    sectionsIncluded: ReadonlyArray<BoardReportSectionKey>;
    anonymise: boolean;
    sections: BoardReport['sections'];
  }): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify({
        schema_version: 1,
        term: {
          academic_year_id: args.term.academic_year_id,
          academic_year_name: args.term.academic_year_name,
          term_number: args.term.term_number,
          term_label: args.term.term_label,
        },
        sections_included: args.sectionsIncluded,
        anonymise: args.anonymise,
        sections: args.sections,
      }),
    ) as Prisma.InputJsonValue;
  }

  private extractSectionsIncluded(sections_json: unknown): BoardReportSectionKey[] {
    if (!sections_json || typeof sections_json !== 'object') return [];
    const payload = sections_json as Record<string, unknown>;

    // Prefer the explicit sections_included array persisted by the new path.
    const included = payload.sections_included;
    if (Array.isArray(included)) {
      const valid = new Set<string>(BOARD_REPORT_SECTION_KEYS);
      return included.filter(
        (v): v is BoardReportSectionKey => typeof v === 'string' && valid.has(v),
      );
    }

    // Fallback — infer from whichever top-level keys the legacy path wrote.
    const legacy = payload.sections;
    if (legacy && typeof legacy === 'object') {
      const valid = new Set<string>(BOARD_REPORT_SECTION_KEYS);
      return Object.keys(legacy as object).filter((k): k is BoardReportSectionKey => valid.has(k));
    }
    return [];
  }

  private extractAnonymiseFlag(sections_json: unknown): boolean {
    if (!sections_json || typeof sections_json !== 'object') return true;
    const payload = sections_json as Record<string, unknown>;
    return typeof payload.anonymise === 'boolean' ? payload.anonymise : true;
  }

  private toRow(r: {
    id: string;
    title: string;
    academic_period_id: string | null;
    report_type: string;
    sections_json: unknown;
    generated_at: Date;
    generated_by_user_id: string;
    file_url: string | null;
    created_at: Date;
  }): BoardReportRow {
    return {
      id: r.id,
      title: r.title,
      academic_period_id: r.academic_period_id,
      report_type: r.report_type,
      sections_json: r.sections_json,
      generated_at: r.generated_at.toISOString(),
      generated_by_user_id: r.generated_by_user_id,
      file_url: r.file_url,
      created_at: r.created_at.toISOString(),
    };
  }
}
