import type { PdfBranding } from '../pdf-rendering.service';

import { renderPdfTemplate } from './locales';

export function renderSafeguardingCompliance(
  data: unknown,
  branding: PdfBranding,
  locale: string,
): string {
  return renderPdfTemplate('safeguarding-compliance', locale, data, branding);
}
