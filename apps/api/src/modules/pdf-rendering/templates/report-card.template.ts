import type { PdfBranding } from '../pdf-rendering.service';

import { renderPdfTemplate } from './locales';

export function renderReportCard(data: unknown, branding: PdfBranding, locale: string): string {
  return renderPdfTemplate('report-card', locale, data, branding);
}
