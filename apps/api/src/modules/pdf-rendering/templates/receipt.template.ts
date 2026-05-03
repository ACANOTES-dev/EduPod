import type { PdfBranding } from '../pdf-rendering.service';

import { renderPdfTemplate } from './locales';

export function renderReceipt(data: unknown, branding: PdfBranding, locale: string): string {
  return renderPdfTemplate('receipt', locale, data, branding);
}
