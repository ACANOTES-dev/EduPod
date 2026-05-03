import type { PdfBranding } from '../pdf-rendering.service';

import { renderPdfTemplate } from './locales';

export function renderHouseholdStatement(
  data: unknown,
  branding: PdfBranding,
  locale: string,
): string {
  return renderPdfTemplate('household-statement', locale, data, branding);
}
