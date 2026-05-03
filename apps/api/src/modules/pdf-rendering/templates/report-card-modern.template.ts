import type { PdfBranding } from '../pdf-rendering.service';

import { renderPdfTemplate } from './locales';

export function renderReportCardModern(
  data: unknown,
  branding: PdfBranding,
  locale: string,
): string {
  return renderPdfTemplate('report-card-modern', locale, data, branding);
}
