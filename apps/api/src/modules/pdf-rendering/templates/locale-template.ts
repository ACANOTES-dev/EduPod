import type { PdfBranding } from '../pdf-rendering.service';

export type LegacyTemplatePair = {
  en: (data: unknown, branding: PdfBranding) => string;
  ar: (data: unknown, branding: PdfBranding) => string;
};

export function renderLegacyLocaleTemplate(
  locale: string,
  pair: LegacyTemplatePair,
  data: unknown,
  branding: PdfBranding,
): string {
  if (locale === 'ar') {
    return pair.ar(data, branding);
  }
  return pair.en(data, branding);
}
