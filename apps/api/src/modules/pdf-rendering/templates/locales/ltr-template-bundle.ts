import { englishPdfTemplates } from './en';
import { applyPdfTextProfile } from './text-profiles';
import type { LtrPdfTemplateLocale } from './text-profiles';
import { PDF_TEMPLATE_KEYS } from './types';
import type { PdfTemplateBundle, PdfTemplateRenderer } from './types';

export function createLocalizedLtrPdfTemplateBundle(
  locale: LtrPdfTemplateLocale,
): PdfTemplateBundle {
  const bundle: Partial<Record<keyof PdfTemplateBundle, PdfTemplateRenderer>> = {};

  for (const templateKey of PDF_TEMPLATE_KEYS) {
    const renderEnglishTemplate = englishPdfTemplates[templateKey];
    bundle[templateKey] = (data, branding) =>
      applyPdfTextProfile(locale, renderEnglishTemplate(data, branding));
  }

  return bundle as PdfTemplateBundle;
}
