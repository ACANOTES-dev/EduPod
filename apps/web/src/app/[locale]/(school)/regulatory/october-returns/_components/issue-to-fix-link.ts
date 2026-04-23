// ─── Fix-link catalogue for October Returns ─────────────────────────────────
//
// Maps backend field identifiers (from both OCTOBER_RETURNS_FIELDS and the
// per-student problem catalogue in regulatory-october-returns.service.ts) to
// the screens where the data can be edited. Paths are locale-free — callers
// that render them into anchors/links are responsible for prepending the
// locale segment.

export type OctoberFieldKey =
  // Readiness fields (OCTOBER_RETURNS_FIELDS)
  | 'student_count'
  | 'gender_breakdown'
  | 'nationality_breakdown'
  | 'year_group_enrolment'
  | 'sen_students'
  | 'traveller_students'
  | 'eal_students'
  | 'new_entrants'
  | 'repeat_students'
  // Per-student issue fields (buildStudentProblems)
  | 'national_id'
  | 'date_of_birth'
  | 'gender'
  | 'nationality'
  | 'entry_date'
  | 'class_enrolment'
  | 'year_group'
  | 'address';

export const OCTOBER_FIELD_FIX_LINKS: Record<OctoberFieldKey, string> = {
  student_count: '/students',
  gender_breakdown: '/students',
  nationality_breakdown: '/students',
  year_group_enrolment: '/academic/classes',
  sen_students: '/sen',
  traveller_students: '/students',
  eal_students: '/students',
  new_entrants: '/students',
  repeat_students: '/students',

  national_id: '/students',
  date_of_birth: '/students',
  gender: '/students',
  nationality: '/students',
  entry_date: '/students',
  class_enrolment: '/academic/classes',
  year_group: '/academic/classes',
  address: '/students',
};

export function fixLinkForField(field: string, studentId?: string | null): string {
  const key = field as OctoberFieldKey;
  const base = OCTOBER_FIELD_FIX_LINKS[key] ?? '/students';
  if (studentId && base === '/students') return `${base}/${studentId}`;
  return base;
}

export function isKnownField(field: string): field is OctoberFieldKey {
  return field in OCTOBER_FIELD_FIX_LINKS;
}
