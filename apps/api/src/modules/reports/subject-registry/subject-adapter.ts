import type { PrismaClient } from '@prisma/client';

import type { FilterColumnMap } from '../query-engine/filter-compiler';
import type { SavedReportQuery } from '../query-engine/query-engine.types';

import type { FieldDescriptor, SubjectDescriptor } from './types';

/**
 * Each of the 11 report subjects is realised as a `SubjectAdapter`.
 *
 * The adapter owns three concerns:
 *   1. `descriptor`        — the curated field catalogue (what the builder UI sees).
 *   2. `filterColumnMap`   — maps field ids to Prisma `where`-path strings.
 *   3. `countRows` / `fetchRows` — execute the compiled query against the
 *      subject's primary Prisma model.
 *
 * Each row returned by `fetchRows` is then mapped to the flat builder
 * output via `resolveRow`, which uses the scoped `FieldDescriptor` to pick
 * the correct resolver (identity mapping for direct columns, computed
 * functions for derived fields like age / attendance rate).
 */
export interface SubjectAdapter {
  readonly descriptor: SubjectDescriptor;
  readonly filterColumnMap: FilterColumnMap;

  /**
   * Prisma `select` / `include` fragment needed to materialise every
   * selected (or filtered-on, or grouped-on) field. Reasonable compilers
   * narrow this per-request; the default compiler returns a maximal
   * fragment covering all configured fields in the scoped tree.
   */
  buildSelect(
    scopedFields: Map<string, FieldDescriptor>,
    columns: SavedReportQuery['columns'],
  ): Record<string, unknown>;

  /**
   * Build a Prisma `orderBy` array from the query's sort spec, translating
   * field ids into the same dotted-path form used for filter compilation.
   * An empty sort returns a default sort (usually by primary key desc).
   */
  buildOrderBy(sort: SavedReportQuery['sort']): Array<Record<string, unknown>>;

  /**
   * Run the count. Used for the row-cap probe and for pagination metadata.
   */
  countRows(tx: PrismaClient, where: Record<string, unknown>): Promise<number>;

  /**
   * Fetch a page of rows. `where`, `select`, `orderBy`, `skip`, and `take`
   * are all pre-compiled by the engine.
   */
  fetchRows(
    tx: PrismaClient,
    args: {
      where: Record<string, unknown>;
      select: Record<string, unknown>;
      orderBy: Array<Record<string, unknown>>;
      skip: number;
      take: number;
    },
  ): Promise<unknown[]>;

  /**
   * Map a raw Prisma row into the flat, id-keyed output the builder
   * expects. The `scopedFields` map is used to drive which resolver keys
   * to invoke.
   */
  resolveRow(
    row: unknown,
    scopedFields: Map<string, FieldDescriptor>,
    columns: SavedReportQuery['columns'],
  ): Record<string, unknown>;
}
