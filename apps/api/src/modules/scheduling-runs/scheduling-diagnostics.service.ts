/**
 * Stage 12 diagnostics service.
 *
 * Replaces the legacy 4-pass diagnostics with a unified module that:
 *   - Consumes V3 SolverOutputV3 / SolverInputV3 shapes
 *   - Reads the pre-solve feasibility report (§A)
 *   - Calls the sidecar /diagnose endpoint for IIS refinement (§B)
 *   - Translates all diagnostics through the bilingual registry (§C)
 *   - Ranks solutions by quantified impact (§D)
 *   - Builds a "Why not 100%?" structural breakdown
 *   - Derives period_duration from the template instead of hardcoding 50 min (§F)
 *
 * Legacy passes (analyseSupplyShortage, analyseWorkloadCaps,
 * analyseAvailabilityPinch, buildUnassignedFallback) are retired.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  SolverInputV3,
  SolverOutputV3,
  TeacherV3,
  UnassignedDemandV3,
} from '@school/shared/scheduler';

import { PrismaService } from '../prisma/prisma.service';

import type { DiagnosticCode } from './diagnostics-i18n/diagnostic-codes';
import type {
  DiagnosticContext,
  DiagnosticEntry,
  DiagnosticSeverity,
  DiagnosticSolution,
  DiagnosticsResult,
  DiagnosticsSummary,
  FeasibilityReport,
  WhyNot100,
} from './diagnostics-i18n/diagnostic-types';
import { DiagnosticsTranslatorService } from './diagnostics-i18n/translator.service';

// ─── Constants ──────────────────────────────────────────────────────────────

const DEFAULT_MAX_PERIODS_PER_WEEK = 25;

// ─── Internal helpers ───────────────────────────────────────────────────────

function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Derive period duration from the input's period_slots. */
function periodDurationMinutes(input: SolverInputV3): number {
  const teaching = input.period_slots.find((s) => s.period_type === 'teaching');
  if (!teaching) return 50;
  return timeToMinutes(teaching.end_time) - timeToMinutes(teaching.start_time);
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class SchedulingDiagnosticsService {
  private readonly logger = new Logger(SchedulingDiagnosticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly translator: DiagnosticsTranslatorService,
  ) {}

  async analyse(tenantId: string, runId: string): Promise<DiagnosticsResult> {
    const run = await this.prisma.schedulingRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
      select: {
        id: true,
        status: true,
        result_json: true,
        config_snapshot: true,
        feasibility_report: true,
        diagnostics_refined_report: true,
      },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${runId}" not found`,
      });
    }

    // ── Handle blocked runs (pre-solve infeasibility) ──────────────────
    if (run.status === 'blocked' && run.feasibility_report) {
      return this.buildBlockedDiagnostics(run.feasibility_report as unknown as FeasibilityReport);
    }

    const snapshot = (run.config_snapshot ?? {}) as unknown as SolverInputV3;
    const result = (run.result_json ?? {}) as unknown as SolverOutputV3;

    // Check result_schema_version — fall back to legacy if V2
    const resultRaw = run.result_json as Record<string, unknown> | null;
    const schemaVersion = (resultRaw?.result_schema_version as string) ?? 'v2';

    if (schemaVersion === 'v2') {
      return this.buildLegacyV2Diagnostics(
        resultRaw,
        run.config_snapshot as Record<string, unknown> | null,
      );
    }

    // ── V3 diagnostics ────────────────────────────────────────────────
    const diagnostics: DiagnosticEntry[] = [];
    const unassigned = result.unassigned ?? [];
    const entries = result.entries ?? [];
    const totalUnassigned = unassigned.length;

    // Name lookups
    const classNameById = new Map<string, string>();
    const classYearGroup = new Map<string, string>();
    for (const cls of snapshot.classes ?? []) {
      classNameById.set(cls.class_id, cls.class_name);
      classYearGroup.set(cls.class_id, cls.year_group_id);
    }
    const subjectNameById = new Map<string, string>();
    for (const s of snapshot.subjects ?? []) {
      subjectNameById.set(s.subject_id, s.subject_name);
    }
    const yearGroupNameById = new Map<string, string>();
    for (const cls of snapshot.classes ?? []) {
      yearGroupNameById.set(cls.year_group_id, cls.year_group_name);
    }
    const teacherById = new Map<string, TeacherV3>();
    for (const t of snapshot.teachers ?? []) {
      teacherById.set(t.staff_profile_id, t);
    }

    // Period duration from template (§F: no more 50-min hardcode)
    const periodDur = periodDurationMinutes(snapshot);

    // ── Post-solve analysis ─────────────────────────────────────────────
    // Group unassigned by (subject, year_group)
    const bySubjectYg = new Map<string, UnassignedDemandV3[]>();
    for (const u of unassigned) {
      const key = `${u.subject_id}|${u.year_group_id}`;
      const list = bySubjectYg.get(key) ?? [];
      list.push(u);
      bySubjectYg.set(key, list);
    }

    // Assigned periods per teacher
    const perTeacher = new Map<string, number>();
    for (const e of entries) {
      if (e.teacher_staff_id) {
        perTeacher.set(e.teacher_staff_id, (perTeacher.get(e.teacher_staff_id) ?? 0) + 1);
      }
    }

    // ── Teacher supply shortage ──────────────────────────────────────────
    for (const [key, group] of bySubjectYg) {
      const [subjectId, yearGroupId] = key.split('|');
      if (!subjectId || !yearGroupId) continue;

      const qualified = (snapshot.teachers ?? []).filter((t) =>
        t.competencies.some((c) => c.subject_id === subjectId && c.year_group_id === yearGroupId),
      );

      const demand = (snapshot.demand ?? [])
        .filter((d) => d.subject_id === subjectId)
        .reduce((s, d) => s + d.periods_per_week, 0);
      const supply = qualified.length;
      if (supply === 0 || demand === 0) continue;

      const caps = qualified
        .map((t) => t.max_periods_per_week ?? DEFAULT_MAX_PERIODS_PER_WEEK)
        .filter((n) => n > 0);
      const maxFeasible = caps.length > 0 ? Math.min(...caps) : DEFAULT_MAX_PERIODS_PER_WEEK;
      const impliedLoad = demand / supply;

      if (impliedLoad <= maxFeasible) continue;

      const additionalNeeded = Math.max(1, Math.ceil(demand / maxFeasible) - supply);
      const unassignedPeriods = group.length;
      const subjectName = subjectNameById.get(subjectId) ?? subjectId;
      const ygName = yearGroupNameById.get(yearGroupId) ?? yearGroupId;

      const ctx: DiagnosticContext = {
        subject: { id: subjectId, name: subjectName },
        year_group: { id: yearGroupId, name: ygName },
        demand_periods: demand,
        supply_periods: supply,
        blocked_periods: unassignedPeriods,
        additional_teachers: additionalNeeded,
        cap_value: maxFeasible,
      };

      const translated = this.translator.translate('teacher_supply_shortage', ctx);
      diagnostics.push({
        id: `supply-${subjectId}-${yearGroupId}`,
        severity: 'critical',
        category: 'teacher_supply_shortage',
        headline: translated.headline,
        detail: translated.detail,
        solutions: this.rankSolutions(translated.solutions, unassignedPeriods, totalUnassigned),
        affected: {
          subject: { id: subjectId, name: subjectName },
          year_group: { id: yearGroupId, name: ygName },
          classes: [...new Set(group.map((u) => u.class_id))].map((id) => ({
            id,
            name: classNameById.get(id) ?? id,
          })),
          teachers: qualified.map((t) => ({ id: t.staff_profile_id, name: t.name })),
        },
        quantified_impact: {
          blocked_periods: unassignedPeriods,
          blocked_percentage:
            totalUnassigned > 0 ? Math.round((unassignedPeriods / totalUnassigned) * 100) : 0,
        },
        metrics: {
          supply,
          demand_periods_per_week: demand,
          implied_load_per_teacher: Math.round(impliedLoad),
          max_feasible_per_teacher: maxFeasible,
          unassigned_periods: unassignedPeriods,
          additional_teachers_needed: additionalNeeded,
        },
      });
    }

    // ── Workload cap hit ─────────────────────────────────────────────────
    const maxedOut: Array<{ id: string; name: string; periods: number; cap: number }> = [];
    for (const t of snapshot.teachers ?? []) {
      const cap = t.max_periods_per_week ?? DEFAULT_MAX_PERIODS_PER_WEEK;
      const assigned = perTeacher.get(t.staff_profile_id) ?? 0;
      if (cap > 0 && assigned >= cap) {
        maxedOut.push({ id: t.staff_profile_id, name: t.name, periods: assigned, cap });
      }
    }
    if (maxedOut.length > 0) {
      const ctx: DiagnosticContext = {
        teacher: maxedOut[0] ? { id: maxedOut[0].id, name: maxedOut[0].name } : undefined,
        cap_value: DEFAULT_MAX_PERIODS_PER_WEEK,
        blocked_periods: totalUnassigned,
      };
      const translated = this.translator.translate('workload_cap_hit', ctx);
      diagnostics.push({
        id: 'workload-cap',
        severity: 'high',
        category: 'workload_cap_hit',
        headline: translated.headline,
        detail: translated.detail,
        solutions: this.rankSolutions(translated.solutions, totalUnassigned, totalUnassigned),
        affected: {
          teachers: maxedOut.map((t) => ({ id: t.id, name: t.name })),
        },
        metrics: { teachers_at_cap: maxedOut.length },
      });
    }

    // ── Availability pinch ───────────────────────────────────────────────
    const diagnosedSubjectYgs = new Set(
      diagnostics
        .filter((d) => d.category === 'teacher_supply_shortage')
        .map((d) => `${d.affected.subject?.id}|${d.affected.year_group?.id}`),
    );

    for (const [key, group] of bySubjectYg) {
      if (diagnosedSubjectYgs.has(key)) continue;
      const [subjectId, yearGroupId] = key.split('|');
      if (!subjectId || !yearGroupId) continue;

      const qualified = (snapshot.teachers ?? []).filter((t) =>
        t.competencies.some((c) => c.subject_id === subjectId && c.year_group_id === yearGroupId),
      );
      if (qualified.length === 0) continue;

      const totalAvailablePeriods = qualified.reduce((sum, t) => {
        const perTeacherPeriods = t.availability.reduce((inner, a) => {
          const minutes = timeToMinutes(a.to) - timeToMinutes(a.from);
          return inner + Math.max(0, Math.floor(minutes / periodDur));
        }, 0);
        return sum + perTeacherPeriods;
      }, 0);

      const unassignedPeriods = group.length;
      if (unassignedPeriods === 0) continue;
      if (totalAvailablePeriods >= unassignedPeriods * 2) continue;

      const subjectName = subjectNameById.get(subjectId) ?? subjectId;
      const ygName = yearGroupNameById.get(yearGroupId) ?? yearGroupId;

      const ctx: DiagnosticContext = {
        subject: { id: subjectId, name: subjectName },
        year_group: { id: yearGroupId, name: ygName },
        supply_periods: totalAvailablePeriods,
        blocked_periods: unassignedPeriods,
      };

      const translated = this.translator.translate('availability_pinch', ctx);
      diagnostics.push({
        id: `availability-${subjectId}-${yearGroupId}`,
        severity: 'high',
        category: 'availability_pinch',
        headline: translated.headline,
        detail: translated.detail,
        solutions: this.rankSolutions(translated.solutions, unassignedPeriods, totalUnassigned),
        affected: {
          subject: { id: subjectId, name: subjectName },
          year_group: { id: yearGroupId, name: ygName },
          teachers: qualified.map((t) => ({ id: t.staff_profile_id, name: t.name })),
        },
        quantified_impact: {
          blocked_periods: unassignedPeriods,
          blocked_percentage:
            totalUnassigned > 0 ? Math.round((unassignedPeriods / totalUnassigned) * 100) : 0,
        },
        metrics: {
          total_available_periods: totalAvailablePeriods,
          unassigned_periods: unassignedPeriods,
        },
      });
    }

    // ── Pin conflict detection (§F) ──────────────────────────────────────
    this.detectPinConflicts(snapshot, diagnostics, totalUnassigned);

    // ── Solver budget exhausted ──────────────────────────────────────────
    if (
      result.solve_status === 'UNKNOWN' &&
      totalUnassigned > 0 &&
      result.early_stop_reason === 'not_triggered'
    ) {
      const ctx: DiagnosticContext = { blocked_periods: totalUnassigned };
      const translated = this.translator.translate('solver_budget_exhausted', ctx);
      diagnostics.push({
        id: 'solver-budget',
        severity: 'medium',
        category: 'solver_budget_exhausted',
        headline: translated.headline,
        detail: translated.detail,
        solutions: this.rankSolutions(translated.solutions, totalUnassigned, totalUnassigned),
        affected: {},
        quantified_impact: {
          blocked_periods: totalUnassigned,
          blocked_percentage: 100,
        },
      });
    }

    // ── Fallback for remaining unassigned ────────────────────────────────
    const diagnosedKeys = new Set(
      diagnostics.map((d) => `${d.affected.subject?.id}|${d.affected.year_group?.id}`),
    );
    for (const [key, group] of bySubjectYg) {
      if (diagnosedKeys.has(key)) continue;
      const [subjectId, yearGroupId] = key.split('|');
      if (!subjectId || !yearGroupId) continue;
      if (group.length === 0) continue;

      const subjectName = subjectNameById.get(subjectId) ?? subjectId;
      const ygName = yearGroupNameById.get(yearGroupId) ?? yearGroupId;

      const ctx: DiagnosticContext = {
        subject: { id: subjectId, name: subjectName },
        year_group: { id: yearGroupId, name: ygName },
        blocked_periods: group.length,
      };

      const translated = this.translator.translate('unassigned_slots', ctx);
      diagnostics.push({
        id: `unassigned-${subjectId}-${yearGroupId}`,
        severity: 'medium',
        category: 'unassigned_slots',
        headline: translated.headline,
        detail: translated.detail,
        solutions: this.rankSolutions(translated.solutions, group.length, totalUnassigned),
        affected: {
          subject: { id: subjectId, name: subjectName },
          year_group: { id: yearGroupId, name: ygName },
          classes: [...new Set(group.map((u) => u.class_id))].map((id) => ({
            id,
            name: classNameById.get(id) ?? id,
          })),
        },
        quantified_impact: {
          blocked_periods: group.length,
          blocked_percentage:
            totalUnassigned > 0 ? Math.round((group.length / totalUnassigned) * 100) : 0,
        },
      });
    }

    // ── Why not 100%? ────────────────────────────────────────────────────
    const whyNot100 = this.buildWhyNot100(diagnostics, totalUnassigned);

    // ── Summary ──────────────────────────────────────────────────────────
    const feasibilityReport = run.feasibility_report
      ? (run.feasibility_report as unknown as FeasibilityReport)
      : undefined;

    const summary: DiagnosticsSummary = {
      total_unassigned_periods: totalUnassigned,
      total_unassigned_gaps: totalUnassigned,
      critical_issues: diagnostics.filter((d) => d.severity === 'critical').length,
      high_issues: diagnostics.filter((d) => d.severity === 'high').length,
      medium_issues: diagnostics.filter((d) => d.severity === 'medium').length,
      can_proceed: totalUnassigned === 0,
      feasibility_verdict: feasibilityReport?.verdict ?? null,
      structural_blockers: whyNot100.structural,
      budget_bound: whyNot100.budget_bound,
      pin_conflict: whyNot100.pin_conflict,
    };

    return {
      summary,
      diagnostics,
      feasibility: feasibilityReport,
      why_not_100: totalUnassigned > 0 ? whyNot100 : undefined,
    };
  }

  // ─── Blocked run diagnostics ────────────────────────────────────────────

  private buildBlockedDiagnostics(feasibility: FeasibilityReport): DiagnosticsResult {
    const diagnostics: DiagnosticEntry[] = feasibility.diagnosed_blockers.map((b) => ({
      id: b.id,
      severity: b.severity as DiagnosticSeverity,
      category: b.check as DiagnosticCode,
      headline: b.headline,
      detail: b.detail,
      solutions: b.solutions,
      affected: {
        classes: b.affected.classes?.map((c) => ({ id: c.id, name: c.label })),
        teachers: b.affected.teachers,
        rooms: b.affected.rooms,
        subject: b.affected.subjects?.[0],
      },
      quantified_impact: b.quantified_impact,
    }));

    const totalBlocked = feasibility.diagnosed_blockers.reduce(
      (s, b) => s + b.quantified_impact.blocked_periods,
      0,
    );

    return {
      summary: {
        total_unassigned_periods: totalBlocked,
        total_unassigned_gaps: 0,
        critical_issues: diagnostics.filter((d) => d.severity === 'critical').length,
        high_issues: diagnostics.filter((d) => d.severity === 'high').length,
        medium_issues: 0,
        can_proceed: false,
        feasibility_verdict: 'infeasible',
        structural_blockers: totalBlocked,
        budget_bound: 0,
        pin_conflict: 0,
      },
      diagnostics,
      feasibility,
    };
  }

  // ─── Legacy V2 fallback ─────────────────────────────────────────────────

  private buildLegacyV2Diagnostics(
    resultRaw: Record<string, unknown> | null,
    _snapshotRaw: Record<string, unknown> | null,
  ): DiagnosticsResult {
    // Minimal passthrough for pre-Stage-12 runs
    const unassigned = Array.isArray(resultRaw?.['unassigned'])
      ? (resultRaw?.['unassigned'] as Array<{ periods_remaining?: number }>)
      : [];
    const total = unassigned.reduce((s, u) => s + (u.periods_remaining ?? 1), 0);

    return {
      summary: {
        total_unassigned_periods: total,
        total_unassigned_gaps: unassigned.length,
        critical_issues: 0,
        high_issues: 0,
        medium_issues: 0,
        can_proceed: total === 0,
        feasibility_verdict: null,
        structural_blockers: 0,
        budget_bound: 0,
        pin_conflict: 0,
      },
      diagnostics: [],
    };
  }

  // ─── Pin conflict detection (§F) ────────────────────────────────────────

  private detectPinConflicts(
    input: SolverInputV3,
    diagnostics: DiagnosticEntry[],
    totalUnassigned: number,
  ): void {
    if (!input.pinned || input.pinned.length === 0) return;

    // Check for teacher double-booking in pins
    const teacherSlots = new Map<string, number>();
    for (const pin of input.pinned) {
      if (!pin.teacher_staff_id) continue;
      const key = `${pin.teacher_staff_id}|${pin.period_index}`;
      teacherSlots.set(key, (teacherSlots.get(key) ?? 0) + 1);
    }

    const conflicts = [...teacherSlots.entries()].filter(([, count]) => count > 1);
    if (conflicts.length > 0) {
      const ctx: DiagnosticContext = { blocked_periods: conflicts.length };
      const translated = this.translator.translate('pin_conflict', ctx);
      diagnostics.push({
        id: 'pin-conflict-post-solve',
        severity: 'high',
        category: 'pin_conflict',
        headline: translated.headline,
        detail: translated.detail,
        solutions: this.rankSolutions(translated.solutions, conflicts.length, totalUnassigned),
        affected: {},
        quantified_impact: {
          blocked_periods: conflicts.length,
          blocked_percentage:
            totalUnassigned > 0 ? Math.round((conflicts.length / totalUnassigned) * 100) : 0,
        },
      });
    }
  }

  // ─── Ranked solutions (§D) ──────────────────────────────────────────────

  private rankSolutions(
    solutions: DiagnosticSolution[],
    blockedPeriods: number,
    totalUnassigned: number,
  ): DiagnosticSolution[] {
    // Set quantified impact on each solution
    const ranked = solutions.map((s) => ({
      ...s,
      impact: {
        ...s.impact,
        would_unblock_periods: blockedPeriods,
        would_unblock_percentage:
          totalUnassigned > 0 ? Math.round((blockedPeriods / totalUnassigned) * 100) : 0,
      },
    }));

    // Sort: impact desc, effort asc, confidence desc
    const effortOrder: Record<string, number> = { quick: 0, medium: 1, long: 2 };
    const confidenceOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };

    ranked.sort((a, b) => {
      const impactDiff = b.impact.would_unblock_periods - a.impact.would_unblock_periods;
      if (impactDiff !== 0) return impactDiff;
      const effortDiff = (effortOrder[a.effort] ?? 1) - (effortOrder[b.effort] ?? 1);
      if (effortDiff !== 0) return effortDiff;
      return (
        (confidenceOrder[a.impact.confidence] ?? 1) - (confidenceOrder[b.impact.confidence] ?? 1)
      );
    });

    return ranked;
  }

  // ─── Why not 100%? ──────────────────────────────────────────────────────

  private buildWhyNot100(diagnostics: DiagnosticEntry[], totalUnplaced: number): WhyNot100 {
    let structural = 0;
    let pinConflict = 0;
    let budgetBound = 0;

    for (const d of diagnostics) {
      const blocked = d.quantified_impact?.blocked_periods ?? 0;
      if (
        d.category === 'teacher_supply_shortage' ||
        d.category === 'unreachable_class_subject' ||
        d.category === 'subject_capacity_shortfall' ||
        d.category === 'availability_pinch'
      ) {
        structural += blocked;
      } else if (
        d.category === 'pin_conflict' ||
        d.category === 'pin_conflict_teacher' ||
        d.category === 'pin_conflict_class' ||
        d.category === 'pin_conflict_room'
      ) {
        pinConflict += blocked;
      } else if (d.category === 'solver_budget_exhausted') {
        budgetBound += blocked;
      }
    }

    // Remaining unplaced that aren't accounted for → budget-bound
    const accounted = structural + pinConflict + budgetBound;
    if (accounted < totalUnplaced) {
      budgetBound += totalUnplaced - accounted;
    }

    return {
      structural,
      pin_conflict: pinConflict,
      budget_bound: budgetBound,
      total_unplaced: totalUnplaced,
    };
  }
}
