import type { TeacherInputV2 } from './types-v2';

export type TeacherAssignmentResolution =
  | { mode: 'pinned'; teacher_id: string }
  | { mode: 'pool'; teacher_ids: string[] }
  | { mode: 'missing' };

/**
 * Resolve the teacher candidates for a `(class, subject)` curriculum variable.
 *
 * Two-step lookup:
 *   1. Look for a pin — a competency whose `class_id` matches the target class.
 *      If one exists, that teacher is fixed.
 *   2. Otherwise, look for pool entries — competencies with `class_id === null`
 *      for the same `(year_group, subject)`. Every matching teacher is a candidate.
 *   3. If neither, return `missing`.
 *
 * If multiple pins exist for the same `(class, subject)` (the unique index
 * should prevent this, but defend anyway), the first match wins.
 */
export function resolveTeacherCandidates(
  teachers: TeacherInputV2[],
  classId: string,
  yearGroupId: string,
  subjectId: string,
): TeacherAssignmentResolution {
  for (const t of teachers) {
    const pin = t.competencies.find(
      (c) =>
        c.class_id === classId && c.subject_id === subjectId && c.year_group_id === yearGroupId,
    );
    if (pin) {
      return { mode: 'pinned', teacher_id: t.staff_profile_id };
    }
  }

  const poolIds: string[] = [];
  for (const t of teachers) {
    const poolEntry = t.competencies.find(
      (c) => c.class_id === null && c.subject_id === subjectId && c.year_group_id === yearGroupId,
    );
    if (poolEntry) poolIds.push(t.staff_profile_id);
  }

  if (poolIds.length > 0) {
    return { mode: 'pool', teacher_ids: poolIds };
  }

  return { mode: 'missing' };
}

/**
 * Lightweight wrapper that reports only the assignment mode. Useful for
 * prerequisite checks and diagnostics that don't need the teacher IDs.
 */
export function getTeacherAssignmentMode(
  teachers: TeacherInputV2[],
  classId: string,
  yearGroupId: string,
  subjectId: string,
): TeacherAssignmentResolution['mode'] {
  return resolveTeacherCandidates(teachers, classId, yearGroupId, subjectId).mode;
}
