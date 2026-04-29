import type { PdfBranding } from '../pdf-rendering.service';

import { renderLegacyLocaleTemplate } from './locale-template';
import { renderPayslipAr } from './payslip-ar.template';
import { renderPayslipEn } from './payslip-en.template';

export function renderPayslip(data: unknown, branding: PdfBranding, locale: string): string {
  return renderLegacyLocaleTemplate(
    locale,
    { en: renderPayslipEn, ar: renderPayslipAr },
    data,
    branding,
  );
}
