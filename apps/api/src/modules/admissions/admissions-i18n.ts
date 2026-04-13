// ─── Backend i18n for admissions invoice / payment strings ──────────────────
// Keyed by the tenant's `default_locale`. Falls back to English for unknown
// locales. Uses `{placeholder}` interpolation — simple string replacement.

export const ADMISSIONS_I18N = {
  en: {
    invoiceLineDescription: '{feeName} — {studentName}',
    paymentReasonWithRef: 'Admissions payment ({source}) — ref: {reference}',
    paymentReason: 'Admissions payment ({source})',
  },
  ar: {
    invoiceLineDescription: '{feeName} — {studentName}',
    paymentReasonWithRef: 'دفعة القبول ({source}) — المرجع: {reference}',
    paymentReason: 'دفعة القبول ({source})',
  },
} as const;

export type AdmissionsI18nKey = keyof typeof ADMISSIONS_I18N.en;

/**
 * Resolve a locale-aware admissions string with placeholder interpolation.
 * Falls back to English for any locale not in the map.
 */
export function admissionsT(
  locale: string,
  key: AdmissionsI18nKey,
  params?: Record<string, string>,
): string {
  const strings = ADMISSIONS_I18N[locale as keyof typeof ADMISSIONS_I18N] ?? ADMISSIONS_I18N.en;
  let result: string = strings[key];
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(`{${k}}`, v);
    }
  }
  return result;
}
