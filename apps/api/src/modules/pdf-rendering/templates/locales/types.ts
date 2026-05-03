import type { PdfBranding } from '../../pdf-rendering.service';

export const PDF_TEMPLATE_KEYS = [
  'des-inspection',
  'household-statement',
  'invoice',
  'pastoral-summary',
  'payslip',
  'receipt',
  'report-card',
  'report-card-modern',
  'safeguarding-compliance',
  'sst-activity',
  'transcript',
  'trip-leader-pack',
  'wellbeing-programme',
] as const;

export type PdfTemplateKey = (typeof PDF_TEMPLATE_KEYS)[number];

export const SUPPORTED_PDF_LOCALES = ['en', 'ar', 'fr', 'es', 'de', 'ga', 'it', 'ro'] as const;

export type PdfTemplateLocale = (typeof SUPPORTED_PDF_LOCALES)[number];

export type PdfTemplateRenderer = (data: unknown, branding: PdfBranding) => string;

export type PdfTemplateBundle = Record<PdfTemplateKey, PdfTemplateRenderer>;

const PDF_TEMPLATE_KEY_SET: ReadonlySet<string> = new Set(PDF_TEMPLATE_KEYS);
const PDF_TEMPLATE_LOCALE_SET: ReadonlySet<string> = new Set(SUPPORTED_PDF_LOCALES);

export function isPdfTemplateKey(templateKey: string): templateKey is PdfTemplateKey {
  return PDF_TEMPLATE_KEY_SET.has(templateKey);
}

export function isSupportedPdfLocale(locale: string): locale is PdfTemplateLocale {
  return PDF_TEMPLATE_LOCALE_SET.has(locale);
}
