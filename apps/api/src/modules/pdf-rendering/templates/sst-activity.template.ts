import type { PdfBranding } from '../pdf-rendering.service';

import { renderPdfTemplate } from './locales';

export function renderSstActivity(data: unknown, branding: PdfBranding, locale: string): string {
  return renderPdfTemplate('sst-activity', locale, data, branding);
}
