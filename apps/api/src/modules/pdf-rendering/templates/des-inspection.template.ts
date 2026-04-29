import type { PdfBranding } from '../pdf-rendering.service';

import { renderDesInspectionAr } from './des-inspection-ar.template';
import { renderDesInspectionEn } from './des-inspection-en.template';
import { renderLegacyLocaleTemplate } from './locale-template';

export function renderDesInspection(data: unknown, branding: PdfBranding, locale: string): string {
  return renderLegacyLocaleTemplate(
    locale,
    { en: renderDesInspectionEn, ar: renderDesInspectionAr },
    data,
    branding,
  );
}
