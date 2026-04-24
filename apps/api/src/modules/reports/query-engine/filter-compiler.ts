import { BadRequestException } from '@nestjs/common';

import type { FieldDescriptor } from '../subject-registry/types';
import { OPERATOR_TYPE_MATRIX } from '../subject-registry/types';

import { QUERY_ENGINE_ERROR_CODES } from './query-engine.types';
import type { FilterGroup, FilterLeaf, FilterOperator } from './query-engine.types';

// ─── Column-path mapping ─────────────────────────────────────────────────────

/**
 * Mapping from a field id to the literal SQL column / Prisma relation path
 * used inside the Prisma `where` clause. One entry per compiler-subject.
 * The compiler registers its mapping once at construction; the filter
 * compiler looks it up per leaf.
 *
 * Example (Student): `'student.identity.first_name' -> 'first_name'`, or
 * `'student.household.city' -> 'household.city'`.
 *
 * `null` means the field cannot be filtered at the database layer. This
 * applies to computed resolvers (age from DOB, attendance rate, etc.) —
 * their filter is either derived to a column-level equivalent elsewhere
 * or the field is flagged `filterable: false` to begin with.
 */
export type FilterColumnMap = Readonly<Record<string, string | null>>;

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Compile a filter tree into a Prisma `where` object. Enforces per-field
 * filterability and operator/type matching. Unknown field ids, unsupported
 * operators for the field's type, and references to fields stripped by
 * permission scoping all raise 400-level exceptions.
 */
export function compileFilterGroup(
  group: FilterGroup | undefined,
  scopedFields: Map<string, FieldDescriptor>,
  columnMap: FilterColumnMap,
): Record<string, unknown> {
  if (!group || group.filters.length === 0) {
    return {};
  }

  const compiled = group.filters
    .map((child) => {
      if (isLeaf(child)) {
        return compileLeaf(child, scopedFields, columnMap);
      }
      return compileFilterGroup(child, scopedFields, columnMap);
    })
    .filter((o) => Object.keys(o).length > 0);

  if (compiled.length === 0) {
    return {};
  }

  if (compiled.length === 1) {
    return compiled[0]!;
  }

  return group.combinator === 'or' ? { OR: compiled } : { AND: compiled };
}

// ─── Internals ───────────────────────────────────────────────────────────────

function isLeaf(node: FilterLeaf | FilterGroup): node is FilterLeaf {
  return typeof (node as FilterLeaf).field_id === 'string';
}

function compileLeaf(
  leaf: FilterLeaf,
  scopedFields: Map<string, FieldDescriptor>,
  columnMap: FilterColumnMap,
): Record<string, unknown> {
  const descriptor = scopedFields.get(leaf.field_id);
  if (!descriptor) {
    throw new BadRequestException({
      code: QUERY_ENGINE_ERROR_CODES.UNKNOWN_FIELD,
      message: `Unknown field id "${leaf.field_id}" (either nonexistent or scoped out by permissions)`,
    });
  }

  if (!descriptor.filterable) {
    throw new BadRequestException({
      code: QUERY_ENGINE_ERROR_CODES.FIELD_NOT_FILTERABLE,
      message: `Field "${leaf.field_id}" is not filterable`,
    });
  }

  const legalOps = OPERATOR_TYPE_MATRIX[descriptor.type];
  if (!legalOps.includes(leaf.operator)) {
    throw new BadRequestException({
      code: QUERY_ENGINE_ERROR_CODES.INVALID_OPERATOR_FOR_TYPE,
      message: `Operator "${leaf.operator}" is not valid for ${descriptor.type} field "${leaf.field_id}"`,
    });
  }

  const columnPath = columnMap[leaf.field_id];
  if (columnPath === undefined || columnPath === null) {
    throw new BadRequestException({
      code: QUERY_ENGINE_ERROR_CODES.FIELD_NOT_FILTERABLE,
      message: `Field "${leaf.field_id}" has no database-level filter binding`,
    });
  }

  const predicate = buildPrismaPredicate(leaf.operator, leaf.value, descriptor.type);
  return pathToWhere(columnPath, predicate);
}

function buildPrismaPredicate(
  operator: FilterOperator,
  value: unknown,
  type: FieldDescriptor['type'],
): unknown {
  // `is_null` / `is_not_null` ignore value entirely.
  if (operator === 'is_null') return null;
  if (operator === 'is_not_null') return { not: null };

  const coerced = coerceValue(value, type);

  switch (operator) {
    case 'equals':
    case 'on':
      return coerced;
    case 'not_equals':
      return { not: coerced };
    case 'contains':
      return { contains: String(coerced), mode: 'insensitive' };
    case 'starts_with':
      return { startsWith: String(coerced), mode: 'insensitive' };
    case 'ends_with':
      return { endsWith: String(coerced), mode: 'insensitive' };
    case 'greater_than':
    case 'after':
      return { gt: coerced };
    case 'less_than':
    case 'before':
      return { lt: coerced };
    case 'greater_or_equal':
      return { gte: coerced };
    case 'less_or_equal':
      return { lte: coerced };
    case 'between': {
      if (!Array.isArray(coerced) || coerced.length !== 2) {
        throw new BadRequestException({
          code: QUERY_ENGINE_ERROR_CODES.INVALID_OPERATOR_FOR_TYPE,
          message: `"between" requires a two-element array`,
        });
      }
      return { gte: coerced[0], lte: coerced[1] };
    }
    case 'in_list': {
      if (!Array.isArray(coerced)) {
        throw new BadRequestException({
          code: QUERY_ENGINE_ERROR_CODES.INVALID_OPERATOR_FOR_TYPE,
          message: `"in_list" requires an array value`,
        });
      }
      return { in: coerced };
    }
    case 'not_in_list': {
      if (!Array.isArray(coerced)) {
        throw new BadRequestException({
          code: QUERY_ENGINE_ERROR_CODES.INVALID_OPERATOR_FOR_TYPE,
          message: `"not_in_list" requires an array value`,
        });
      }
      return { notIn: coerced };
    }
  }
}

/**
 * Turn a dotted path `household.city` into the nested where object
 * `{ household: { city: <predicate> } }`. Single-segment paths like
 * `first_name` produce `{ first_name: <predicate> }`.
 */
function pathToWhere(path: string, predicate: unknown): Record<string, unknown> {
  const segments = path.split('.');
  let current: unknown = predicate;
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    current = { [segments[i]!]: current };
  }
  return current as Record<string, unknown>;
}

/**
 * Coerce a raw filter value into the shape Prisma expects for the field's
 * type. Date strings → `Date`; string arrays stay arrays; numbers are
 * already in shape. Two-element `between` arrays are recursed element-wise.
 */
export function coerceValue(value: unknown, type: FieldDescriptor['type']): unknown {
  if (value === undefined || value === null) return value;
  if (Array.isArray(value)) return value.map((v) => coerceValue(v, type));
  if (type === 'date') {
    if (value instanceof Date) return value;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException({
        code: QUERY_ENGINE_ERROR_CODES.INVALID_OPERATOR_FOR_TYPE,
        message: `Invalid date value: ${String(value)}`,
      });
    }
    return parsed;
  }
  if (type === 'number' || type === 'currency') {
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    if (Number.isNaN(parsed)) {
      throw new BadRequestException({
        code: QUERY_ENGINE_ERROR_CODES.INVALID_OPERATOR_FOR_TYPE,
        message: `Invalid numeric value: ${String(value)}`,
      });
    }
    return parsed;
  }
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    throw new BadRequestException({
      code: QUERY_ENGINE_ERROR_CODES.INVALID_OPERATOR_FOR_TYPE,
      message: `Invalid boolean value: ${String(value)}`,
    });
  }
  return value;
}
