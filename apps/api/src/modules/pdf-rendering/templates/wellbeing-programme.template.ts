import type { PdfBranding } from '../pdf-rendering.service';

import { renderLegacyLocaleTemplate } from './locale-template';
import { renderWellbeingProgrammeAr } from './wellbeing-programme-ar.template';
import { renderWellbeingProgrammeEn } from './wellbeing-programme-en.template';

export function renderWellbeingProgramme(
  data: unknown,
  branding: PdfBranding,
  locale: string,
): string {
  return renderLegacyLocaleTemplate(
    locale,
    { en: renderWellbeingProgrammeEn, ar: renderWellbeingProgrammeAr },
    data,
    branding,
  );
}
