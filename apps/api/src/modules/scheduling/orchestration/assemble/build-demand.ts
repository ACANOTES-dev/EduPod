/**
 * Builds ``DemandV3[]`` from curriculum requirements + class-subject overrides.
 *
 * SCHED-023: class-subject overrides supersede the year-group baseline for
 * the specific (class, subject) pair. The builder emits one ``DemandV3`` row
 * per (class, subject) — either from the override or expanded from the
 * year-group baseline for every class in the year group.
 *
 * When ``strictClassSubjectOverride`` is true and an override's
 * periods_per_week differs from the baseline, a ``BadRequestException`` is
 * thrown to abort the run.
 */
import { BadRequestException } from '@nestjs/common';

import type { DemandV3 } from '@school/shared/scheduler';

import type {
  ClassSubjectAssignmentRow,
  ClassSubjectOverrideRow,
  CurriculumRow,
  YearGroupWithClasses,
} from './load-tenant-data';

export interface BuildDemandResult {
  demand: DemandV3[];
  /** Audit trail of overrides applied — consumed by build-constraint-snapshot. */
  overridesApplied: Array<{
    class_id: string;
    subject_id: string;
    baseline_periods: number | null;
    override_periods: number;
  }>;
}

export function buildDemand(
  yearGroups: YearGroupWithClasses[],
  curriculum: CurriculumRow[],
  classSubjectOverrides: ClassSubjectOverrideRow[],
  classSubjectAssignments: ClassSubjectAssignmentRow[],
  strictClassSubjectOverride: boolean,
): BuildDemandResult {
  const demand: DemandV3[] = [];
  const overridesApplied: BuildDemandResult['overridesApplied'] = [];

  // Curriculum Matrix filter: only fan out year-group curriculum to (class,
  // subject) pairs the school has explicitly assigned in the Matrix UI. If
  // the tenant has ZERO assignments we treat that as "Matrix not in use" and
  // fall back to the old fan-out-to-every-class behaviour — that's what the
  // stress-test tenants rely on, and it's a safe default for pre-Matrix
  // fixtures. Overrides (class_subject_requirements) always bypass the filter
  // because they're an explicit per-class opt-in and imply the user wants
  // that pair scheduled regardless of Matrix state.
  const assignmentKeys = new Set<string>(
    classSubjectAssignments.map((a) => `${a.class_id}::${a.subject_id}`),
  );
  const matrixInUse = assignmentKeys.size > 0;

  // Index: (year_group_id, subject_id) → baseline row
  const baselineMap = new Map<string, CurriculumRow>();
  for (const cr of curriculum) {
    baselineMap.set(`${cr.year_group_id}::${cr.subject_id}`, cr);
  }

  // Index: (class_id, subject_id) → override row
  const overrideMap = new Map<string, ClassSubjectOverrideRow>();
  const strictViolations: string[] = [];
  for (const ovr of classSubjectOverrides) {
    const baseline = baselineMap.get(`${ovr.year_group_id}::${ovr.subject_id}`);

    if (
      strictClassSubjectOverride &&
      (!baseline || baseline.min_periods_per_week !== ovr.periods_per_week)
    ) {
      strictViolations.push(
        baseline
          ? `class ${ovr.class_id} ${ovr.subject_name}: override says ${ovr.periods_per_week} periods/week, year-group says ${baseline.min_periods_per_week}`
          : `class ${ovr.class_id} ${ovr.subject_name}: override defines a subject absent from year-group curriculum`,
      );
      continue;
    }

    overrideMap.set(`${ovr.class_id}::${ovr.subject_id}`, ovr);
    overridesApplied.push({
      class_id: ovr.class_id,
      subject_id: ovr.subject_id,
      baseline_periods: baseline?.min_periods_per_week ?? null,
      override_periods: ovr.periods_per_week,
    });
  }

  if (strictClassSubjectOverride && strictViolations.length > 0) {
    throw new BadRequestException({
      code: 'CLASS_SUBJECT_OVERRIDE_MISMATCH',
      message:
        'One or more class-subject overrides conflict with the year-group curriculum and the tenant has opted into strict mismatch rejection.',
      details: { violations: strictViolations },
    });
  }

  // For each year-group curriculum row, emit one DemandV3 per class in the year group
  // — but only if the Matrix has assigned the (class, subject) pair (when the Matrix
  // is in use). Overrides are handled separately below.
  for (const cr of curriculum) {
    const yg = yearGroups.find((y) => y.id === cr.year_group_id);
    if (!yg) continue;

    for (const cls of yg.classes) {
      const key = `${cls.id}::${cr.subject_id}`;
      if (overrideMap.has(key)) continue; // Override wins — emitted below
      if (matrixInUse && !assignmentKeys.has(key)) continue; // Matrix says not this class

      demand.push({
        class_id: cls.id,
        subject_id: cr.subject_id,
        periods_per_week: cr.min_periods_per_week,
        max_per_day: cr.max_periods_per_day,
        required_doubles: cr.requires_double_period ? (cr.double_period_count ?? 1) : 0,
        required_room_type: null,
      });
    }
  }

  // Emit override rows
  for (const ovr of overrideMap.values()) {
    const baseline = baselineMap.get(`${ovr.year_group_id}::${ovr.subject_id}`);
    demand.push({
      class_id: ovr.class_id,
      subject_id: ovr.subject_id,
      periods_per_week: ovr.periods_per_week,
      max_per_day: ovr.max_periods_per_day ?? baseline?.max_periods_per_day ?? ovr.periods_per_week,
      required_doubles: ovr.requires_double_period ? (ovr.double_period_count ?? 1) : 0,
      required_room_type: ovr.required_room_type,
    });
  }

  return { demand, overridesApplied };
}
