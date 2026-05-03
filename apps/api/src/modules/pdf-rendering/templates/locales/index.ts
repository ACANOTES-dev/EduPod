import type { PdfBranding } from '../../pdf-rendering.service';

import { arabicPdfTemplates } from './ar';
import { germanPdfTemplates } from './de';
import { englishPdfTemplates } from './en';
import { spanishPdfTemplates } from './es';
import { frenchPdfTemplates } from './fr';
import { irishPdfTemplates } from './ga';
import { italianPdfTemplates } from './it';
import { romanianPdfTemplates } from './ro';
import {
  isPdfTemplateKey,
  isSupportedPdfLocale,
  PDF_TEMPLATE_KEYS,
  SUPPORTED_PDF_LOCALES,
} from './types';
import type {
  PdfTemplateBundle,
  PdfTemplateKey,
  PdfTemplateLocale,
  PdfTemplateRenderer,
} from './types';

export { isPdfTemplateKey, isSupportedPdfLocale, PDF_TEMPLATE_KEYS, SUPPORTED_PDF_LOCALES };
export type { PdfTemplateBundle, PdfTemplateKey, PdfTemplateLocale, PdfTemplateRenderer };

export const PDF_TEMPLATE_BUNDLES: Record<PdfTemplateLocale, PdfTemplateBundle> = {
  en: englishPdfTemplates,
  ar: arabicPdfTemplates,
  fr: frenchPdfTemplates,
  es: spanishPdfTemplates,
  de: germanPdfTemplates,
  ga: irishPdfTemplates,
  it: italianPdfTemplates,
  ro: romanianPdfTemplates,
};

export function getPdfTemplateRenderer(templateKey: string, locale: string): PdfTemplateRenderer {
  if (!isPdfTemplateKey(templateKey)) {
    throw new Error(`MISSING_PDF_TEMPLATE: "${templateKey}" is not a registered PDF template`);
  }

  if (!isSupportedPdfLocale(locale)) {
    throw new Error(`MISSING_PDF_TEMPLATE: locale "${locale}" is not supported for PDF output`);
  }

  return PDF_TEMPLATE_BUNDLES[locale][templateKey];
}

export function renderPdfTemplate(
  templateKey: PdfTemplateKey,
  locale: string,
  data: unknown,
  branding: PdfBranding,
): string {
  return getPdfTemplateRenderer(templateKey, locale)(data, branding);
}
