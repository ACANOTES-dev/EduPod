import type { ComplianceFieldKey } from '@school/shared/reports';

/**
 * Compliance field category map (impl 20 — UI side).
 *
 * Mirrors the four user-facing groupings from the spec
 * (Student-facing / Staff-facing / Finance / Operations). The catalogue
 * version on the API is `v1`; if a future API version adds new fields,
 * extend this map alongside the catalogue change.
 *
 * Translation keys live under `reports.compliance.field.<field_key>`
 * for the field label and `reports.compliance.category.<category>` for
 * the group heading. Missing labels render as the field key — visible
 * but not friendly — so a missing translation never silently hides a
 * compliance row from a regulator.
 */

export const COMPLIANCE_CATEGORIES = [
  'student_facing',
  'staff_facing',
  'finance',
  'operations',
] as const;

export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];

export const COMPLIANCE_FIELDS_BY_CATEGORY: Record<ComplianceCategory, ComplianceFieldKey[]> = {
  student_facing: [
    'student_headcount',
    'attendance_rate_annual',
    'chronic_absenteeism_count',
    'exclusions_this_year',
    'sen_register_count',
    'safeguarding_concerns_raised_this_year',
    'critical_incidents_this_year',
  ],
  staff_facing: [
    'staff_headcount',
    'teacher_headcount',
    'pupil_teacher_ratio',
    'qualified_teachers_percent',
    'vetting_current_percent',
    'staff_absence_rate_annual',
  ],
  finance: ['fees_collected_ytd', 'outstanding_balance_total', 'write_offs_ytd'],
  operations: ['school_days_held', 'instruction_hours_held', 'teacher_absence_days_uncovered'],
};
