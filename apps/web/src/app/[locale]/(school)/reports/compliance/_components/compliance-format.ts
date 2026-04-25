import type { ComplianceField } from '@school/shared/reports';

/**
 * Pure helpers used by the compliance preview pane (impl 20).
 *
 * Extracted out so they can be unit-tested without rendering React.
 * The Jest config in `apps/web/jest.config.js` only picks up `*.spec.ts`
 * files (not `.tsx`), so any logic that needs coverage lives here.
 */

/**
 * Render a `ComplianceField`'s value to a user-facing string.
 *
 * - `null` (or undefined) renders as the em-dash fallback `—`.
 * - Numeric values are localised via `Intl.NumberFormat` with unit-aware
 *   suffixes:
 *     - `currency` → 2dp decimal (the symbol is the tenant's responsibility).
 *     - `percent`  → 1dp + `%` suffix.
 *     - `ratio`    → `1 : N` shape (used for pupil:teacher).
 *     - `hours`    → integer-locale + ` h` suffix.
 *     - default    → integer-locale.
 * - String values pass through.
 *
 * Honest gaps (`has_gap = true`) keep the same numeric path; the gap
 * styling is applied at the row level so a regulator never sees a
 * fabricated "0".
 */
export function formatComplianceValue(field: ComplianceField): string {
  if (field.value === null || field.value === undefined) return '—';

  if (typeof field.value === 'number') {
    if (field.unit === 'currency') {
      return new Intl.NumberFormat(undefined, {
        style: 'decimal',
        maximumFractionDigits: 2,
        minimumFractionDigits: 2,
      }).format(field.value);
    }
    if (field.unit === 'percent') {
      return `${field.value.toFixed(1)}%`;
    }
    if (field.unit === 'ratio') {
      return `1 : ${field.value.toFixed(1)}`;
    }
    if (field.unit === 'hours') {
      return `${field.value.toLocaleString()} h`;
    }
    return field.value.toLocaleString();
  }

  return String(field.value);
}

/**
 * Sum of fields where `has_gap === true`. A separate counter (rather
 * than recomputing in the render path) keeps the badge accessible to
 * screen readers and stable to changes in render order.
 */
export function countComplianceGaps(fields: ComplianceField[]): number {
  return fields.reduce((acc, f) => (f.has_gap ? acc + 1 : acc), 0);
}

/**
 * `Intl.RelativeTimeFormat` wrapper that picks the largest sensible unit.
 * The compliance preview shows "updated 5 minutes ago" / "updated yesterday"
 * style strings; full timestamps live in the metadata footer.
 *
 * Falls back to the raw ISO string when parsing fails — never throws.
 */
export function relativeTimeFromIso(
  iso: string,
  formatter: Intl.RelativeTimeFormat = new Intl.RelativeTimeFormat(undefined, {
    numeric: 'auto',
  }),
  now: number = Date.now(),
): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;

  const diffSec = Math.round((ts - now) / 1000);
  const absSec = Math.abs(diffSec);

  if (absSec < 60) return formatter.format(diffSec, 'second');
  if (absSec < 3600) return formatter.format(Math.round(diffSec / 60), 'minute');
  if (absSec < 86400) return formatter.format(Math.round(diffSec / 3600), 'hour');
  if (absSec < 30 * 86400) return formatter.format(Math.round(diffSec / 86400), 'day');

  return new Date(iso).toLocaleDateString();
}
