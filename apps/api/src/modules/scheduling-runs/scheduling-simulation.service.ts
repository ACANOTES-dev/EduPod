/**
 * What-if simulation service (Stage 12 §E).
 *
 * Takes a completed run's config_snapshot, applies hypothetical overrides
 * (add teacher competency, remove pin, extend availability), re-solves
 * with a tight budget (5s), and returns the placement delta.
 *
 * The result is NOT persisted — it's a view, not a commitment.
 */
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { SolverInputV3, SolverOutputV3 } from '@school/shared/scheduler';
import { solveViaCpSatV3 } from '@school/shared/scheduler';

import { PrismaService } from '../prisma/prisma.service';

// ─── Override types ─────────────────────────────────────────────────────────

interface AddTeacherCompetencyOverride {
  type: 'add_teacher_competency';
  teacher_id: string;
  subject_id: string;
}

interface RemovePinOverride {
  type: 'remove_pin';
  pin_id: string;
}

interface ExtendTeacherAvailabilityOverride {
  type: 'extend_teacher_availability';
  teacher_id: string;
  day: number;
  period: number;
}

export type SimulationOverride =
  | AddTeacherCompetencyOverride
  | RemovePinOverride
  | ExtendTeacherAvailabilityOverride;

export interface SimulationResult {
  baseline: { placed: number; unassigned: number };
  projected: { placed: number; unassigned: number };
  delta: { would_unblock_periods: number; remaining_blockers: string[] };
  duration_ms: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

@Injectable()
export class SchedulingSimulationService {
  private readonly logger = new Logger(SchedulingSimulationService.name);

  constructor(private readonly prisma: PrismaService) {}

  async simulate(
    tenantId: string,
    runId: string,
    overrides: SimulationOverride[],
  ): Promise<SimulationResult> {
    const run = await this.prisma.schedulingRun.findFirst({
      where: { id: runId, tenant_id: tenantId },
      select: {
        config_snapshot: true,
        result_json: true,
        status: true,
      },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${runId}" not found`,
      });
    }

    if (!run.config_snapshot || !run.result_json) {
      throw new BadRequestException({
        code: 'RUN_NOT_COMPLETE',
        message: 'Simulation requires a completed run with config_snapshot and result_json',
      });
    }

    const originalInput = JSON.parse(JSON.stringify(run.config_snapshot)) as SolverInputV3;
    const originalOutput = run.result_json as unknown as SolverOutputV3;
    const baseline = {
      placed: originalOutput.entries?.length ?? 0,
      unassigned: originalOutput.unassigned?.length ?? 0,
    };

    // Apply overrides to a copy of the input
    const modifiedInput = this.applyOverrides(originalInput, overrides);

    // Solve with a tight budget (5s)
    modifiedInput.settings.max_solver_duration_seconds = 5;

    const start = performance.now();
    const baseUrl = process.env['SOLVER_PY_URL'] ?? 'http://127.0.0.1:5557';

    let projectedOutput: SolverOutputV3;
    try {
      projectedOutput = await solveViaCpSatV3(modifiedInput, {
        baseUrl,
        timeoutMs: 15_000,
        requestId: `sim-${runId}-${Date.now()}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Simulation solve failed';
      this.logger.error(`Simulation failed for run ${runId}: ${message}`);
      throw new BadRequestException({
        code: 'SIMULATION_FAILED',
        message: `Simulation solve failed: ${message}`,
      });
    }

    const durationMs = Math.round(performance.now() - start);
    const projected = {
      placed: projectedOutput.entries?.length ?? 0,
      unassigned: projectedOutput.unassigned?.length ?? 0,
    };

    const wouldUnblock = Math.max(0, baseline.unassigned - projected.unassigned);
    const remainingBlockers = (projectedOutput.unassigned ?? [])
      .map((u) => `${u.class_id}:${u.subject_id}:${u.lesson_index}`)
      .slice(0, 10);

    this.logger.log(
      `Simulation for run ${runId}: baseline ${baseline.placed}/${baseline.unassigned} → ` +
        `projected ${projected.placed}/${projected.unassigned}, delta +${wouldUnblock}, ${durationMs}ms`,
    );

    return {
      baseline,
      projected,
      delta: { would_unblock_periods: wouldUnblock, remaining_blockers: remainingBlockers },
      duration_ms: durationMs,
    };
  }

  private applyOverrides(input: SolverInputV3, overrides: SimulationOverride[]): SolverInputV3 {
    for (const override of overrides) {
      switch (override.type) {
        case 'add_teacher_competency': {
          const teacher = input.teachers.find((t) => t.staff_profile_id === override.teacher_id);
          if (teacher) {
            // Find a year_group for this subject from existing demand
            const demandForSubject = input.demand.find((d) => d.subject_id === override.subject_id);
            const ygId = demandForSubject
              ? input.classes.find((c) => c.class_id === demandForSubject.class_id)?.year_group_id
              : input.classes[0]?.year_group_id;
            if (ygId) {
              teacher.competencies.push({
                subject_id: override.subject_id,
                year_group_id: ygId,
                class_id: null,
              });
            }
          }
          break;
        }
        case 'remove_pin': {
          input.pinned = input.pinned.filter((p) => p.schedule_id !== override.pin_id);
          break;
        }
        case 'extend_teacher_availability': {
          const teacher = input.teachers.find((t) => t.staff_profile_id === override.teacher_id);
          if (teacher) {
            // Add a 1-hour availability window on the specified day
            const existing = teacher.availability.find((a) => a.weekday === override.day);
            if (!existing) {
              teacher.availability.push({
                weekday: override.day,
                from: '08:00',
                to: '16:00',
              });
            }
          }
          break;
        }
      }
    }
    return input;
  }
}
