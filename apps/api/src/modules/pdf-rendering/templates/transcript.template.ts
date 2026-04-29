import type { PdfBranding } from '../pdf-rendering.service';

import { renderLegacyLocaleTemplate } from './locale-template';
import { renderTranscriptAr } from './transcript-ar.template';
import { renderTranscriptEn } from './transcript-en.template';

export function renderTranscript(data: unknown, branding: PdfBranding, locale: string): string {
  return renderLegacyLocaleTemplate(
    locale,
    { en: renderTranscriptEn, ar: renderTranscriptAr },
    data,
    branding,
  );
}
