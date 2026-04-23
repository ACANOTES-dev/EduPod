/**
 * Locale utilities that enforce the product's numeral-and-calendar policy:
 *
 *   "Western numerals (0-9) in both locales. Gregorian calendar in both
 *    locales." — CLAUDE.md, .claude/rules/frontend.md
 *
 * The Arabic `ar` BCP-47 locale defaults to Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩)
 * and may default to the Hijri calendar in some runtimes. We override both
 * via the Unicode extension subtags `u-nu-latn` (Latin numbering system) and
 * `u-ca-gregory` (Gregorian calendar) so that every number, currency, and
 * date renders consistently in both locales.
 *
 * Pass `fmtLocale(locale)` to `Intl.NumberFormat`, `Intl.DateTimeFormat`,
 * and `Date#toLocale*` calls instead of the raw locale string.
 */

/**
 * Returns a BCP-47 locale tag suitable for number and date formatting that
 * enforces Western digits and the Gregorian calendar for Arabic locales and
 * passes every other locale through unchanged.
 *
 * Optional `nonArabicFallback` preserves call-site intent where English
 * locales historically used a regional variant (e.g. `en-IE` for DD/MM
 * dates). It is ignored for Arabic — Arabic always rewrites to the safe
 * `ar-u-nu-latn-ca-gregory`.
 */
export function fmtLocale(
  locale: string | undefined | null,
  nonArabicFallback?: string,
): string {
  if (!locale) return nonArabicFallback ?? 'en';
  const lower = locale.toLowerCase();
  if (lower === 'ar' || lower.startsWith('ar-')) {
    // u-nu-latn  → Latin (Western) digits 0-9
    // u-ca-gregory → Gregorian calendar
    return 'ar-u-nu-latn-ca-gregory';
  }
  return nonArabicFallback ?? locale;
}
