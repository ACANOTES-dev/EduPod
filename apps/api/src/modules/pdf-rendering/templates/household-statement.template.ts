import type { PdfBranding } from '../pdf-rendering.service';

import { renderHouseholdStatementAr } from './household-statement-ar.template';
import { renderHouseholdStatementEn } from './household-statement-en.template';
import { renderLegacyLocaleTemplate } from './locale-template';

export function renderHouseholdStatement(
  data: unknown,
  branding: PdfBranding,
  locale: string,
): string {
  return renderLegacyLocaleTemplate(
    locale,
    { en: renderHouseholdStatementEn, ar: renderHouseholdStatementAr },
    data,
    branding,
  );
}
