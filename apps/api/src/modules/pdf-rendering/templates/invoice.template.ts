import type { PdfBranding } from '../pdf-rendering.service';

import { renderInvoiceAr } from './invoice-ar.template';
import { renderInvoiceEn } from './invoice-en.template';
import { renderLegacyLocaleTemplate } from './locale-template';

export function renderInvoice(data: unknown, branding: PdfBranding, locale: string): string {
  return renderLegacyLocaleTemplate(
    locale,
    { en: renderInvoiceEn, ar: renderInvoiceAr },
    data,
    branding,
  );
}
