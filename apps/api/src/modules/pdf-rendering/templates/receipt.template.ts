import type { PdfBranding } from '../pdf-rendering.service';

import { renderLegacyLocaleTemplate } from './locale-template';
import { renderReceiptAr } from './receipt-ar.template';
import { renderReceiptEn } from './receipt-en.template';

export function renderReceipt(data: unknown, branding: PdfBranding, locale: string): string {
  return renderLegacyLocaleTemplate(
    locale,
    { en: renderReceiptEn, ar: renderReceiptAr },
    data,
    branding,
  );
}
