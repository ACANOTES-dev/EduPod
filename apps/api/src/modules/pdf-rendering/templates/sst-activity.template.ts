import type { PdfBranding } from '../pdf-rendering.service';

import { renderLegacyLocaleTemplate } from './locale-template';
import { renderSstActivityAr } from './sst-activity-ar.template';
import { renderSstActivityEn } from './sst-activity-en.template';

export function renderSstActivity(data: unknown, branding: PdfBranding, locale: string): string {
  return renderLegacyLocaleTemplate(
    locale,
    { en: renderSstActivityEn, ar: renderSstActivityAr },
    data,
    branding,
  );
}
