import { z } from 'zod';

/**
 * Canonical list of report subjects exposed by the custom builder's
 * subject registry. See reports-rebuild/PLAN.md §4.1 for the row-level
 * semantics and joinable-domain map for each subject.
 *
 * This list is curated — it is NOT auto-generated from Prisma. Adding a
 * new subject requires a corresponding field-tree file in
 * `apps/api/src/modules/reports/subject-registry/fields/` and a review
 * by the schema owner.
 */
export const REPORT_SUBJECT_KEYS = [
  'student',
  'staff',
  'household',
  'class',
  'invoice',
  'application',
  'behaviour_incident',
  'safeguarding_concern',
  'attendance_record',
  'grade',
  'payroll_entry',
] as const;

export type ReportSubjectKey = (typeof REPORT_SUBJECT_KEYS)[number];

export const reportSubjectKeySchema = z.enum(REPORT_SUBJECT_KEYS);
