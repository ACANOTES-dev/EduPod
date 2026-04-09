import { z } from 'zod';

// ─── Report Card content scope ───────────────────────────────────────────────
// Mirrors the Postgres enum `ReportCardContentScope`. Determines which data
// sources (grades, homework, attendance, behaviour) the generator pulls from.
// V1 ships with `grades_only`; the others are reserved placeholders.

export const REPORT_CARD_CONTENT_SCOPES = ['grades_only'] as const;

export const reportCardContentScopeSchema = z.enum(REPORT_CARD_CONTENT_SCOPES);

export type ReportCardContentScope = z.infer<typeof reportCardContentScopeSchema>;
