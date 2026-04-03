import type { $Enums, Prisma } from '@prisma/client';

import type { BehaviourAnalyticsQuery, DataQuality } from '@school/shared/behaviour';

import type { BehaviourScopeService, ScopeResult } from './behaviour-scope.service';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Statuses excluded from all behaviour aggregations. */
export const EXCLUDED_STATUSES: $Enums.IncidentStatus[] = [
  'withdrawn',
  'converted_to_safeguarding' as $Enums.IncidentStatus,
];

// ─── Date Range ─────────────────────────────────────────────────────────────

export function buildDateRange(query: BehaviourAnalyticsQuery): { from: Date; to: Date } {
  const to = query.to ? new Date(query.to) : new Date();
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  return { from, to };
}

// ─── Incident Where Clause ──────────────────────────────────────────────────

export function buildIncidentWhere(
  tenantId: string,
  query: BehaviourAnalyticsQuery,
  scope: ScopeResult,
  userId: string,
  scopeService: BehaviourScopeService,
): Prisma.BehaviourIncidentWhereInput {
  const { from, to } = buildDateRange(query);
  const scopeFilter = scopeService.buildScopeFilter({
    userId,
    scope: scope.scope,
    classStudentIds: scope.classStudentIds,
    yearGroupIds: scope.yearGroupIds,
  });

  const where: Prisma.BehaviourIncidentWhereInput = {
    tenant_id: tenantId,
    occurred_at: { gte: from, lte: to },
    status: { notIn: EXCLUDED_STATUSES },
    retention_status: 'active' as $Enums.RetentionStatus,
    ...scopeFilter,
  };

  if (query.academicYearId) where.academic_year_id = query.academicYearId;
  if (query.academicPeriodId) where.academic_period_id = query.academicPeriodId;
  if (query.polarity) where.polarity = query.polarity as $Enums.BehaviourPolarity;
  if (query.categoryId) where.category_id = query.categoryId;
  if (query.classId) {
    where.participants = {
      some: { student: { class_enrolments: { some: { class_id: query.classId } } } },
    };
  }
  if (query.yearGroupId) {
    where.participants = {
      ...(where.participants as Prisma.BehaviourIncidentParticipantListRelationFilter),
      some: { student: { year_group_id: query.yearGroupId } },
    };
  }

  return where;
}

// ─── Data Quality ───────────────────────────────────────────────────────────

export function makeDataQuality(normalised: boolean): DataQuality {
  return {
    exposure_normalised: normalised,
    data_as_of: new Date().toISOString(),
  };
}

// ─── CSV Builder ────────────────────────────────────────────────────────────

/** Build a CSV string with UTF-8 BOM, proper quoting, and ISO dates. */
export function buildCsv(headers: string[], rows: string[][]): string {
  const BOM = '\uFEFF';
  const escape = (val: string): string => {
    if (val.includes('"') || val.includes(',') || val.includes('\n') || val.includes('\r')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const lines = [headers.map(escape).join(','), ...rows.map((row) => row.map(escape).join(','))];
  return BOM + lines.join('\r\n') + '\r\n';
}
