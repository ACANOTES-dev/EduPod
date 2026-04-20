/**
 * Pure helpers for the AI parse modal (impl 19). Extracted so their behaviour
 * can be exercised by .spec.ts tests without mounting React.
 */

export type AiParsePolarity = 'positive' | 'negative';
export type AiParseSeverity = 'minor' | 'moderate' | 'major';

export function polarityLabelKey(polarity: AiParsePolarity): string {
  return `results.polarityValues.${polarity}`;
}

export function severityLabelKey(severity: AiParseSeverity): string {
  return `results.severityValues.${severity}`;
}

/**
 * Projects a confidence score (0..1 from the backend) into an integer
 * percentage, clamped to [0, 100]. NaN / non-finite input yields 0 so the
 * UI never shows "NaN%".
 */
export function formatConfidencePercent(score: number): number {
  if (!Number.isFinite(score)) return 0;
  const pct = Math.round(score * 100);
  if (pct < 0) return 0;
  if (pct > 100) return 100;
  return pct;
}

// ─── sessionStorage seam ──────────────────────────────────────────────────────
// The behaviour sub-hub (impl 14) stashes a prefill description under this
// key and redirects to /behaviour/incidents/new?from=ai-parse. Impl 19's
// new-incident page reads the key on mount and pops the modal with the
// stashed text pre-populated.

export const AI_PARSE_PREFILL_KEY = 'behaviourAiParsePrefill';
export const AI_PARSE_RESULT_KEY = 'behaviourAiParseResult';

export function readPrefillFromSession(): string | null {
  try {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(AI_PARSE_PREFILL_KEY);
  } catch (err) {
    console.warn('[AiParseProjection] sessionStorage unavailable', err);
    return null;
  }
}

export function clearPrefillFromSession(): void {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.removeItem(AI_PARSE_PREFILL_KEY);
  } catch (err) {
    console.warn('[AiParseProjection] sessionStorage unavailable', err);
  }
}
