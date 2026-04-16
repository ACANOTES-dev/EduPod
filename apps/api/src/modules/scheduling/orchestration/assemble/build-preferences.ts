/**
 * Builds ``PreferencesV3`` from teacher preferences, class room overrides,
 * curriculum soft signals, and tenant settings.
 *
 * SCHED-018: class_scheduling_requirements.preferred_room_id is surfaced
 * in ``class_preferences[].preferred_room_id`` so the solver's greedy
 * room assignment respects it.
 */
import type {
  ClassPreferenceV3,
  GlobalSoftWeightsV3,
  PreferencesV3,
  PreferenceTypeV3,
  PreferencePriorityV3,
  TeacherPreferenceV3,
} from '@school/shared/scheduler';

import type {
  ClassRoomOverrideRecord,
  CurriculumRow,
  TeacherRecord,
  YearGroupWithClasses,
} from './load-tenant-data';

export function buildPreferences(
  yearGroups: YearGroupWithClasses[],
  curriculum: CurriculumRow[],
  teachers: TeacherRecord[],
  classRoomOverrides: ClassRoomOverrideRecord[],
  tenantSettings: Record<string, unknown> | null,
): PreferencesV3 {
  // ─── Class preferences ──────────────────────────────────────────────────

  const classPreferences: ClassPreferenceV3[] = [];

  // Curriculum-level soft signals (preferred_periods_per_week)
  for (const cr of curriculum) {
    const yg = yearGroups.find((y) => y.id === cr.year_group_id);
    if (!yg) continue;
    for (const cls of yg.classes) {
      if (cr.preferred_periods_per_week !== null) {
        classPreferences.push({
          class_id: cls.id,
          subject_id: cr.subject_id,
          preferred_periods_per_week: cr.preferred_periods_per_week,
          preferred_room_id: null,
        });
      }
    }
  }

  // SCHED-018: class-level room overrides
  const roomOverrideMap = new Map<string, ClassRoomOverrideRecord>();
  for (const ovr of classRoomOverrides) {
    roomOverrideMap.set(ovr.class_id, ovr);
  }

  // Merge room overrides into class preferences (or create new entries)
  for (const ovr of classRoomOverrides) {
    if (ovr.preferred_room_id === null) continue;
    // Find all (class, subject) pairs for this class and attach room preference
    const existingForClass = classPreferences.filter((cp) => cp.class_id === ovr.class_id);
    if (existingForClass.length > 0) {
      for (const cp of existingForClass) {
        cp.preferred_room_id = ovr.preferred_room_id;
      }
    } else {
      // Class has no curriculum-level preferences — add a room-only entry for every subject
      const classYg = yearGroups.find((yg) => yg.classes.some((c) => c.id === ovr.class_id));
      if (classYg) {
        const subjects = new Set(
          curriculum.filter((cr) => cr.year_group_id === classYg.id).map((cr) => cr.subject_id),
        );
        for (const subjectId of subjects) {
          classPreferences.push({
            class_id: ovr.class_id,
            subject_id: subjectId,
            preferred_periods_per_week: null,
            preferred_room_id: ovr.preferred_room_id,
          });
        }
      }
    }
  }

  // ─── Teacher preferences ────────────────────────────────────────────────

  const teacherPreferences: TeacherPreferenceV3[] = [];
  for (const teacher of teachers) {
    for (const pref of teacher.preferences) {
      teacherPreferences.push({
        id: pref.id,
        teacher_staff_id: teacher.staff_profile_id,
        preference_type: pref.preference_type as PreferenceTypeV3,
        preference_payload: pref.preference_payload,
        priority: pref.priority as PreferencePriorityV3,
      });
    }
  }

  // ─── Global weights + preference weights from tenant settings ───────────

  const prefWeights = (tenantSettings?.preferenceWeights as Record<string, number>) ?? {};
  const globalWeights = (tenantSettings?.globalSoftWeights as Record<string, number>) ?? {};

  const global_weights: GlobalSoftWeightsV3 = {
    even_subject_spread: globalWeights.evenSubjectSpread ?? 2,
    minimise_teacher_gaps: globalWeights.minimiseTeacherGaps ?? 1,
    room_consistency: globalWeights.roomConsistency ?? 1,
    workload_balance: globalWeights.workloadBalance ?? 1,
    break_duty_balance: globalWeights.breakDutyBalance ?? 1,
  };

  return {
    class_preferences: classPreferences,
    teacher_preferences: teacherPreferences,
    global_weights,
    preference_weights: {
      low: prefWeights.low ?? 1,
      medium: prefWeights.medium ?? 2,
      high: prefWeights.high ?? 3,
    },
  };
}
