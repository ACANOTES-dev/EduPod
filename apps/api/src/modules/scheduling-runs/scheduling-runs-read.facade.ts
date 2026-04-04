/**
 * SchedulingRunsReadFacade — Centralized read service for scheduling run and scenario data.
 *
 * PURPOSE:
 * The scheduling-runs module owns `schedulingRun` and `schedulingScenario`. These are
 * queried cross-module by the scheduling module (scenario.service, scheduler-orchestration,
 * scheduler-validation, scheduling-analytics) to check run status, load results, and
 * detect active runs.
 *
 * This facade provides a single, well-typed entry point for those cross-module reads.
 *
 * CONVENTIONS:
 * - Every method starts with `tenantId: string` as the first parameter.
 * - No RLS transaction needed for reads — `tenant_id` is in every `where` clause.
 * - Returns `null` when a single record is not found (callers decide whether to throw).
 */
import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

// ─── Result types ─────────────────────────────────────────────────────────────

export interface SchedulingRunRow {
  id: string;
  tenant_id: string;
  academic_year_id: string;
  mode: string;
  status: string;
  config_snapshot: unknown;
  result_json: unknown;
  proposed_adjustments: unknown;
  hard_constraint_violations: number | null;
  soft_preference_score: unknown;
  soft_preference_max: unknown;
  entries_generated: number | null;
  entries_pinned: number | null;
  entries_unassigned: number | null;
  solver_duration_ms: number | null;
  solver_seed: unknown;
  failure_reason: string | null;
  created_by_user_id: string;
  applied_by_user_id: string | null;
  applied_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface SchedulingRunStatusRow {
  id: string;
  status: string;
}

export interface SchedulingRunSummaryRow {
  id: string;
  status: string;
  mode: string;
  entries_generated: number | null;
  entries_pinned: number | null;
  entries_unassigned: number | null;
  hard_constraint_violations: number | null;
  soft_preference_score: unknown;
  soft_preference_max: unknown;
  solver_duration_ms: number | null;
  created_at: Date;
  applied_at: Date | null;
}

export interface LatestRunWithResultRow {
  id: string;
  status: string;
  soft_preference_score: unknown;
  soft_preference_max: unknown;
  result_json: unknown;
  created_at: Date;
}

// ─── Facade ───────────────────────────────────────────────────────────────────

@Injectable()
export class SchedulingRunsReadFacade {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Single run lookups ─────────────────────────────────────────────────────

  /**
   * Find a scheduling run by ID with all fields. Used by scheduler-validation
   * and scheduler-orchestration to load config snapshots and results.
   */
  async findById(tenantId: string, runId: string): Promise<SchedulingRunRow | null> {
    return this.prisma.schedulingRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
    }) as unknown as Promise<SchedulingRunRow | null>;
  }

  /**
   * Check if a scheduling run exists by ID. Returns id + status only.
   */
  async findStatusById(tenantId: string, runId: string): Promise<SchedulingRunStatusRow | null> {
    return this.prisma.schedulingRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
      select: { id: true, status: true },
    });
  }

  // ─── Active run detection ───────────────────────────────────────────────────

  /**
   * Find an active (queued or running) scheduling run for an academic year.
   * Used to prevent duplicate run creation.
   */
  async findActiveRun(
    tenantId: string,
    academicYearId: string,
  ): Promise<SchedulingRunStatusRow | null> {
    return this.prisma.schedulingRun.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        status: { in: ['queued', 'running'] },
      },
      select: { id: true, status: true },
    });
  }

  /**
   * Count active runs for an academic year.
   */
  async countActiveRuns(tenantId: string, academicYearId: string): Promise<number> {
    return this.prisma.schedulingRun.count({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        status: { in: ['queued', 'running'] },
      },
    });
  }

  // ─── Latest run queries ─────────────────────────────────────────────────────

  /**
   * Find the latest completed or applied run for an academic year.
   * Used by scheduling dashboard for overview stats and preference scoring.
   */
  async findLatestCompletedRun(
    tenantId: string,
    academicYearId: string,
  ): Promise<SchedulingRunSummaryRow | null> {
    return this.prisma.schedulingRun.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        status: { in: ['completed', 'applied'] },
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        status: true,
        mode: true,
        entries_generated: true,
        entries_pinned: true,
        entries_unassigned: true,
        hard_constraint_violations: true,
        soft_preference_score: true,
        soft_preference_max: true,
        solver_duration_ms: true,
        created_at: true,
        applied_at: true,
      },
    }) as unknown as Promise<SchedulingRunSummaryRow | null>;
  }

  /**
   * Find the latest completed or applied run with result_json. Used by
   * scheduling dashboard to inspect unassigned details.
   */
  async findLatestRunWithResult(
    tenantId: string,
    academicYearId: string,
  ): Promise<LatestRunWithResultRow | null> {
    return this.prisma.schedulingRun.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        status: { in: ['completed', 'applied'] },
      },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        status: true,
        soft_preference_score: true,
        soft_preference_max: true,
        result_json: true,
        created_at: true,
      },
    }) as unknown as Promise<LatestRunWithResultRow | null>;
  }

  /**
   * Find the latest applied run for an academic year. Used by scheduling
   * analytics for historical comparison.
   */
  async findLatestAppliedRun(
    tenantId: string,
    academicYearId: string,
  ): Promise<{
    soft_preference_score: unknown;
    soft_preference_max: unknown;
    entries_unassigned: number | null;
  } | null> {
    return this.prisma.schedulingRun.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        status: 'applied',
      },
      orderBy: { applied_at: 'desc' },
      select: {
        soft_preference_score: true,
        soft_preference_max: true,
        entries_unassigned: true,
      },
    }) as unknown as Promise<{
      soft_preference_score: unknown;
      soft_preference_max: unknown;
      entries_unassigned: number | null;
    } | null>;
  }

  // ─── List / paginated ───────────────────────────────────────────────────────

  /**
   * List scheduling runs for an academic year, paginated, ordered by created_at desc.
   */
  async listRuns(
    tenantId: string,
    academicYearId: string,
    page: number,
    pageSize: number,
  ): Promise<{ data: SchedulingRunSummaryRow[]; total: number }> {
    const skip = (page - 1) * pageSize;
    const where = { tenant_id: tenantId, academic_year_id: academicYearId };

    const [data, total] = await Promise.all([
      this.prisma.schedulingRun.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          mode: true,
          status: true,
          hard_constraint_violations: true,
          soft_preference_score: true,
          soft_preference_max: true,
          entries_generated: true,
          entries_pinned: true,
          entries_unassigned: true,
          solver_duration_ms: true,
          created_at: true,
          applied_at: true,
        },
      }),
      this.prisma.schedulingRun.count({ where }),
    ]);

    return {
      data: data as unknown as SchedulingRunSummaryRow[],
      total,
    };
  }

  /**
   * Find historical runs (completed/applied) for trends. Limited to 20, ordered asc.
   */
  async findHistoricalRuns(
    tenantId: string,
    academicYearId: string,
    limit = 20,
  ): Promise<
    Array<{
      id: string;
      entries_generated: number | null;
      entries_unassigned: number | null;
      soft_preference_score: unknown;
      soft_preference_max: unknown;
      result_json: unknown;
      created_at: Date;
    }>
  > {
    return this.prisma.schedulingRun.findMany({
      where: {
        tenant_id: tenantId,
        academic_year_id: academicYearId,
        status: { in: ['completed', 'applied'] },
      },
      orderBy: { created_at: 'asc' },
      take: limit,
      select: {
        id: true,
        entries_generated: true,
        entries_unassigned: true,
        soft_preference_score: true,
        soft_preference_max: true,
        result_json: true,
        created_at: true,
      },
    }) as unknown as Promise<
      Array<{
        id: string;
        entries_generated: number | null;
        entries_unassigned: number | null;
        soft_preference_score: unknown;
        soft_preference_max: unknown;
        result_json: unknown;
        created_at: Date;
      }>
    >;
  }
}
