import type { PdfBranding } from '../pdf-rendering.service';

import { renderLegacyLocaleTemplate } from './locale-template';
import { renderReportCardModernAr } from './report-card-modern-ar.template';
import { renderReportCardModernEn } from './report-card-modern-en.template';

export function renderReportCardModern(
  data: unknown,
  branding: PdfBranding,
  locale: string,
): string {
  return renderLegacyLocaleTemplate(
    locale,
    { en: renderReportCardModernEn, ar: renderReportCardModernAr },
    data,
    branding,
  );
}
