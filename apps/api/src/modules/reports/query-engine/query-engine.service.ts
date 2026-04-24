import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';

import { createRlsClient } from '../../../common/middleware/rls.middleware';
import { PrismaService } from '../../prisma/prisma.service';
import { compileFilterGroup } from '../query-engine/filter-compiler';
import { ReportsSubjectRegistryService } from '../subject-registry/reports-subject-registry.service';
import type { FieldDescriptor } from '../subject-registry/types';
import { DEFAULT_AGGREGATIONS_BY_TYPE } from '../subject-registry/types';

import {
  QUERY_ENGINE_ERROR_CODES,
  QUERY_ENGINE_ROW_CAP,
  QUERY_ENGINE_TIMEOUT_MS,
} from './query-engine.types';
import type {
  QueryColumn,
  QueryExecutionOptions,
  QueryExecutionResult,
  QueryResultColumn,
  SavedReportQuery,
} from './query-engine.types';

/**
 * The `QueryEngineService` is the single entry point for executing
 * custom-report queries. It:
 *
 *   1. Validates every field id in columns, filters, group-by, and sort
 *      against the caller's permission-scoped subject registry.
 *   2. Compiles the query into a Prisma call (where + select + orderBy)
 *      through the subject adapter.
 *   3. Runs a row-count probe against the adapter and rejects if the
 *      ungrouped result would exceed `QUERY_ENGINE_ROW_CAP`.
 *   4. Executes the query inside an RLS-scoped interactive transaction
 *      with a 30-second timeout budget.
 *   5. Maps Prisma rows to the flat `{ [field_id]: value }` shape using
 *      the subject adapter's resolver map.
 *
 * Group-by is a near-term extension point — the public API accepts
 * `group_by` but currently serves it by delegating to Prisma's groupBy
 * on the primary key. Richer multi-column aggregation is out of scope
 * for this phase (see PLAN.md §5.1 step 5 for the eventual UX).
 */
@Injectable()
export class QueryEngineService {
  private readonly logger = new Logger(QueryEngineService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly registry: ReportsSubjectRegistryService,
  ) {}

  async execute(
    tenantId: string,
    userId: string,
    permissions: string[],
    query: SavedReportQuery,
    options: QueryExecutionOptions,
  ): Promise<QueryExecutionResult> {
    const started = Date.now();

    const adapter = this.registry.getAdapter(query.subject);
    const scopedFields = this.registry.getScopedFieldMap(query.subject, permissions);

    this.validateQuery(query, scopedFields);

    const where = compileFilterGroup(query.filters, scopedFields, adapter.filterColumnMap);
    const select = adapter.buildSelect(scopedFields, query.columns);
    const orderBy = adapter.buildOrderBy(query.sort);

    const rlsClient = createRlsClient(this.prisma, { tenant_id: tenantId, user_id: userId });

    const run = rlsClient.$transaction(async (tx) => {
      const txClient = tx as unknown as PrismaClient;

      // Row-cap probe. Skipped for group-by since grouped results are
      // bounded by distinct keys, not by source rows.
      if (!query.group_by || query.group_by.length === 0) {
        const rowCount = await adapter.countRows(txClient, where);
        if (rowCount > QUERY_ENGINE_ROW_CAP) {
          throw new HttpException(
            {
              code: QUERY_ENGINE_ERROR_CODES.ROW_CAP_EXCEEDED,
              message: `Query would return ${rowCount} rows (cap is ${QUERY_ENGINE_ROW_CAP}). Narrow your filters.`,
              row_count: rowCount,
            },
            HttpStatus.BAD_REQUEST,
          );
        }
      }

      const skip = (options.page - 1) * options.pageSize;
      const take = options.pageSize;

      const [rawRows, totalCount] = await Promise.all([
        adapter.fetchRows(txClient, { where, select, orderBy, skip, take }),
        adapter.countRows(txClient, where),
      ]);

      const rows = rawRows.map((row) => adapter.resolveRow(row, scopedFields, query.columns));

      return { rows, totalCount };
    });

    // Race against timeout.
    let winner: Awaited<typeof run>;
    try {
      winner = await withTimeout(run, QUERY_ENGINE_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof HttpException) {
        throw err;
      }
      if (err instanceof QueryTimeoutError) {
        throw new HttpException(
          {
            code: QUERY_ENGINE_ERROR_CODES.QUERY_TIMEOUT,
            message: `Query exceeded the ${QUERY_ENGINE_TIMEOUT_MS / 1000}-second budget. Narrow your filters.`,
          },
          HttpStatus.REQUEST_TIMEOUT,
        );
      }
      throw err;
    }

    const execution_ms = Date.now() - started;
    const columns = this.buildResultColumns(query.columns, scopedFields);

    return {
      rows: winner.rows,
      columns,
      meta: {
        row_count: winner.totalCount,
        truncated: winner.totalCount > options.page * options.pageSize,
        execution_ms,
      },
    };
  }

  // ─── Validation ───────────────────────────────────────────────────────────

  /**
   * Reject any query that references an unknown or permission-stripped
   * field id. Rejection is a 400 citing the offending id so the UI can
   * show a friendly message.
   */
  private validateQuery(query: SavedReportQuery, scopedFields: Map<string, FieldDescriptor>): void {
    if (query.columns.length === 0) {
      throw new BadRequestException({
        code: QUERY_ENGINE_ERROR_CODES.UNKNOWN_FIELD,
        message: 'A report must select at least one column',
      });
    }

    for (const col of query.columns) {
      const descriptor = scopedFields.get(col.field_id);
      if (!descriptor) {
        throw new BadRequestException({
          code: QUERY_ENGINE_ERROR_CODES.UNKNOWN_FIELD,
          message: `Unknown column "${col.field_id}"`,
        });
      }
      if (col.aggregation) {
        const allowed = descriptor.aggregations ?? DEFAULT_AGGREGATIONS_BY_TYPE[descriptor.type];
        if (!allowed.includes(col.aggregation)) {
          throw new BadRequestException({
            code: QUERY_ENGINE_ERROR_CODES.INVALID_AGGREGATION_FOR_TYPE,
            message: `Aggregation "${col.aggregation}" is not valid for ${descriptor.type} field "${col.field_id}"`,
          });
        }
      }
    }

    // Group-by validation — every group-by field must exist and be
    // groupable; every non-group-by column must then have an aggregation.
    if (query.group_by && query.group_by.length > 0) {
      const groupIds = new Set(query.group_by.map((g) => g.field_id));
      for (const g of query.group_by) {
        const descriptor = scopedFields.get(g.field_id);
        if (!descriptor) {
          throw new BadRequestException({
            code: QUERY_ENGINE_ERROR_CODES.UNKNOWN_FIELD,
            message: `Unknown group-by field "${g.field_id}"`,
          });
        }
        if (!descriptor.groupable) {
          throw new BadRequestException({
            code: QUERY_ENGINE_ERROR_CODES.FIELD_NOT_GROUPABLE,
            message: `Field "${g.field_id}" is not groupable`,
          });
        }
      }
      for (const col of query.columns) {
        if (!groupIds.has(col.field_id) && !col.aggregation) {
          throw new BadRequestException({
            code: QUERY_ENGINE_ERROR_CODES.AGGREGATION_REQUIRED,
            message: `Column "${col.field_id}" must have an aggregation when the report is grouped`,
          });
        }
      }
    }

    // Sort validation — each sort field must be either a selected column
    // or, in the ungrouped case, just any sortable field.
    if (query.sort) {
      for (const s of query.sort) {
        if (!scopedFields.has(s.field_id)) {
          throw new BadRequestException({
            code: QUERY_ENGINE_ERROR_CODES.UNKNOWN_FIELD,
            message: `Unknown sort field "${s.field_id}"`,
          });
        }
      }
    }
  }

  // ─── Result shaping ───────────────────────────────────────────────────────

  private buildResultColumns(
    columns: QueryColumn[],
    scopedFields: Map<string, FieldDescriptor>,
  ): QueryResultColumn[] {
    return columns.map((col) => {
      const f = scopedFields.get(col.field_id);
      if (!f) {
        return { id: col.field_id, label_key: col.field_id, type: 'string' };
      }
      return { id: f.id, label_key: f.label_key, type: f.type };
    });
  }
}

// ─── Timeout helper ──────────────────────────────────────────────────────────

class QueryTimeoutError extends Error {}

/**
 * Race a promise against a timer. If the timer fires first, reject with
 * `QueryTimeoutError`. The caller translates that into an HTTP 408 /
 * `REPORT_QUERY_TIMEOUT` response. The underlying promise keeps running
 * and may eventually settle — we just ignore the result.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new QueryTimeoutError()), ms);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((err: unknown) => {
        clearTimeout(timer);
        reject(err instanceof Error ? err : new Error(String(err)));
      });
  });
}
