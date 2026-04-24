import type { PrismaClient } from '@prisma/client';

import type { FilterColumnMap } from '../query-engine/filter-compiler';
import type { SavedReportQuery } from '../query-engine/query-engine.types';

import type { SubjectAdapter } from './subject-adapter';
import type { FieldDescriptor, SubjectDescriptor } from './types';

/**
 * Configuration for `buildAdapter` — per-subject data that the generic
 * adapter scaffold cannot know on its own.
 *
 * `delegate` is the Prisma model delegate (e.g. `tx.student`) as looked up
 * by subject key. The generic adapter calls `.count()` and `.findMany()`
 * on it with compiled args. Because Prisma's delegate types are narrow
 * (each model has its own `findMany` signature), we treat the delegate
 * as a loose interface here and rely on runtime dispatch to match the
 * compiled query shape.
 */
export type SubjectAdapterConfig<Row> = {
  descriptor: SubjectDescriptor;
  filterColumnMap: FilterColumnMap;
  /** The Prisma `select` / `include` fragment applied to every query. */
  selectFragment: Record<string, unknown>;
  /** Default sort applied when the query has no sort spec. */
  defaultOrderBy: Array<Record<string, unknown>>;
  /** Returns the Prisma delegate from a transaction client. */
  getDelegate: (tx: PrismaClient) => PrismaDelegate;
  /** Map `resolver` id → function against the typed row. */
  resolvers: Readonly<Record<string, (row: Row) => unknown>>;
};

/**
 * The narrow shape of a Prisma model delegate the adapter uses. This is a
 * structural subset of Prisma's per-model delegate type — `count` and
 * `findMany` with permissive signatures. The generic adapter does not
 * type-check the `args` payload against each delegate (Prisma's generic
 * delegate types do not line up cleanly across 11 models); the compilers
 * construct the payload to match the target delegate by construction.
 */
export type PrismaDelegate = {
  count: (args: { where: Record<string, unknown> }) => Promise<number>;
  findMany: (args: {
    where: Record<string, unknown>;
    select: Record<string, unknown>;
    orderBy: Array<Record<string, unknown>>;
    skip: number;
    take: number;
  }) => Promise<unknown[]>;
};

/**
 * Assemble a `SubjectAdapter` from per-subject config. Extracted to DRY
 * the 11 subjects — each file declares data plus resolvers and calls this
 * helper, not boilerplate count/fetch methods.
 */
export function buildAdapter<Row>(config: SubjectAdapterConfig<Row>): SubjectAdapter {
  const { descriptor, filterColumnMap, selectFragment, defaultOrderBy, getDelegate, resolvers } =
    config;

  return {
    descriptor,
    filterColumnMap,

    buildSelect() {
      return selectFragment;
    },

    buildOrderBy(sort: SavedReportQuery['sort']) {
      if (!sort || sort.length === 0) {
        return defaultOrderBy;
      }
      const compiled: Array<Record<string, unknown>> = [];
      for (const s of sort) {
        const path = filterColumnMap[s.field_id];
        if (!path) continue;
        compiled.push(toNestedOrderBy(path, s.direction));
      }
      return compiled.length > 0 ? compiled : defaultOrderBy;
    },

    async countRows(tx, where) {
      return getDelegate(tx).count({ where });
    },

    async fetchRows(tx, args) {
      return getDelegate(tx).findMany(args);
    },

    resolveRow(row, scopedFields, columns) {
      const typed = row as Row;
      const out: Record<string, unknown> = {};
      for (const col of columns) {
        const field = scopedFields.get(col.field_id);
        if (!field) continue;
        const resolver = resolvers[field.resolver];
        out[col.field_id] = resolver ? resolver(typed) : null;
      }
      return out;
    },
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toNestedOrderBy(path: string, direction: 'asc' | 'desc'): Record<string, unknown> {
  const segments = path.split('.');
  let current: unknown = direction;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    current = { [segments[i]!]: current };
  }
  return current as Record<string, unknown>;
}

/**
 * Utility for field-file authors: declare the `descriptor` + `resolvers`
 * + `filterColumnMap` + `selectFragment` with explicit keys and then call
 * `buildAdapter`. Exported as a value so TypeScript infers the `Row`
 * generic from the resolvers.
 */
export type FieldDescriptorArray = readonly FieldDescriptor[];
