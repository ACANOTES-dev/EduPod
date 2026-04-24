/**
 * Compliance field catalogue for regulatory reporting.
 * Every field declares its source, computation, and gap handling.
 * Version: v1 (2026-04-25)
 */

export type ComplianceFieldKey =
  | 'student_headcount'
  | 'attendance_rate_annual'
  | 'chronic_absenteeism_count'
  | 'exclusions_this_year'
  | 'sen_register_count'
  | 'safeguarding_concerns_raised_this_year'
  | 'critical_incidents_this_year'
  | 'staff_headcount'
  | 'teacher_headcount'
  | 'pupil_teacher_ratio'
  | 'qualified_teachers_percent'
  | 'vetting_current_percent'
  | 'staff_absence_rate_annual'
  | 'fees_collected_ytd'
  | 'outstanding_balance_total'
  | 'write_offs_ytd'
  | 'school_days_held'
  | 'instruction_hours_held'
  | 'teacher_absence_days_uncovered';

export type ComplianceFieldUnit = 'percent' | 'count' | 'hours' | 'ratio' | 'currency' | null;

export interface ComplianceField {
  key: ComplianceFieldKey;
  label_key: string;
  value: string | number | null;
  unit: ComplianceFieldUnit;
  source: string;
  last_verified_at: string;
  has_gap: boolean;
  gap_reason?: string;
}

export interface ComplianceReport {
  tenant: { name: string; academic_year: string };
  generated_at: string;
  fields: ComplianceField[];
  meta: { catalogue_version: string };
}

/**
 * Field catalogue definitions.
 * Each field includes metadata needed for:
 * - Display (label_key, unit)
 * - Aggregation (source description)
 * - Gap detection (whether we can reliably compute it)
 */
export const COMPLIANCE_FIELD_CATALOGUE = {
  // Student-facing
  student_headcount: {
    label_key: 'reports.compliance.student_headcount',
    unit: 'count' as ComplianceFieldUnit,
    description: 'Active students enrolled in the academic year, excluding inactive/withdrawn.',
  },
  attendance_rate_annual: {
    label_key: 'reports.compliance.attendance_rate_annual',
    unit: 'percent' as ComplianceFieldUnit,
    description: 'Cumulative attendance rate (present sessions / total expected) for the year.',
  },
  chronic_absenteeism_count: {
    label_key: 'reports.compliance.chronic_absenteeism_count',
    unit: 'count' as ComplianceFieldUnit,
    description: 'Count of students with attendance below 80% for the academic year.',
  },
  exclusions_this_year: {
    label_key: 'reports.compliance.exclusions_this_year',
    unit: 'count' as ComplianceFieldUnit,
    description:
      'Formal behaviour exclusions recorded this academic year (from behaviour_exclusion_case table).',
  },
  sen_register_count: {
    label_key: 'reports.compliance.sen_register_count',
    unit: 'count' as ComplianceFieldUnit,
    description:
      'Students with active SEN support plan or identified on the SEN register this year.',
  },
  safeguarding_concerns_raised_this_year: {
    label_key: 'reports.compliance.safeguarding_concerns_raised_this_year',
    unit: 'count' as ComplianceFieldUnit,
    description: 'New safeguarding_concern records created this academic year.',
  },
  critical_incidents_this_year: {
    label_key: 'reports.compliance.critical_incidents_this_year',
    unit: 'count' as ComplianceFieldUnit,
    description:
      'Critical-incident declarations recorded in the critical_incident table this academic year.',
  },

  // Staff-facing
  staff_headcount: {
    label_key: 'reports.compliance.staff_headcount',
    unit: 'count' as ComplianceFieldUnit,
    description: 'Active staff members employed this academic year.',
  },
  teacher_headcount: {
    label_key: 'reports.compliance.teacher_headcount',
    unit: 'count' as ComplianceFieldUnit,
    description: 'Active teaching staff members (role = teacher) this academic year.',
  },
  pupil_teacher_ratio: {
    label_key: 'reports.compliance.pupil_teacher_ratio',
    unit: 'ratio' as ComplianceFieldUnit,
    description: 'Student headcount divided by teacher headcount.',
  },
  qualified_teachers_percent: {
    label_key: 'reports.compliance.qualified_teachers_percent',
    unit: 'percent' as ComplianceFieldUnit,
    description:
      'Percentage of teaching staff with a recognised qualification — flagged as gap until a qualification field is added to the staff profile.',
  },
  vetting_current_percent: {
    label_key: 'reports.compliance.vetting_current_percent',
    unit: 'percent' as ComplianceFieldUnit,
    description: 'Percentage of staff with vetting status = active and not expired.',
  },
  staff_absence_rate_annual: {
    label_key: 'reports.compliance.staff_absence_rate_annual',
    unit: 'percent' as ComplianceFieldUnit,
    description:
      'Total staff absence days divided by total expected staff days this academic year.',
  },

  // Finance
  fees_collected_ytd: {
    label_key: 'reports.compliance.fees_collected_ytd',
    unit: 'currency' as ComplianceFieldUnit,
    description: 'Sum of all posted payment amounts recorded this academic year.',
  },
  outstanding_balance_total: {
    label_key: 'reports.compliance.outstanding_balance_total',
    unit: 'currency' as ComplianceFieldUnit,
    description: 'Current outstanding balance across all households.',
  },
  write_offs_ytd: {
    label_key: 'reports.compliance.write_offs_ytd',
    unit: 'currency' as ComplianceFieldUnit,
    description: 'Total amount written off as uncollectable this academic year.',
  },

  // Operations
  school_days_held: {
    label_key: 'reports.compliance.school_days_held',
    unit: 'count' as ComplianceFieldUnit,
    description:
      'Count of unique calendar dates with at least one scheduled attendance session this academic year.',
  },
  instruction_hours_held: {
    label_key: 'reports.compliance.instruction_hours_held',
    unit: 'hours' as ComplianceFieldUnit,
    description:
      'Sum of all scheduled class-session durations in hours — flagged as gap until session-duration is captured.',
  },
  teacher_absence_days_uncovered: {
    label_key: 'reports.compliance.teacher_absence_days_uncovered',
    unit: 'count' as ComplianceFieldUnit,
    description:
      'Count of teacher absence days this academic year that have no cover assignment recorded.',
  },
} as const satisfies Record<
  ComplianceFieldKey,
  { label_key: string; unit: ComplianceFieldUnit; description: string }
>;

export const COMPLIANCE_CATALOGUE_VERSION = 'v1';
