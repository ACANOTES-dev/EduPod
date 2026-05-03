import type { PdfBranding } from '../pdf-rendering.service';

import { renderPdfTemplate } from './locales';

export function renderPastoralSummary(
  data: unknown,
  branding: PdfBranding,
  locale: string,
): string {
  return renderPdfTemplate('pastoral-summary', locale, data, branding);
}
