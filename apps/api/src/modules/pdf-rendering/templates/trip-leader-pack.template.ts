import type { PdfBranding } from '../pdf-rendering.service';

import { renderLegacyLocaleTemplate } from './locale-template';
import { renderTripLeaderPackAr } from './trip-leader-pack-ar.template';
import { renderTripLeaderPackEn } from './trip-leader-pack-en.template';

export function renderTripLeaderPack(data: unknown, branding: PdfBranding, locale: string): string {
  return renderLegacyLocaleTemplate(
    locale,
    { en: renderTripLeaderPackEn, ar: renderTripLeaderPackAr },
    data,
    branding,
  );
}
