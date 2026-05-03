import type { PdfBranding } from '../pdf-rendering.service';

import { renderPdfTemplate } from './locales';

export function renderDesInspection(data: unknown, branding: PdfBranding, locale: string): string {
  return renderPdfTemplate('des-inspection', locale, data, branding);
}
