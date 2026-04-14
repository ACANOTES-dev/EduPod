import { Injectable, NotFoundException } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Output types ─────────────────────────────────────────────────────────────

export type DiagnosticSeverity = 'critical' | 'high' | 'medium' | 'info';

export type DiagnosticCategory =
  | 'teacher_supply_shortage'
  | 'workload_cap_hit'
  | 'availability_pinch'
  | 'unassigned_slots';

export interface Diagnostic {
  id: string;
  severity: DiagnosticSeverity;
  category: DiagnosticCategory;
  title: string;
  description: string;
  recommendation: string;
  affected: {
    subject?: { id: string; name: string };
    year_group?: { id: string; name: string };
    classes?: Array<{ id: string; name: string }>;
    teachers?: Array<{ id: string; name: string }>;
  };
  metrics?: Record<string, number>;
}

export interface DiagnosticsSummary {
  total_unassigned_periods: number;
  critical_issues: number;
  high_issues: number;
  medium_issues: number;
  can_proceed: boolean;
}

export interface DiagnosticsResult {
  summary: DiagnosticsSummary;
  diagnostics: Diagnostic[];
}

// ─── Internal shapes read from config_snapshot ────────────────────────────────

interface SnapshotSection {
  class_id: string;
  class_name: string;
  student_count?: number;
}

interface SnapshotYearGroup {
  year_group_id: string;
  year_group_name: string;
  sections: SnapshotSection[];
  period_grid?: unknown[];
}

interface SnapshotCurriculum {
  year_group_id: string;
  subject_id: string;
  subject_name: string;
  min_periods_per_week: number;
  max_periods_per_day: number;
}

interface SnapshotCompetency {
  subject_id: string;
  year_group_id: string;
  class_id: string | null;
}

interface SnapshotTeacher {
  staff_profile_id: string;
  name: string;
  competencies: SnapshotCompetency[];
  availability: Array<{ weekday: number; from: string; to: string }>;
  max_periods_per_week: number | null;
  max_periods_per_day: number | null;
}

interface UnassignedEntry {
  class_id: string;
  subject_id: string;
  year_group_id: string;
  periods_remaining: number;
  reason: string;
}

interface ResultEntry {
  class_id: string;
  subject_id: string | null;
  year_group_id: string;
  teacher_staff_id: string | null;
  weekday: number;
  period_order: number;
}

// Default max periods per week for a single teacher when no explicit cap
// is configured. Used to decide whether per-teacher implied load is feasible.
const DEFAULT_MAX_PERIODS_PER_WEEK = 25;

@Injectable()
export class SchedulingDiagnosticsService {
  constructor(private readonly prisma: PrismaService) {}

  async analyse(tenantId: string, runId: string): Promise<DiagnosticsResult> {
    const run = await this.prisma.schedulingRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
      select: {
        id: true,
        status: true,
        result_json: true,
        config_snapshot: true,
      },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${runId}" not found`,
      });
    }

    const snapshot = (run.config_snapshot ?? {}) as Record<string, unknown>;
    const result = (run.result_json ?? {}) as Record<string, unknown>;

    const unassigned = Array.isArray(result['unassigned'])
      ? (result['unassigned'] as UnassignedEntry[])
      : [];
    const entries = Array.isArray(result['entries']) ? (result['entries'] as ResultEntry[]) : [];
    const yearGroups = Array.isArray(snapshot['year_groups'])
      ? (snapshot['year_groups'] as SnapshotYearGroup[])
      : [];
    const curriculum = Array.isArray(snapshot['curriculum'])
      ? (snapshot['curriculum'] as SnapshotCurriculum[])
      : [];
    const teachers = Array.isArray(snapshot['teachers'])
      ? (snapshot['teachers'] as SnapshotTeacher[])
      : [];

    const totalUnassignedPeriods = unassigned.reduce(
      (sum, u) => sum + (u.periods_remaining ?? 0),
      0,
    );

    const diagnostics: Diagnostic[] = [];

    // Build lookup maps once for reuse across passes.
    const classNameById = new Map<string, string>();
    const yearGroupNameById = new Map<string, string>();
    for (const yg of yearGroups) {
      yearGroupNameById.set(yg.year_group_id, yg.year_group_name);
      for (const s of yg.sections ?? []) {
        classNameById.set(s.class_id, s.class_name);
      }
    }
    const subjectNameById = new Map<string, string>();
    for (const c of curriculum) {
      subjectNameById.set(c.subject_id, c.subject_name);
    }

    // ── Pass 1: teacher supply shortage ─────────────────────────────────────
    diagnostics.push(
      ...this.analyseSupplyShortage({
        unassigned,
        yearGroups,
        curriculum,
        teachers,
        classNameById,
        yearGroupNameById,
        subjectNameById,
      }),
    );

    // ── Pass 2: workload cap hit ────────────────────────────────────────────
    diagnostics.push(
      ...this.analyseWorkloadCaps({
        entries,
        teachers,
      }),
    );

    // ── Pass 3: availability pinch ──────────────────────────────────────────
    diagnostics.push(
      ...this.analyseAvailabilityPinch({
        unassigned,
        curriculum,
        teachers,
        yearGroupNameById,
        subjectNameById,
        diagnosedSubjectYgs: new Set(
          diagnostics
            .filter((d) => d.category === 'teacher_supply_shortage')
            .map((d) => `${d.affected.subject?.id}|${d.affected.year_group?.id}`),
        ),
      }),
    );

    // ── Pass 4: fallback listing for any remaining unassigned ───────────────
    const remainingSubjectYgs = new Set<string>();
    for (const u of unassigned) {
      const key = `${u.subject_id}|${u.year_group_id}`;
      const alreadyDiagnosed = diagnostics.some(
        (d) => `${d.affected.subject?.id ?? ''}|${d.affected.year_group?.id ?? ''}` === key,
      );
      if (!alreadyDiagnosed) remainingSubjectYgs.add(key);
    }
    diagnostics.push(
      ...this.buildUnassignedFallback({
        unassigned,
        remainingSubjectYgs,
        classNameById,
        yearGroupNameById,
        subjectNameById,
      }),
    );

    const summary: DiagnosticsSummary = {
      total_unassigned_periods: totalUnassignedPeriods,
      critical_issues: diagnostics.filter((d) => d.severity === 'critical').length,
      high_issues: diagnostics.filter((d) => d.severity === 'high').length,
      medium_issues: diagnostics.filter((d) => d.severity === 'medium').length,
      can_proceed: totalUnassignedPeriods === 0,
    };

    return { summary, diagnostics };
  }

  // ─── Supply shortage: demand vs qualified-teacher count ──────────────────

  private analyseSupplyShortage(ctx: {
    unassigned: UnassignedEntry[];
    yearGroups: SnapshotYearGroup[];
    curriculum: SnapshotCurriculum[];
    teachers: SnapshotTeacher[];
    classNameById: Map<string, string>;
    yearGroupNameById: Map<string, string>;
    subjectNameById: Map<string, string>;
  }): Diagnostic[] {
    const out: Diagnostic[] = [];

    // Group unassigned by (subject_id, year_group_id).
    const bySubjectYg = new Map<string, UnassignedEntry[]>();
    for (const u of ctx.unassigned) {
      const key = `${u.subject_id}|${u.year_group_id}`;
      const list = bySubjectYg.get(key) ?? [];
      list.push(u);
      bySubjectYg.set(key, list);
    }

    // Class count per year group, for computing total demand.
    const classCountByYg = new Map<string, number>();
    for (const yg of ctx.yearGroups) {
      classCountByYg.set(yg.year_group_id, yg.sections?.length ?? 0);
    }

    for (const [key, group] of bySubjectYg.entries()) {
      const [subjectId, yearGroupId] = key.split('|');
      if (!subjectId || !yearGroupId) continue;

      // Qualified teachers = pool or pin for this (subject, yg).
      const qualified = ctx.teachers.filter((t) =>
        t.competencies.some((c) => c.subject_id === subjectId && c.year_group_id === yearGroupId),
      );
      const supply = qualified.length;

      // Demand = min_periods_per_week × class_count.
      const curr = ctx.curriculum.find(
        (c) => c.subject_id === subjectId && c.year_group_id === yearGroupId,
      );
      if (!curr) continue;
      const classCount = classCountByYg.get(yearGroupId) ?? 0;
      const demand = curr.min_periods_per_week * classCount;

      if (supply === 0 || demand === 0) continue;

      // Max feasible per teacher: use min across qualified teachers' caps,
      // fall back to a safe default if none set.
      const caps = qualified
        .map((t) => t.max_periods_per_week ?? DEFAULT_MAX_PERIODS_PER_WEEK)
        .filter((n) => n > 0);
      const maxFeasible = caps.length > 0 ? Math.min(...caps) : DEFAULT_MAX_PERIODS_PER_WEEK;
      const impliedLoad = demand / supply;

      if (impliedLoad <= maxFeasible) continue; // not a supply problem

      const additionalTeachersNeeded = Math.max(1, Math.ceil(demand / maxFeasible) - supply);
      const unassignedPeriods = group.reduce((sum, u) => sum + (u.periods_remaining ?? 0), 0);
      const subjectName = ctx.subjectNameById.get(subjectId) ?? subjectId;
      const ygName = ctx.yearGroupNameById.get(yearGroupId) ?? yearGroupId;
      const affectedClasses = [...new Set(group.map((u) => u.class_id))].map((id) => ({
        id,
        name: ctx.classNameById.get(id) ?? id,
      }));

      out.push({
        id: `supply-${subjectId}-${yearGroupId}`,
        severity: 'critical',
        category: 'teacher_supply_shortage',
        title: `Not enough ${subjectName} teachers for ${ygName}`,
        description:
          `${subjectName} in ${ygName} needs ${demand} periods/week across ${classCount} class(es), ` +
          `but only ${supply} teacher(s) are qualified — that would require ${Math.round(impliedLoad)} ` +
          `periods/week each, above the ${maxFeasible}/week cap. ${unassignedPeriods} period(s) went unplaced.`,
        recommendation:
          `Add at least ${additionalTeachersNeeded} more teacher(s) qualified for ${subjectName} in ${ygName}, ` +
          `or broaden an existing teacher's competencies to cover this subject/year group.`,
        affected: {
          subject: { id: subjectId, name: subjectName },
          year_group: { id: yearGroupId, name: ygName },
          classes: affectedClasses,
          teachers: qualified.map((t) => ({ id: t.staff_profile_id, name: t.name })),
        },
        metrics: {
          supply,
          demand_periods_per_week: demand,
          implied_load_per_teacher: Math.round(impliedLoad),
          max_feasible_per_teacher: maxFeasible,
          unassigned_periods: unassignedPeriods,
          additional_teachers_needed: additionalTeachersNeeded,
        },
      });
    }

    return out;
  }

  // ─── Workload cap hit: teachers at or above their weekly cap ─────────────

  private analyseWorkloadCaps(ctx: {
    entries: ResultEntry[];
    teachers: SnapshotTeacher[];
  }): Diagnostic[] {
    const out: Diagnostic[] = [];
    const perTeacher = new Map<string, number>();
    for (const e of ctx.entries) {
      if (!e.teacher_staff_id) continue;
      perTeacher.set(e.teacher_staff_id, (perTeacher.get(e.teacher_staff_id) ?? 0) + 1);
    }
    const maxedOut: Array<{ id: string; name: string; periods: number; cap: number }> = [];
    for (const t of ctx.teachers) {
      const cap = t.max_periods_per_week ?? DEFAULT_MAX_PERIODS_PER_WEEK;
      const assigned = perTeacher.get(t.staff_profile_id) ?? 0;
      if (cap > 0 && assigned >= cap) {
        maxedOut.push({ id: t.staff_profile_id, name: t.name, periods: assigned, cap });
      }
    }
    if (maxedOut.length === 0) return out;

    out.push({
      id: `workload-cap`,
      severity: 'high',
      category: 'workload_cap_hit',
      title: `${maxedOut.length} teacher(s) at their weekly load cap`,
      description:
        `These teachers are already scheduled at or beyond their configured ${DEFAULT_MAX_PERIODS_PER_WEEK}-period weekly maximum. ` +
        `Any additional lessons would push them over.`,
      recommendation:
        `If more periods need to be placed, raise these teachers' max_periods_per_week in /scheduling/teacher-config, ` +
        `or train/hire more staff qualified for the affected subjects.`,
      affected: {
        teachers: maxedOut.map((t) => ({ id: t.id, name: t.name })),
      },
      metrics: { teachers_at_cap: maxedOut.length },
    });

    return out;
  }

  // ─── Availability pinch: not enough teacher-hours to cover demand ─────────

  private analyseAvailabilityPinch(ctx: {
    unassigned: UnassignedEntry[];
    curriculum: SnapshotCurriculum[];
    teachers: SnapshotTeacher[];
    yearGroupNameById: Map<string, string>;
    subjectNameById: Map<string, string>;
    diagnosedSubjectYgs: Set<string>;
  }): Diagnostic[] {
    const out: Diagnostic[] = [];

    const bySubjectYg = new Map<string, UnassignedEntry[]>();
    for (const u of ctx.unassigned) {
      const key = `${u.subject_id}|${u.year_group_id}`;
      if (ctx.diagnosedSubjectYgs.has(key)) continue; // already flagged as supply shortage
      const list = bySubjectYg.get(key) ?? [];
      list.push(u);
      bySubjectYg.set(key, list);
    }

    for (const [key, group] of bySubjectYg.entries()) {
      const [subjectId, yearGroupId] = key.split('|');
      if (!subjectId || !yearGroupId) continue;

      const qualified = ctx.teachers.filter((t) =>
        t.competencies.some((c) => c.subject_id === subjectId && c.year_group_id === yearGroupId),
      );
      if (qualified.length === 0) continue;

      // Sum total available periods per week across qualified teachers.
      // Each availability row contributes roughly (end-start)/50min periods.
      const totalAvailablePeriods = qualified.reduce((sum, t) => {
        const perTeacher = t.availability.reduce((inner, a) => {
          const minutes = this.timeToMinutes(a.to) - this.timeToMinutes(a.from);
          return inner + Math.max(0, Math.floor(minutes / 50));
        }, 0);
        return sum + perTeacher;
      }, 0);

      const unassignedPeriods = group.reduce((sum, u) => sum + (u.periods_remaining ?? 0), 0);
      if (unassignedPeriods === 0) continue;
      // Flag when total availability is below the unplaced demand by a clear
      // margin — otherwise the root cause is likely class-conflict, not
      // teacher-hour supply.
      if (totalAvailablePeriods >= unassignedPeriods * 2) continue;

      const subjectName = ctx.subjectNameById.get(subjectId) ?? subjectId;
      const ygName = ctx.yearGroupNameById.get(yearGroupId) ?? yearGroupId;

      out.push({
        id: `availability-${subjectId}-${yearGroupId}`,
        severity: 'high',
        category: 'availability_pinch',
        title: `Tight teacher availability for ${subjectName} in ${ygName}`,
        description:
          `Qualified teachers collectively have ~${totalAvailablePeriods} teaching periods/week available, ` +
          `which is tight against the ${unassignedPeriods} unplaced period(s) for this subject.`,
        recommendation:
          `Extend weekly availability windows in /scheduling/availability for teachers qualified in ` +
          `${subjectName}, or spread more of the ${subjectName} load across additional teachers.`,
        affected: {
          subject: { id: subjectId, name: subjectName },
          year_group: { id: yearGroupId, name: ygName },
          teachers: qualified.map((t) => ({ id: t.staff_profile_id, name: t.name })),
        },
        metrics: {
          total_available_periods: totalAvailablePeriods,
          unassigned_periods: unassignedPeriods,
        },
      });
    }

    return out;
  }

  // ─── Fallback: list unassigned that didn't fit a specific diagnosis ──────

  private buildUnassignedFallback(ctx: {
    unassigned: UnassignedEntry[];
    remainingSubjectYgs: Set<string>;
    classNameById: Map<string, string>;
    yearGroupNameById: Map<string, string>;
    subjectNameById: Map<string, string>;
  }): Diagnostic[] {
    const out: Diagnostic[] = [];

    for (const key of ctx.remainingSubjectYgs) {
      const [subjectId, yearGroupId] = key.split('|');
      if (!subjectId || !yearGroupId) continue;
      const group = ctx.unassigned.filter(
        (u) => u.subject_id === subjectId && u.year_group_id === yearGroupId,
      );
      if (group.length === 0) continue;

      const subjectName = ctx.subjectNameById.get(subjectId) ?? subjectId;
      const ygName = ctx.yearGroupNameById.get(yearGroupId) ?? yearGroupId;
      const unassignedPeriods = group.reduce((sum, u) => sum + (u.periods_remaining ?? 0), 0);
      const affectedClasses = [...new Set(group.map((u) => u.class_id))].map((id) => ({
        id,
        name: ctx.classNameById.get(id) ?? id,
      }));

      out.push({
        id: `unassigned-${subjectId}-${yearGroupId}`,
        severity: 'medium',
        category: 'unassigned_slots',
        title: `${subjectName} in ${ygName}: ${unassignedPeriods} period(s) unplaced`,
        description:
          `The solver couldn't place ${unassignedPeriods} ${subjectName} period(s) across ${affectedClasses.length} class(es). ` +
          `Likely cause: tight class or room conflicts — the period grid may be saturated for this subject.`,
        recommendation:
          `Review /scheduling/period-grid and /scheduling/room-closures. If the grid is packed, consider pinning ` +
          `this subject to specific slots or adjusting the curriculum's min_periods_per_week for ${ygName}.`,
        affected: {
          subject: { id: subjectId, name: subjectName },
          year_group: { id: yearGroupId, name: ygName },
          classes: affectedClasses,
        },
        metrics: {
          unassigned_periods: unassignedPeriods,
          affected_classes: affectedClasses.length,
        },
      });
    }

    return out;
  }

  private timeToMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  }
}
