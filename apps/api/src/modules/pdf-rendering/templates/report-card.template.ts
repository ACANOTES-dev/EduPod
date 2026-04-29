import type { PdfBranding } from '../pdf-rendering.service';

import { renderLegacyLocaleTemplate } from './locale-template';
import { renderReportCardAr } from './report-card-ar.template';
import { renderReportCardEn } from './report-card-en.template';

export function renderReportCard(data: unknown, branding: PdfBranding, locale: string): string {
  return renderLegacyLocaleTemplate(
    locale,
    { en: renderReportCardEn, ar: renderReportCardAr },
    data,
    branding,
  );
}
