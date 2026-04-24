import type { SubjectDescriptor } from '../../subject-registry/types';

import { renderExamplesBlock } from './examples';
import { getSystemPrompt } from './system-prompt';

/**
 * The full Anthropic prompt pair (system + user) is built here so the
 * ask-AI service stays focused on orchestration and the prompt code
 * stays unit-testable.
 *
 * Two design choices:
 *
 * 1. **Compact catalogue.** Sending the full `SubjectDescriptor[]` JSON
 *    blows up token cost. We render a stripped JSON of just the fields
 *    the AI actually needs: id, type, filterable, groupable, and the
 *    aggregations (when present). Long human-readable label keys, the
 *    server-side resolver name, and the icon name are dropped.
 *
 * 2. **Permission scoping happens upstream.** The service passes the
 *    ALREADY-scoped subject list — fields the user cannot see have been
 *    stripped by `ReportsSubjectRegistryService.getAllSubjects(perms)`.
 *    The prompt does not need the permission strings themselves; the AI
 *    proposes against the visible catalogue and the validator double-
 *    checks at the field-id level.
 */
export interface PromptPair {
  systemPrompt: string;
  userPrompt: string;
}

/** Compact field shape sent to the model — keeps prompts cheap. */
export interface CataloguedField {
  id: string;
  type: string;
  filterable: boolean;
  groupable: boolean;
  aggregations?: readonly string[];
  enum_values?: readonly string[];
}

/** Compact subject shape sent to the model. */
export interface CataloguedSubject {
  key: string;
  fields: CataloguedField[];
}

export function buildCatalogue(subjects: readonly SubjectDescriptor[]): CataloguedSubject[] {
  return subjects.map((subject) => ({
    key: subject.key,
    fields: subject.fields.map((field) => {
      const compact: CataloguedField = {
        id: field.id,
        type: field.type,
        filterable: field.filterable,
        groupable: field.groupable,
      };
      if (field.aggregations && field.aggregations.length > 0) {
        compact.aggregations = field.aggregations;
      }
      if (field.enum_values && field.enum_values.length > 0) {
        compact.enum_values = field.enum_values;
      }
      return compact;
    }),
  }));
}

export function renderCatalogueBlock(subjects: readonly SubjectDescriptor[]): string {
  const compact = buildCatalogue(subjects);
  return JSON.stringify(compact);
}

/**
 * Compose the full prompt pair. Caller passes:
 *  - the permission-scoped subjects (from `ReportsSubjectRegistryService`)
 *  - the user's natural-language question
 *
 * Returns:
 *  - `systemPrompt` — schema + examples + behaviour rules.
 *  - `userPrompt` — short user message that just contains the question.
 */
export function buildPrompt(
  subjects: readonly SubjectDescriptor[],
  userQuestion: string,
): PromptPair {
  const catalogueBlock = renderCatalogueBlock(subjects);
  const examplesBlock = renderExamplesBlock();
  const systemPrompt = getSystemPrompt(catalogueBlock, examplesBlock);

  const userPrompt = `Translate the user's question into the JSON shape described in the system prompt. Return ONLY the JSON object — no Markdown, no surrounding prose.

User question:
"${userQuestion}"`;

  return { systemPrompt, userPrompt };
}
