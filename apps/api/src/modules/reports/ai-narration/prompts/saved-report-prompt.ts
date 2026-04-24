import type { QueryColumnDescriptor } from '@school/shared/reports';

/**
 * Prompt-version is a monotonic integer. Bump when the prompt text or the
 * shape of `data_json` we feed into the prompt changes — every cache key
 * folds the version in, so old caches automatically invalidate.
 */
export const SAVED_REPORT_NARRATION_PROMPT_VERSION = 1;

interface BuildArgs {
  /** The saved report's display name. */
  reportName: string;
  /** Description of the row subject ('Student', 'Invoice', etc.). */
  subjectLabel: string;
  /** Column descriptors so the model knows what each value means. */
  columns: QueryColumnDescriptor[];
  /** Total result-set size; the model sees a sample of rows below. */
  rowCount: number;
  /** Up to N preview rows. Already truncated by the caller. */
  sampleRows: Record<string, unknown>[];
}

/**
 * Build the narrator prompt for a saved custom-builder report. Receives a
 * compact summary (column descriptors + row count + sample rows) rather
 * than the full result set — large saved reports must not blow the
 * Anthropic context window. Output: a 1-paragraph (3-5 sentences)
 * description of what the report shows.
 */
export function build({
  reportName,
  subjectLabel,
  columns,
  rowCount,
  sampleRows,
}: BuildArgs): string {
  const columnList = columns
    .map((c) => `${c.id} (${c.label_key} — ${c.type})`)
    .join('\n');
  const sample = JSON.stringify(sampleRows, null, 2);

  return `You are a school analytics expert. Below is a custom report built by a school admin. Write a single 1-paragraph (3-5 sentence) summary of what the report shows. Be specific with numbers. Reference column names where useful. Do not invent data. Do not include greetings, closing phrases, or bullet points. Audience: school principal.

Report name: ${reportName}
Row subject: ${subjectLabel}
Total matching records: ${rowCount}

Columns:
${columnList}

Sample rows (up to first ${sampleRows.length} of ${rowCount}):
${sample}

Narrative:`;
}
