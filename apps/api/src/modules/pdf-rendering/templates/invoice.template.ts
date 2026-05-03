import type { PdfBranding } from '../pdf-rendering.service';

import { renderPdfTemplate } from './locales';

export function renderInvoice(data: unknown, branding: PdfBranding, locale: string): string {
  return renderPdfTemplate('invoice', locale, data, branding);
}
