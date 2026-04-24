/**
 * Shared types and Zod schemas for the reports rebuild. Consumed by the
 * API, worker, and web layers via the `@school/shared/reports` subpath
 * export.
 *
 * Surface:
 *   - REPORT_SUBJECT_KEYS / ReportSubjectKey: the 11 curated subjects.
 *   - REPORTS_AI_MODULE_KEYS: tenant AI flag module keys for reports.
 *   - REPORT_KPI_KEYS: the 10 dashboard KPI identifiers.
 *   - SavedReportDraft CRUD schemas: builder auto-save contract.
 *   - Share request schema: report → inbox broadcast request.
 */
export * from './subjects';
export * from './ai-flags';
export * from './kpi';
export * from './saved-report-draft';
export * from './share';
