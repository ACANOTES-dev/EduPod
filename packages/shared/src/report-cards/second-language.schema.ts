import { z } from 'zod';

// ─── Student preferred second language ───────────────────────────────────────
// V1 only validates Arabic. The list is intentionally extensible — future
// languages should be added here and to the wizard's language picker.

export const SUPPORTED_SECOND_LANGUAGES = ['ar'] as const;

export const preferredSecondLanguageSchema = z.enum(SUPPORTED_SECOND_LANGUAGES);

export type PreferredSecondLanguage = z.infer<typeof preferredSecondLanguageSchema>;
