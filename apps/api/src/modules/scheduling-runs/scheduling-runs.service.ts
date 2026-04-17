import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Queue } from 'bullmq';

import type {
  AddAdjustmentDto,
  CreateSchedulingRunDto,
  DiscardRunDto,
  SchedulingResultJson,
  SchedulingAdjustment,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { AcademicReadFacade } from '../academics/academic-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';
import { SchedulerOrchestrationService } from '../scheduling/scheduler-orchestration.service';

import { SchedulingPrerequisitesService } from './scheduling-prerequisites.service';

interface PaginationParams {
  page: number;
  pageSize: number;
}

@Injectable()
export class SchedulingRunsService {
  private readonly logger = new Logger(SchedulingRunsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly prerequisites: SchedulingPrerequisitesService,
    private readonly academicReadFacade: AcademicReadFacade,
    private readonly roomsReadFacade: RoomsReadFacade,
    private readonly schedulerOrchestration: SchedulerOrchestrationService,
    @InjectQueue('scheduling') private readonly schedulingQueue: Queue,
  ) {}

  // ─── Create a new scheduling run ──────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSchedulingRunDto) {
    // Verify the academic year belongs to this tenant
    await this.academicReadFacade.findYearByIdOrThrow(tenantId, dto.academic_year_id);

    // Ensure no active run (queued or running) for this year
    const activeRun = await this.prisma.schedulingRun.findFirst({
      where: {
        tenant_id: tenantId,
        academic_year_id: dto.academic_year_id,
        status: { in: ['queued', 'running'] },
      },
      select: { id: true, status: true },
    });

    if (activeRun) {
      throw new ConflictException({
        code: 'RUN_ALREADY_ACTIVE',
        message: `A scheduling run is already ${activeRun.status} for this academic year. Cancel it before starting a new one.`,
      });
    }

    // Check prerequisites
    const prereqResult = await this.prerequisites.check(tenantId, dto.academic_year_id);
    if (!prereqResult.ready) {
      throw new BadRequestException({
        code: 'PREREQUISITES_NOT_MET',
        message: 'Scheduling prerequisites are not satisfied. Check the prerequisites endpoint.',
        details: prereqResult.checks.filter((c) => !c.passed),
      });
    }

    // Assemble the full solver input. The worker's solve-v2 processor reads
    // `config_snapshot` as a `SolverInputV3` directly — it accesses
    // `configSnapshot.classes.length`, `configSnapshot.demand.length`, etc.
    // Using the deprecated V2 assembler here produces a snapshot with
    // `year_groups` / `curriculum` keys instead of `classes` / `demand`, so
    // the worker crashes with "Cannot read properties of undefined (reading
    // 'length')" before it ever reaches the sidecar (SCHED-ran-2026-04-16).
    const solverInput = await this.schedulerOrchestration.assembleSolverInputV3(
      tenantId,
      dto.academic_year_id,
    );

    if (dto.solver_seed !== undefined && dto.solver_seed !== null) {
      solverInput.settings.solver_seed = dto.solver_seed;
    }

    // Auto-detect mode from pinned entries in the assembled input.
    // V3 renamed `pinned_entries` -> `pinned`.
    const mode: 'auto' | 'hybrid' = solverInput.pinned.length > 0 ? 'hybrid' : 'auto';

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const run = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedulingRun.create({
        data: {
          tenant_id: tenantId,
          academic_year_id: dto.academic_year_id,
          mode,
          status: 'queued',
          config_snapshot: JSON.parse(JSON.stringify(solverInput)) as Prisma.InputJsonValue,
          solver_seed:
            dto.solver_seed !== undefined && dto.solver_seed !== null
              ? BigInt(dto.solver_seed)
              : null,
          created_by_user_id: userId,
        },
      });
    });

    try {
      await this.schedulingQueue.add(
        'scheduling:solve-v2',
        { tenant_id: tenantId, run_id: run.id },
        { removeOnComplete: 100, removeOnFail: 200 },
      );
    } catch (err) {
      this.logger.error(
        `[SchedulingRunsService.create] failed to enqueue solve-v2 for run ${run.id}`,
        err,
      );
      // Mark the run as failed so the UI doesn't show a ghost "queued" run
      const rollbackClient = createRlsClient(this.prisma, { tenant_id: tenantId });
      await rollbackClient.$transaction(async (tx) => {
        const db = tx as unknown as PrismaService;
        await db.schedulingRun.update({
          where: { id: run.id },
          data: { status: 'failed', failure_reason: 'Failed to enqueue solver job' },
        });
      });
      throw err;
    }

    return this.formatRun(run as unknown as Record<string, unknown>);
  }

  // ─── List runs (excludes large JSONB fields) ───────────────────────────────

  async findAll(tenantId: string, academicYearId: string, pagination: PaginationParams) {
    const { page, pageSize } = pagination;
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
          tenant_id: true,
          academic_year_id: true,
          mode: true,
          status: true,
          hard_constraint_violations: true,
          soft_preference_score: true,
          soft_preference_max: true,
          entries_generated: true,
          entries_pinned: true,
          entries_unassigned: true,
          solver_duration_ms: true,
          solver_seed: true,
          failure_reason: true,
          created_by_user_id: true,
          applied_by_user_id: true,
          applied_at: true,
          created_at: true,
          updated_at: true,
          // Intentionally exclude config_snapshot, result_json, proposed_adjustments
          // (large JSONB fields — only returned in findById)
        },
      }),
      this.prisma.schedulingRun.count({ where }),
    ]);

    return {
      data: data.map((r) => this.formatRunPartial(r)),
      meta: { page, pageSize, total },
    };
  }

  // ─── Get single run with full JSONB + review-shaped entries ──────────────

  async findById(tenantId: string, id: string) {
    const run = await this.prisma.schedulingRun.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${id}" not found`,
      });
    }

    const base = this.formatRun(run as unknown as Record<string, unknown>);
    const review = await this.buildReviewShape(tenantId, run as unknown as Record<string, unknown>);
    const result: Record<string, unknown> = { ...base, ...review };
    return result;
  }

  // Resolve solver output IDs to human-readable labels and build the
  // `entries` + `constraint_report` shape the review UI expects.
  //
  // Names for classes, subjects, and teachers come from `config_snapshot`
  // (built by `SchedulerOrchestrationService.assembleSolverInput` at run
  // creation time) — avoiding cross-module Prisma access. Room names are
  // still resolved via `RoomsReadFacade` because the snapshot only carries
  // room types, not display names.
  private async buildReviewShape(
    tenantId: string,
    run: Record<string, unknown>,
  ): Promise<{
    entries: Array<Record<string, unknown>>;
    period_grids: Record<
      string,
      Array<{
        weekday: number;
        period_order: number;
        start_time: string;
        end_time: string;
        period_type: string;
        supervision_mode: string | null;
      }>
    >;
    class_to_year_group: Record<string, string>;
    constraint_report: {
      hard_violations: number;
      preference_satisfaction_pct: number;
      unassigned_count: number;
      workload_summary: Array<{ teacher: string; periods: number }>;
    };
  }> {
    const resultJson = run['result_json'] as
      | { entries?: Array<Record<string, unknown>> }
      | null
      | undefined;
    const rawEntries = Array.isArray(resultJson?.entries) ? resultJson!.entries : [];

    const snapshot = (run['config_snapshot'] ?? {}) as Record<string, unknown>;
    const classMap = new Map<string, string>();
    const classToYearGroup: Record<string, string> = {};
    const periodGrids: Record<
      string,
      Array<{
        weekday: number;
        period_order: number;
        start_time: string;
        end_time: string;
        period_type: string;
        supervision_mode: string | null;
      }>
    > = {};

    // V3 snapshot shape: `classes[]` at the top level (was nested under
    // `year_groups[].sections[]` in V2). Fall back to the V2 path for any
    // legacy runs created before the V3 switchover.
    const classesArray = Array.isArray(snapshot['classes'])
      ? (snapshot['classes'] as Array<Record<string, unknown>>)
      : [];
    for (const c of classesArray) {
      if (typeof c['class_id'] === 'string' && typeof c['class_name'] === 'string') {
        classMap.set(c['class_id'], c['class_name']);
        if (typeof c['year_group_id'] === 'string') {
          classToYearGroup[c['class_id']] = c['year_group_id'];
        }
      }
    }

    // V3 exposes a flat `period_slots[]` keyed by `year_group_id` — group them
    // back into per-year-group grids for the review UI.
    const periodSlots = Array.isArray(snapshot['period_slots'])
      ? (snapshot['period_slots'] as Array<Record<string, unknown>>)
      : [];
    for (const p of periodSlots) {
      const ygId = typeof p['year_group_id'] === 'string' ? p['year_group_id'] : null;
      if (!ygId) continue;
      const list = periodGrids[ygId] ?? (periodGrids[ygId] = []);
      list.push({
        weekday: Number(p['weekday'] ?? 0),
        period_order: Number(p['period_order'] ?? 0),
        start_time: typeof p['start_time'] === 'string' ? p['start_time'] : '',
        end_time: typeof p['end_time'] === 'string' ? p['end_time'] : '',
        period_type: typeof p['period_type'] === 'string' ? p['period_type'] : 'teaching',
        supervision_mode: typeof p['supervision_mode'] === 'string' ? p['supervision_mode'] : null,
      });
    }

    // Legacy V2 fallback — harmless when `classes` has already populated the
    // map; keeps pre-Stage-11 runs readable.
    const yearGroups = Array.isArray(snapshot['year_groups'])
      ? (snapshot['year_groups'] as Array<Record<string, unknown>>)
      : [];
    for (const yg of yearGroups) {
      const ygId = typeof yg['year_group_id'] === 'string' ? yg['year_group_id'] : null;
      const sections = Array.isArray(yg['sections'])
        ? (yg['sections'] as Array<Record<string, unknown>>)
        : [];
      for (const s of sections) {
        if (typeof s['class_id'] === 'string' && typeof s['class_name'] === 'string') {
          if (!classMap.has(s['class_id'])) {
            classMap.set(s['class_id'], s['class_name']);
            if (ygId) classToYearGroup[s['class_id']] = ygId;
          }
        }
      }
      if (ygId && Array.isArray(yg['period_grid']) && !periodGrids[ygId]) {
        periodGrids[ygId] = (yg['period_grid'] as Array<Record<string, unknown>>).map((p) => ({
          weekday: Number(p['weekday'] ?? 0),
          period_order: Number(p['period_order'] ?? 0),
          start_time: typeof p['start_time'] === 'string' ? p['start_time'] : '',
          end_time: typeof p['end_time'] === 'string' ? p['end_time'] : '',
          period_type: typeof p['period_type'] === 'string' ? p['period_type'] : 'teaching',
          supervision_mode:
            typeof p['supervision_mode'] === 'string' ? p['supervision_mode'] : null,
        }));
      }
    }

    const subjectMap = new Map<string, string>();
    // V3: flat `subjects[]`. V2 read names off `curriculum[]`. Accept both.
    const subjectsArray = Array.isArray(snapshot['subjects'])
      ? (snapshot['subjects'] as Array<Record<string, unknown>>)
      : [];
    for (const s of subjectsArray) {
      if (typeof s['subject_id'] === 'string' && typeof s['subject_name'] === 'string') {
        subjectMap.set(s['subject_id'], s['subject_name']);
      }
    }
    const curriculum = Array.isArray(snapshot['curriculum'])
      ? (snapshot['curriculum'] as Array<Record<string, unknown>>)
      : [];
    for (const c of curriculum) {
      if (
        typeof c['subject_id'] === 'string' &&
        typeof c['subject_name'] === 'string' &&
        !subjectMap.has(c['subject_id'])
      ) {
        subjectMap.set(c['subject_id'], c['subject_name']);
      }
    }

    const teacherMap = new Map<string, string>();
    const teachers = Array.isArray(snapshot['teachers'])
      ? (snapshot['teachers'] as Array<Record<string, unknown>>)
      : [];
    for (const t of teachers) {
      if (typeof t['staff_profile_id'] === 'string' && typeof t['name'] === 'string') {
        teacherMap.set(t['staff_profile_id'], t['name']);
      }
    }

    const rooms = await this.roomsReadFacade.findActiveRoomBasics(tenantId);
    const roomMap = new Map<string, string>(rooms.map((r) => [r.id, r.name]));

    const workload = new Map<string, number>();
    const entries = rawEntries.map((e) => {
      const classId = String(e['class_id'] ?? '');
      const subjectId = typeof e['subject_id'] === 'string' ? e['subject_id'] : null;
      const teacherId = typeof e['teacher_staff_id'] === 'string' ? e['teacher_staff_id'] : null;
      const roomId = typeof e['room_id'] === 'string' ? e['room_id'] : null;
      const weekday = Number(e['weekday'] ?? 0);
      const periodOrder = Number(e['period_order'] ?? 0);

      if (teacherId) {
        const name = teacherMap.get(teacherId) ?? teacherId;
        workload.set(name, (workload.get(name) ?? 0) + 1);
      }

      return {
        id: `${classId}_${weekday}_${periodOrder}`,
        class_id: classId,
        class_name: classMap.get(classId) ?? classId,
        subject_name: subjectId ? (subjectMap.get(subjectId) ?? undefined) : undefined,
        teacher_name: teacherId ? (teacherMap.get(teacherId) ?? undefined) : undefined,
        room_name: roomId ? (roomMap.get(roomId) ?? undefined) : undefined,
        weekday,
        period_order: periodOrder,
        start_time: typeof e['start_time'] === 'string' ? e['start_time'] : '',
        end_time: typeof e['end_time'] === 'string' ? e['end_time'] : '',
        is_pinned: Boolean(e['is_pinned']),
      };
    });

    const workloadSummary = [...workload.entries()]
      .map(([teacher, periods]) => ({ teacher, periods }))
      .sort((a, b) => b.periods - a.periods);

    const softScore =
      run['soft_preference_score'] !== null && run['soft_preference_score'] !== undefined
        ? Number(run['soft_preference_score'])
        : 0;
    const softMax =
      run['soft_preference_max'] !== null && run['soft_preference_max'] !== undefined
        ? Number(run['soft_preference_max'])
        : 0;
    const preferenceSatisfactionPct = softMax > 0 ? Math.round((softScore / softMax) * 100) : 0;

    return {
      entries,
      period_grids: periodGrids,
      class_to_year_group: classToYearGroup,
      constraint_report: {
        hard_violations: Number(run['hard_constraint_violations'] ?? 0),
        preference_satisfaction_pct: preferenceSatisfactionPct,
        unassigned_count: Number(run['entries_unassigned'] ?? 0),
        workload_summary: workloadSummary,
      },
    };
  }

  // ─── Get progress (reads from DB row updated by worker) ───────────────────

  async getProgress(tenantId: string, id: string) {
    const run = await this.prisma.schedulingRun.findFirst({
      where: { id, tenant_id: tenantId },
      select: {
        id: true,
        status: true,
        entries_generated: true,
        entries_pinned: true,
        entries_unassigned: true,
        solver_duration_ms: true,
        failure_reason: true,
        created_at: true,
        updated_at: true,
        // ``config_snapshot`` carries the full SolverInputV3 the run was
        // created with; we pull the demand array length out so the UI can
        // show a live "0 / 330 placed" denominator while the solver is
        // still running (previously the progress endpoint returned
        // entries_total=0 throughout the entire solve — see SCHED
        // E2E report 2026-04-17, run 5a38a832). The field is `Json` in
        // Prisma so the type is unknown; we extract length defensively.
        config_snapshot: true,
      },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${id}" not found`,
      });
    }

    const phase =
      run.status === 'queued'
        ? 'preparing'
        : run.status === 'running'
          ? 'solving'
          : run.status === 'completed' || run.status === 'applied'
            ? 'complete'
            : 'failed';

    // `entries_assigned` was historically derived as
    // `entries_generated - entries_unassigned`, which goes negative when the
    // solver drops more slots than it places (e.g. room-shortage infeasibility
    // runs). Clamp to zero and surface raw counters separately so the UI can
    // render progress/total without ever showing a negative — SCHED-021.
    const placed = run.entries_generated ?? 0;
    const unassigned = run.entries_unassigned ?? 0;

    // Derive a live elapsed_ms while the run is still in-flight. The worker
    // only writes ``solver_duration_ms`` after the solve returns; during
    // the solve that column is NULL and returning 0 made the UI appear
    // frozen ("Improving · 0:00" for 60 minutes). For queued/running rows
    // we compute elapsed from ``created_at`` on the server so every client
    // gets a consistent timer without relying on its own clock.
    const elapsedMs =
      run.solver_duration_ms ??
      (run.status === 'queued' || run.status === 'running'
        ? Math.max(0, Date.now() - run.created_at.getTime())
        : 0);

    // Total demand — known up-front from ``config_snapshot.demand``. Until
    // the solver writes results, ``placed + unassigned === 0``; falling
    // back to the snapshot gives the UI a trustworthy denominator from
    // second 0 of the run.
    const snapshotDemandTotal = extractSnapshotDemandTotal(run.config_snapshot);
    const observedTotal = placed + unassigned;
    const entriesTotal = observedTotal > 0 ? observedTotal : snapshotDemandTotal;

    return {
      id: run.id,
      status: run.status,
      phase,
      entries_assigned: Math.max(0, placed - unassigned),
      entries_placed: placed,
      entries_unassigned: unassigned,
      entries_total: entriesTotal,
      elapsed_ms: elapsedMs,
      failure_reason: run.failure_reason,
      updated_at: run.updated_at.toISOString(),
    };
  }

  // ─── Cancel a run ─────────────────────────────────────────────────────────

  async cancel(tenantId: string, id: string) {
    const run = await this.prisma.schedulingRun.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${id}" not found`,
      });
    }

    if (!['queued', 'running'].includes(run.status)) {
      throw new BadRequestException({
        code: 'RUN_NOT_CANCELLABLE',
        message: `Cannot cancel a run with status "${run.status}". Only queued or running runs can be cancelled.`,
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedulingRun.update({
        where: { id },
        data: {
          status: 'failed',
          failure_reason: 'Cancelled by user',
        },
      });
    });

    return this.formatRun(updated as unknown as Record<string, unknown>);
  }

  // ─── Stop the solver and accept its current best solution ────────────────
  //
  // Sends DELETE /solve/{runId} to the solver-py sidecar. This sets the
  // cooperative cancel flag that EarlyStopCallback checks on every CP-SAT
  // solution callback — on the next fire the solver halts with
  // reason='cancelled' and returns the best-seen solution so far. The worker
  // then persists that partial solution as status='completed' via its normal
  // end-of-solve write path (the worker does NOT distinguish cancelled from
  // naturally-finished once the solver has returned entries).
  //
  // This is the "I'm happy with what I have, stop polishing" action. It's
  // deliberately NOT destructive: the run row stays 'running' until the
  // worker commits — we don't race the worker write here, we just poke the
  // solver. Contrast with /cancel which marks the run as failed and uses a
  // conditional updateMany in the worker to discard any in-flight results.
  async stopAndAccept(tenantId: string, id: string) {
    const run = await this.prisma.schedulingRun.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${id}" not found`,
      });
    }

    if (run.status !== 'running') {
      throw new BadRequestException({
        code: 'RUN_NOT_HALTABLE',
        message:
          `Cannot stop-and-accept a run with status "${run.status}". ` +
          `Only actively-running runs can be halted — queued runs haven't started yet, ` +
          `and terminal runs already have a final result.`,
      });
    }

    // Fire the DELETE to solver-py. The sidecar returns 200 immediately once
    // the cancel flag is raised — the actual CP-SAT halt happens on the next
    // OnSolutionCallback inside the solver worker thread. We don't await the
    // worker commit here: the progress poller will see the updated row.
    const sidecarUrl = process.env.SOLVER_PY_URL ?? 'http://localhost:5557';
    let sidecarOk = false;
    try {
      const res = await fetch(`${sidecarUrl}/solve/${id}`, {
        method: 'DELETE',
        signal: AbortSignal.timeout(5000),
      });
      sidecarOk = res.ok;
      if (!res.ok && res.status !== 404) {
        this.logger.warn(
          `solver-py DELETE /solve/${id} returned ${res.status} — solver may not halt cleanly`,
        );
      }
    } catch (err) {
      this.logger.warn(`solver-py DELETE /solve/${id} failed: ${(err as Error).message}`);
    }

    return {
      id,
      requested: true,
      sidecar_ack: sidecarOk,
      note:
        'The solver has been asked to halt and return its current best solution. ' +
        'Results will appear once the solver finishes writing (usually within a few seconds).',
    };
  }

  // ─── Add an adjustment to a completed run ─────────────────────────────────

  async addAdjustment(tenantId: string, id: string, dto: AddAdjustmentDto) {
    const run = await this.prisma.schedulingRun.findFirst({
      where: { id, tenant_id: tenantId },
      select: {
        id: true,
        status: true,
        updated_at: true,
        proposed_adjustments: true,
      },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${id}" not found`,
      });
    }

    if (run.status !== 'completed') {
      throw new BadRequestException({
        code: 'RUN_NOT_ADJUSTABLE',
        message: `Adjustments can only be added to completed runs. Current status: "${run.status}"`,
      });
    }

    // Optimistic concurrency check
    const expectedAt = new Date(dto.expected_updated_at).toISOString();
    const actualAt = run.updated_at.toISOString();
    if (expectedAt !== actualAt) {
      throw new ConflictException({
        code: 'STALE_RUN',
        message: 'The run has been modified since you last loaded it. Reload and try again.',
        details: { expected_updated_at: expectedAt, actual_updated_at: actualAt },
      });
    }

    // Append the adjustment to the array
    const existing = Array.isArray(run.proposed_adjustments)
      ? (run.proposed_adjustments as SchedulingAdjustment[])
      : [];

    const updated_adjustments: SchedulingAdjustment[] = [...existing, dto.adjustment];

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedulingRun.update({
        where: { id },
        data: {
          proposed_adjustments: updated_adjustments as unknown as Prisma.InputJsonValue,
        },
      });
    });

    return this.formatRun(updated as unknown as Record<string, unknown>);
  }

  // ─── Discard a completed run ───────────────────────────────────────────────

  async discard(tenantId: string, id: string, dto: DiscardRunDto) {
    const run = await this.prisma.schedulingRun.findFirst({
      where: { id, tenant_id: tenantId },
      select: { id: true, status: true, updated_at: true },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${id}" not found`,
      });
    }

    if (run.status !== 'completed') {
      throw new BadRequestException({
        code: 'RUN_NOT_DISCARDABLE',
        message: `Only completed runs can be discarded. Current status: "${run.status}"`,
      });
    }

    // Optimistic concurrency check
    const expectedAt = new Date(dto.expected_updated_at).toISOString();
    const actualAt = run.updated_at.toISOString();
    if (expectedAt !== actualAt) {
      throw new ConflictException({
        code: 'STALE_RUN',
        message: 'The run has been modified since you last loaded it. Reload and try again.',
        details: { expected_updated_at: expectedAt, actual_updated_at: actualAt },
      });
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const updated = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedulingRun.update({
        where: { id },
        data: { status: 'discarded' },
      });
    });

    return this.formatRun(updated as unknown as Record<string, unknown>);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private formatRunPartial(run: Record<string, unknown>): Record<string, unknown> {
    return {
      ...run,
      solver_seed:
        run['solver_seed'] !== null && run['solver_seed'] !== undefined
          ? Number(run['solver_seed'])
          : null,
      soft_preference_score:
        run['soft_preference_score'] !== null ? Number(run['soft_preference_score']) : null,
      soft_preference_max:
        run['soft_preference_max'] !== null ? Number(run['soft_preference_max']) : null,
      created_at:
        run['created_at'] instanceof Date
          ? (run['created_at'] as Date).toISOString()
          : run['created_at'],
      updated_at:
        run['updated_at'] instanceof Date
          ? (run['updated_at'] as Date).toISOString()
          : run['updated_at'],
      applied_at:
        run['applied_at'] instanceof Date
          ? (run['applied_at'] as Date).toISOString()
          : run['applied_at'],
    };
  }

  private formatRun(run: Record<string, unknown>): Record<string, unknown> {
    return this.formatRunPartial(run);
  }

  // ─── Public helper used by SchedulingApplyService ─────────────────────────

  async assertExists(tenantId: string, id: string) {
    const run = await this.prisma.schedulingRun.findFirst({
      where: { id, tenant_id: tenantId },
    });

    if (!run) {
      throw new NotFoundException({
        code: 'SCHEDULING_RUN_NOT_FOUND',
        message: `Scheduling run "${id}" not found`,
      });
    }

    return run;
  }

  // ─── Expose result_json type helper ───────────────────────────────────────

  parseResultJson(raw: unknown): SchedulingResultJson | null {
    if (!raw || typeof raw !== 'object') return null;
    const obj = raw as Record<string, unknown>;
    if (!Array.isArray(obj['entries'])) return null;
    return raw as SchedulingResultJson;
  }
}

// ─── Progress helpers ────────────────────────────────────────────────────────

// Defensively extract total demanded periods from the run's
// ``config_snapshot`` JSONB blob. Each demand entry is one (class,
// subject) pair with a ``periods_per_week`` integer — summing that
// gives the total number of periods the solver will try to place
// (matches the ``placed + unassigned`` total the solver reports on
// completion). Returns 0 when the shape isn't what we expect — callers
// treat 0 as "no total yet" and show the raw placed count only.
//
// Prior behaviour returned ``demand.length`` (count of class×subject
// pairs), which under-reported the total by ~4× on NHQS-shaped inputs
// (91 pairs × avg 3.6 periods_per_week ≈ 330 periods) — observed
// 2026-04-17 E2E, "0 OF 91 SLOTS ASSIGNED" instead of "0 OF 330".
function extractSnapshotDemandTotal(snapshot: unknown): number {
  if (!snapshot || typeof snapshot !== 'object') return 0;
  const record = snapshot as Record<string, unknown>;
  const demand = record.demand;
  if (!Array.isArray(demand)) return 0;
  let total = 0;
  for (const entry of demand) {
    if (entry && typeof entry === 'object') {
      const ppw = (entry as Record<string, unknown>).periods_per_week;
      if (typeof ppw === 'number' && Number.isFinite(ppw) && ppw > 0) {
        total += Math.floor(ppw);
      }
    }
  }
  return total;
}
