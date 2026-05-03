import type { PdfBranding } from '../pdf-rendering.service';

import { renderPdfTemplate } from './locales';

export function renderWellbeingProgramme(
  data: unknown,
  branding: PdfBranding,
  locale: string,
): string {
  return renderPdfTemplate('wellbeing-programme', locale, data, branding);
}
