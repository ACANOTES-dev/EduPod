import type { PdfBranding } from '../pdf-rendering.service';

import { renderPdfTemplate } from './locales';

export function renderTripLeaderPack(data: unknown, branding: PdfBranding, locale: string): string {
  return renderPdfTemplate('trip-leader-pack', locale, data, branding);
}
