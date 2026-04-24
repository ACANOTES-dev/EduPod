import { Logger } from '@nestjs/common';

import {
  REPORT_SUBJECT_KEYS,
  savedReportQuerySchema,
} from '@school/shared/reports';
import type {
  AskAiConfidence,
  AskAiTranslationResult,
  ReportSubjectKey,
  SavedReportQuery,
} from '@school/shared/reports';

import type { FieldDescriptor, SubjectDescriptor } from '../../subject-registry/types';
import { OPERATOR_TYPE_MATRIX } from '../../subject-registry/types';

const logger = new Logger('AskAiQueryValidator');

/** Subject + field index used for O(1) lookup during validation. */
export interface ScopedRegistryIndex {
  subjects: ReadonlyMap<string, SubjectDescriptor>;
  fields: ReadonlyMap<string, ReadonlyMap<string, FieldDescriptor>>;
}

export function buildScopedIndex(
  subjects: readonly SubjectDescriptor[],
): ScopedRegistryIndex {
  const subjectMap = new Map<string, SubjectDescriptor>();
  const fieldMap = new Map<string, ReadonlyMap<string, FieldDescriptor>>();
  for (const subject of subjects) {
    subjectMap.set(subject.key, subject);
    const fields = new Map<string, FieldDescriptor>();
    for (const field of subject.fields) {
      fields.set(field.id, field);
    }
    fieldMap.set(subject.key, fields);
  }
  return { subjects: subjectMap, fields: fieldMap };
}

const VALID_SUBJECT_KEYS = new Set<string>(REPORT_SUBJECT_KEYS);

/**
 * Validate the AI's raw response text. Returns a result that mirrors
 * the `AskAiTranslationResult` shape used by the controller.
 *
 * Three failure modes are surfaced:
 *
 *   - Hard failure (`query: null`): malformed JSON, missing required
 *     fields, unknown subject, fundamental shape mismatch.
 *   - Soft failure (`query` populated, `warnings` non-empty): individual
 *     unknown / non-permitted columns are dropped; non-permitted filter
 *     leaves are dropped; suspicious operator/type pairs are warned.
 *   - Success (`query` populated, `warnings` reflect AI's own assumptions
 *     only): every field id resolves, every operator is type-legal, and
 *     the schema parses cleanly.
 */
export function validateAiResponse(
  rawResponse: string,
  subjects: readonly SubjectDescriptor[],
): Omit<AskAiTranslationResult, 'cache_hit'> {
  const trimmed = stripCodeFence(rawResponse);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(trimmed) as Record<string, unknown>;
  } catch (err) {
    logger.warn(`AI response is not valid JSON: ${(err as Error).message}`);
    return {
      query: null,
      rationale: '',
      confidence: 'low',
      warnings: ['The AI response was not valid JSON. Please rephrase the question.'],
    };
  }

  if (typeof parsed !== 'object' || parsed === null) {
    return {
      query: null,
      rationale: '',
      confidence: 'low',
      warnings: ['The AI response was not a JSON object.'],
    };
  }

  const rationale = typeof parsed.rationale === 'string' ? parsed.rationale : '';
  const aiWarnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((w): w is string => typeof w === 'string')
    : [];
  const aiConfidence = parseConfidence(parsed.confidence);

  const subjectKey = typeof parsed.subject === 'string' ? parsed.subject : null;
  if (!subjectKey || !VALID_SUBJECT_KEYS.has(subjectKey)) {
    return {
      query: null,
      rationale,
      confidence: 'low',
      warnings: [
        ...aiWarnings,
        `The AI proposed an unknown subject "${subjectKey ?? '(missing)'}". Available subjects: ${Array.from(VALID_SUBJECT_KEYS).join(', ')}.`,
      ],
    };
  }

  const index = buildScopedIndex(subjects);
  const subjectFields = index.fields.get(subjectKey);
  if (!subjectFields) {
    return {
      query: null,
      rationale,
      confidence: 'low',
      warnings: [
        ...aiWarnings,
        `Subject "${subjectKey}" is not visible in your permission set.`,
      ],
    };
  }

  const droppedColumns: string[] = [];
  const rawColumns = Array.isArray(parsed.columns) ? parsed.columns : [];
  const validColumns = rawColumns.flatMap((col): Array<Record<string, unknown>> => {
    if (typeof col !== 'object' || col === null) return [];
    const fieldId = (col as Record<string, unknown>).field_id;
    if (typeof fieldId !== 'string') return [];
    if (!subjectFields.has(fieldId)) {
      droppedColumns.push(fieldId);
      return [];
    }
    return [col as Record<string, unknown>];
  });

  const droppedFilters: string[] = [];
  const sanitisedFilters = sanitiseFilterGroup(parsed.filters, subjectFields, droppedFilters);

  const droppedGroupBy: string[] = [];
  const rawGroupBy = Array.isArray(parsed.group_by) ? parsed.group_by : [];
  const validGroupBy = rawGroupBy.flatMap((g): Array<{ field_id: string }> => {
    if (typeof g !== 'object' || g === null) return [];
    const fieldId = (g as Record<string, unknown>).field_id;
    if (typeof fieldId !== 'string') return [];
    const descriptor = subjectFields.get(fieldId);
    if (!descriptor || !descriptor.groupable) {
      droppedGroupBy.push(fieldId);
      return [];
    }
    return [{ field_id: fieldId }];
  });

  const droppedSorts: string[] = [];
  const rawSort = Array.isArray(parsed.sort) ? parsed.sort : [];
  const validSort = rawSort.flatMap(
    (s): Array<{ field_id: string; direction: 'asc' | 'desc' }> => {
      if (typeof s !== 'object' || s === null) return [];
      const fieldId = (s as Record<string, unknown>).field_id;
      const direction = (s as Record<string, unknown>).direction;
      if (typeof fieldId !== 'string') return [];
      if (!subjectFields.has(fieldId)) {
        droppedSorts.push(fieldId);
        return [];
      }
      const dir: 'asc' | 'desc' = direction === 'desc' ? 'desc' : 'asc';
      return [{ field_id: fieldId, direction: dir }];
    },
  );

  if (validColumns.length === 0) {
    return {
      query: null,
      rationale,
      confidence: 'low',
      warnings: [
        ...aiWarnings,
        ...buildDroppedWarnings(droppedColumns, droppedFilters, droppedGroupBy, droppedSorts),
        'The AI proposal did not include any valid columns. Please rephrase the question.',
      ],
    };
  }

  const candidate: Record<string, unknown> = {
    subject: subjectKey as ReportSubjectKey,
    columns: validColumns,
  };
  if (sanitisedFilters) candidate.filters = sanitisedFilters;
  if (validGroupBy.length > 0) candidate.group_by = validGroupBy;
  if (validSort.length > 0) candidate.sort = validSort;

  const zodResult = savedReportQuerySchema.safeParse(candidate);
  if (!zodResult.success) {
    const message = zodResult.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return {
      query: null,
      rationale,
      confidence: 'low',
      warnings: [
        ...aiWarnings,
        ...buildDroppedWarnings(droppedColumns, droppedFilters, droppedGroupBy, droppedSorts),
        `The AI proposal failed structural validation: ${message}`,
      ],
    };
  }

  const query: SavedReportQuery = zodResult.data;

  const combined = [
    ...aiWarnings,
    ...buildDroppedWarnings(droppedColumns, droppedFilters, droppedGroupBy, droppedSorts),
  ];

  const dropsHappened =
    droppedColumns.length > 0 ||
    droppedFilters.length > 0 ||
    droppedGroupBy.length > 0 ||
    droppedSorts.length > 0;
  const confidence: AskAiConfidence = dropsHappened
    ? aiConfidence === 'high'
      ? 'medium'
      : aiConfidence
    : aiConfidence;

  return {
    query,
    rationale,
    confidence,
    warnings: combined,
  };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseConfidence(raw: unknown): AskAiConfidence {
  if (raw === 'high' || raw === 'medium' || raw === 'low') return raw;
  return 'medium';
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('```')) {
    const withoutOpen = trimmed.replace(/^```(?:json)?\s*/i, '');
    const closeIdx = withoutOpen.lastIndexOf('```');
    if (closeIdx === -1) return withoutOpen;
    return withoutOpen.slice(0, closeIdx).trim();
  }
  return trimmed;
}

function buildDroppedWarnings(
  droppedColumns: readonly string[],
  droppedFilters: readonly string[],
  droppedGroupBy: readonly string[],
  droppedSorts: readonly string[],
): string[] {
  const warnings: string[] = [];
  if (droppedColumns.length > 0) {
    warnings.push(
      `Dropped ${droppedColumns.length} column${droppedColumns.length === 1 ? '' : 's'} (not in catalogue or your permissions): ${droppedColumns.join(', ')}.`,
    );
  }
  if (droppedFilters.length > 0) {
    warnings.push(
      `Dropped ${droppedFilters.length} filter${droppedFilters.length === 1 ? '' : 's'}: ${droppedFilters.join(', ')}.`,
    );
  }
  if (droppedGroupBy.length > 0) {
    warnings.push(
      `Dropped ${droppedGroupBy.length} group-by field${droppedGroupBy.length === 1 ? '' : 's'} (not groupable or unknown): ${droppedGroupBy.join(', ')}.`,
    );
  }
  if (droppedSorts.length > 0) {
    warnings.push(
      `Dropped ${droppedSorts.length} sort field${droppedSorts.length === 1 ? '' : 's'}: ${droppedSorts.join(', ')}.`,
    );
  }
  return warnings;
}

interface SanitisedLeaf {
  field_id: string;
  operator: string;
  value?: unknown;
}

interface SanitisedGroup {
  combinator: 'and' | 'or';
  filters: Array<SanitisedLeaf | SanitisedGroup>;
}

function sanitiseFilterGroup(
  raw: unknown,
  subjectFields: ReadonlyMap<string, FieldDescriptor>,
  droppedAccumulator: string[],
): SanitisedGroup | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const obj = raw as Record<string, unknown>;
  const combinator = obj.combinator === 'or' ? 'or' : 'and';
  const rawChildren = Array.isArray(obj.filters)
    ? obj.filters
    : Array.isArray(obj.children)
      ? obj.children
      : [];

  const filters: Array<SanitisedLeaf | SanitisedGroup> = [];
  for (const child of rawChildren) {
    if (typeof child !== 'object' || child === null) continue;
    const childObj = child as Record<string, unknown>;

    if ('combinator' in childObj || 'filters' in childObj || 'children' in childObj) {
      const nested = sanitiseFilterGroup(childObj, subjectFields, droppedAccumulator);
      if (nested && nested.filters.length > 0) {
        filters.push(nested);
      }
      continue;
    }

    const fieldId = childObj.field_id;
    const operator = childObj.operator ?? childObj.op;
    if (typeof fieldId !== 'string' || typeof operator !== 'string') {
      continue;
    }

    const descriptor = subjectFields.get(fieldId);
    if (!descriptor) {
      droppedAccumulator.push(fieldId);
      continue;
    }
    if (!descriptor.filterable) {
      droppedAccumulator.push(fieldId);
      continue;
    }

    const allowedOps = OPERATOR_TYPE_MATRIX[descriptor.type];
    if (!allowedOps.includes(operator as (typeof allowedOps)[number])) {
      droppedAccumulator.push(fieldId);
      continue;
    }

    const leaf: SanitisedLeaf = { field_id: fieldId, operator };
    if ('value' in childObj) leaf.value = childObj.value;
    filters.push(leaf);
  }

  if (filters.length === 0) return undefined;
  return { combinator, filters };
}
