import type { PdfBranding } from '../pdf-rendering.service';

import { renderLegacyLocaleTemplate } from './locale-template';
import { renderPastoralSummaryAr } from './pastoral-summary-ar.template';
import { renderPastoralSummaryEn } from './pastoral-summary-en.template';

export function renderPastoralSummary(
  data: unknown,
  branding: PdfBranding,
  locale: string,
): string {
  return renderLegacyLocaleTemplate(
    locale,
    { en: renderPastoralSummaryEn, ar: renderPastoralSummaryAr },
    data,
    branding,
  );
}
