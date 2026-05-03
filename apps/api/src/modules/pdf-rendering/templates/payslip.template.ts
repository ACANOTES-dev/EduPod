import type { PdfBranding } from '../pdf-rendering.service';

import { renderPdfTemplate } from './locales';

export function renderPayslip(data: unknown, branding: PdfBranding, locale: string): string {
  return renderPdfTemplate('payslip', locale, data, branding);
}
