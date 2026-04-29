import type { PdfBranding } from '../pdf-rendering.service';

import { renderLegacyLocaleTemplate } from './locale-template';
import { renderSafeguardingComplianceAr } from './safeguarding-compliance-ar.template';
import { renderSafeguardingComplianceEn } from './safeguarding-compliance-en.template';

export function renderSafeguardingCompliance(
  data: unknown,
  branding: PdfBranding,
  locale: string,
): string {
  return renderLegacyLocaleTemplate(
    locale,
    { en: renderSafeguardingComplianceEn, ar: renderSafeguardingComplianceAr },
    data,
    branding,
  );
}
