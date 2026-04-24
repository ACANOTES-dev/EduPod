import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';

import type {
  ComplianceField,
  ComplianceFieldKey,
  ComplianceHistoryEntry,
  ComplianceHistoryQueryDto,
  ComplianceReportResponse,
  GenerateComplianceReportDto,
} from '@school/shared/reports';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';

import type { AggregatorContext, AggregatorResult } from './aggregator.types';
import { COMPLIANCE_AGGREGATORS } from './aggregators';
import { COMPLIANCE_CATALOGUE_VERSION, COMPLIANCE_FIELD_CATALOGUE } from './compliance-fields';

/**
 * Orchestrates the generation of a compliance report. Resolves the
 * academic year, opens one RLS-scoped interactive transaction, runs
 * every requested aggregator inside it, assembles the response, and
 * writes an audit row to `compliance_report_generations` so regulators
 * can ask "what did you submit on <date>" and the tenant can answer
 * from the DB.
 *
 * Every tenant-scoped write flows through an interactive
 * `$transaction(async (tx) => ...)`. Aggregators receive the same `tx`
 * client so the aggregation + audit write are atomic — a failure in
 * the last aggregator does not leave a half-written history row.
 */
@Injectable()
export class ComplianceGenerationService {
  private readonly logger = new Logger(ComplianceGenerationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generate(
    tenantId: string,
    userId: string,
    dto: GenerateComplianceReportDto,
  ): Promise<ComplianceReportResponse> {
    const fieldKeys = this.resolveFieldKeys(dto.fields);
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });

    return rlsClient.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaClient;

      const tenant = await txClient.tenant.findFirst({
        where: { id: tenantId },
        select: { id: true, name: true },
      });
      if (!tenant) {
        throw new NotFoundException({
          code: 'TENANT_NOT_FOUND',
          message: `Tenant "${tenantId}" not found`,
        });
      }

      const academicYear = await txClient.academicYear.findFirst({
        where: { id: dto.academic_year_id, tenant_id: tenantId },
        select: { id: true, name: true, start_date: true, end_date: true },
      });
      if (!academicYear) {
        throw new NotFoundException({
          code: 'ACADEMIC_YEAR_NOT_FOUND',
          message: `Academic year "${dto.academic_year_id}" not found`,
        });
      }

      const ctx: AggregatorContext = {
        tenantId,
        academicYear: {
          id: academicYear.id,
          name: academicYear.name,
          start_date: academicYear.start_date,
          end_date: academicYear.end_date,
        },
      };

      // Run every aggregator. We use `allSettled` so a single failing
      // aggregator degrades its one field to a gap rather than failing
      // the whole report — the compliance report is safety-critical.
      const settled = await Promise.allSettled(
        fieldKeys.map(async (key) => ({
          key,
          result: await COMPLIANCE_AGGREGATORS[key](txClient, ctx),
        })),
      );

      const fields: ComplianceField[] = fieldKeys.map((key, i) => {
        const entry = settled[i]!;

        if (entry.status === 'rejected') {
          this.logger.error(`[ComplianceGenerationService] aggregator ${key} failed`, entry.reason);
          return this.toResponseField(key, {
            value: null,
            has_gap: true,
            gap_reason: 'aggregator_error',
            last_verified_at: new Date().toISOString(),
          });
        }

        return this.toResponseField(key, entry.value.result);
      });

      // Persist the audit trail.
      const generation = await txClient.complianceReportGeneration.create({
        data: {
          tenant_id: tenantId,
          academic_year_id: academicYear.id,
          generated_by: userId,
          fields_json: fields as unknown as Prisma.InputJsonValue,
          catalogue_version: COMPLIANCE_CATALOGUE_VERSION,
        },
        select: { id: true, created_at: true },
      });

      return {
        tenant: {
          id: tenant.id,
          name: tenant.name,
          academic_year: {
            id: academicYear.id,
            name: academicYear.name,
            start_date: academicYear.start_date.toISOString(),
            end_date: academicYear.end_date.toISOString(),
          },
        },
        fields,
        meta: {
          catalogue_version: COMPLIANCE_CATALOGUE_VERSION,
          generated_at: generation.created_at.toISOString(),
          generated_by_user_id: userId,
          generation_id: generation.id,
        },
      };
    });
  }

  async history(
    tenantId: string,
    query: ComplianceHistoryQueryDto,
  ): Promise<{
    data: ComplianceHistoryEntry[];
    meta: { page: number; pageSize: number; total: number };
  }> {
    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId });

    return rlsClient.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaClient;

      const where = {
        tenant_id: tenantId,
        ...(query.academic_year_id ? { academic_year_id: query.academic_year_id } : {}),
      };

      const [rows, total] = await Promise.all([
        txClient.complianceReportGeneration.findMany({
          where,
          orderBy: { created_at: 'desc' },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
          select: {
            id: true,
            academic_year_id: true,
            generated_by: true,
            catalogue_version: true,
            created_at: true,
            fields_json: true,
          },
        }),
        txClient.complianceReportGeneration.count({ where }),
      ]);

      const data: ComplianceHistoryEntry[] = rows.map((r) => {
        const fields = this.extractFieldsArray(r.fields_json);
        return {
          id: r.id,
          academic_year_id: r.academic_year_id,
          generated_at: r.created_at.toISOString(),
          generated_by: r.generated_by,
          catalogue_version: r.catalogue_version,
          field_count: fields.length,
          gap_count: fields.filter((f) => f.has_gap === true).length,
        };
      });

      return {
        data,
        meta: { page: query.page, pageSize: query.pageSize, total },
      };
    });
  }

  // ─── Internals ───────────────────────────────────────────────────────────

  private resolveFieldKeys(requested?: ComplianceFieldKey[]): ComplianceFieldKey[] {
    const all = Object.keys(COMPLIANCE_FIELD_CATALOGUE) as ComplianceFieldKey[];
    if (!requested || requested.length === 0) return all;

    const allSet = new Set<ComplianceFieldKey>(all);
    const unknown = requested.filter((k) => !allSet.has(k));
    if (unknown.length > 0) {
      throw new BadRequestException({
        code: 'UNKNOWN_COMPLIANCE_FIELDS',
        message: `Unknown compliance field keys: ${unknown.join(', ')}`,
      });
    }
    return requested;
  }

  private toResponseField(key: ComplianceFieldKey, result: AggregatorResult): ComplianceField {
    const catalogueEntry = COMPLIANCE_FIELD_CATALOGUE[key];
    return {
      key,
      label_key: catalogueEntry.label_key,
      value: result.value,
      unit: catalogueEntry.unit,
      source: catalogueEntry.description,
      last_verified_at: result.last_verified_at,
      has_gap: result.has_gap,
      ...(result.gap_reason ? { gap_reason: result.gap_reason } : {}),
    };
  }

  /**
   * `fields_json` is a `Json` column. We wrote `ComplianceField[]` into
   * it in `generate()`, but Prisma types it as `JsonValue` on read. A
   * narrow runtime check is safer than a blanket cast — malformed rows
   * get `[]` rather than throwing during history pagination.
   */
  private extractFieldsArray(json: unknown): Array<{ has_gap: boolean }> {
    if (!Array.isArray(json)) return [];
    return json.filter(
      (entry): entry is { has_gap: boolean } =>
        typeof entry === 'object' && entry !== null && 'has_gap' in entry,
    );
  }
}
