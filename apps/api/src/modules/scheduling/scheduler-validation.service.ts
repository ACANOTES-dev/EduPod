import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import {
  type SolverInputV2,
  type SolverAssignmentV2,
  type ValidationResult,
  validateSchedule,
} from '@school/shared/scheduler';

import { PrismaService } from '../prisma/prisma.service';
import { SchedulingRunsReadFacade } from '../scheduling-runs/scheduling-runs-read.facade';

import { SchedulerOrchestrationService } from './scheduler-orchestration.service';

@Injectable()
export class SchedulerValidationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orchestration: SchedulerOrchestrationService,
    private readonly schedulingRunsReadFacade: SchedulingRunsReadFacade,
  ) {}

  // ─── Validate Run ─────────────────────────────────────────────────────────

  async validateRun(tenantId: string, runId: string): Promise<ValidationResult> {
    const run = await this.schedulingRunsReadFacade.findById(tenantId, runId);

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${runId}" not found`,
      });
    }

    if (!['completed', 'applied'].includes(run.status)) {
      throw new BadRequestException({
        code: 'RUN_NOT_VALIDATABLE',
        message: `Only completed or applied runs can be validated. Current status: "${run.status}"`,
      });
    }

    const resultJson = run.result_json as {
      entries: SolverAssignmentV2[];
      unassigned: unknown[];
    } | null;

    if (!resultJson || !Array.isArray(resultJson.entries)) {
      throw new BadRequestException({
        code: 'NO_RESULT_JSON',
        message: 'The run has no result data to validate',
      });
    }

    // Use config_snapshot if available, otherwise assemble fresh input
    let input: SolverInputV2;
    if (run.config_snapshot && typeof run.config_snapshot === 'object') {
      input = run.config_snapshot as unknown as SolverInputV2;
    } else {
      input = await this.orchestration.assembleSolverInput(tenantId, run.academic_year_id);
    }

    // Merge proposed_adjustments into entries if present
    const proposedAdjustments = Array.isArray(run.proposed_adjustments)
      ? run.proposed_adjustments
      : [];

    let entries = resultJson.entries;
    if (proposedAdjustments.length > 0) {
      entries = this.applyAdjustmentsToEntries(entries, proposedAdjustments as unknown[]);
    }

    return validateSchedule(input, entries);
  }

  // ─── Validate with Adjustments ─────────────────────────────────────────────

  async validateAdjustments(
    tenantId: string,
    runId: string,
    adjustments: unknown[],
  ): Promise<ValidationResult> {
    const run = await this.schedulingRunsReadFacade.findById(tenantId, runId);

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${runId}" not found`,
      });
    }

    const resultJson = run.result_json as {
      entries: SolverAssignmentV2[];
      unassigned: unknown[];
    } | null;

    if (!resultJson || !Array.isArray(resultJson.entries)) {
      throw new BadRequestException({
        code: 'NO_RESULT_JSON',
        message: 'The run has no result data to validate',
      });
    }

    // Use config_snapshot if available
    let input: SolverInputV2;
    if (run.config_snapshot && typeof run.config_snapshot === 'object') {
      input = run.config_snapshot as unknown as SolverInputV2;
    } else {
      input = await this.orchestration.assembleSolverInput(tenantId, run.academic_year_id);
    }

    // Combine existing proposed_adjustments with new ones
    const existingAdjustments = Array.isArray(run.proposed_adjustments)
      ? (run.proposed_adjustments as unknown[])
      : [];
    const allAdjustments = [...existingAdjustments, ...adjustments];

    const entries = this.applyAdjustmentsToEntries(resultJson.entries, allAdjustments);

    return validateSchedule(input, entries);
  }

  // ─── Private helpers ───────────────────────────────────────────────────────

  /**
   * Apply adjustment operations to produce a modified entry list.
   * Supports: move, swap, remove, add, teacher_change
   */
  private applyAdjustmentsToEntries(
    entries: SolverAssignmentV2[],
    adjustments: unknown[],
  ): SolverAssignmentV2[] {
    const entryKey = (classId: string, weekday: number, periodOrder: number) =>
      `${classId}|${weekday}|${periodOrder}`;

    const entriesMap = new Map<string, SolverAssignmentV2>();
    for (const entry of entries) {
      entriesMap.set(entryKey(entry.class_id, entry.weekday, entry.period_order), entry);
    }

    for (const rawAdj of adjustments) {
      const adj = rawAdj as Record<string, unknown>;
      const type = adj['type'] as string;

      if (type === 'move') {
        const fromKey = entryKey(
          adj['class_id'] as string,
          adj['from_weekday'] as number,
          adj['from_period_order'] as number,
        );
        const existing = entriesMap.get(fromKey);
        if (existing) {
          entriesMap.delete(fromKey);
          const newEntry: SolverAssignmentV2 = {
            ...existing,
            weekday: adj['to_weekday'] as number,
            period_order: adj['to_period_order'] as number,
            room_id: (adj['to_room_id'] as string | null) ?? existing.room_id,
          };
          entriesMap.set(
            entryKey(newEntry.class_id, newEntry.weekday, newEntry.period_order),
            newEntry,
          );
        }
      } else if (type === 'swap') {
        const entryA = adj['entry_a'] as Record<string, unknown>;
        const entryB = adj['entry_b'] as Record<string, unknown>;
        const keyA = entryKey(
          entryA['class_id'] as string,
          entryA['weekday'] as number,
          entryA['period_order'] as number,
        );
        const keyB = entryKey(
          entryB['class_id'] as string,
          entryB['weekday'] as number,
          entryB['period_order'] as number,
        );
        const a = entriesMap.get(keyA);
        const b = entriesMap.get(keyB);
        if (a && b) {
          entriesMap.delete(keyA);
          entriesMap.delete(keyB);
          const newA = { ...a, weekday: b.weekday, period_order: b.period_order };
          const newB = { ...b, weekday: a.weekday, period_order: a.period_order };
          entriesMap.set(entryKey(newA.class_id, newA.weekday, newA.period_order), newA);
          entriesMap.set(entryKey(newB.class_id, newB.weekday, newB.period_order), newB);
        }
      } else if (type === 'remove') {
        const key = entryKey(
          adj['class_id'] as string,
          adj['weekday'] as number,
          adj['period_order'] as number,
        );
        entriesMap.delete(key);
      } else if (type === 'teacher_change') {
        const key = entryKey(
          adj['class_id'] as string,
          adj['weekday'] as number,
          adj['period_order'] as number,
        );
        const existing = entriesMap.get(key);
        if (existing) {
          entriesMap.set(key, {
            ...existing,
            teacher_staff_id: adj['new_teacher_staff_id'] as string | null,
          });
        }
      }
    }

    return Array.from(entriesMap.values());
  }
}
