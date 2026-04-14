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

    // Assemble the full solver input — the worker's solve-v2 processor reads
    // `config_snapshot` as a `SolverInputV2` directly. A minimal stub would
    // crash the processor on `configSnapshot.year_groups.length`.
    const solverInput = await this.schedulerOrchestration.assembleSolverInput(
      tenantId,
      dto.academic_year_id,
    );

    if (dto.solver_seed !== undefined && dto.solver_seed !== null) {
      solverInput.settings.solver_seed = dto.solver_seed;
    }

    // Auto-detect mode from pinned entries in the assembled input.
    const mode: 'auto' | 'hybrid' = solverInput.pinned_entries.length > 0 ? 'hybrid' : 'auto';

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
    const yearGroups = Array.isArray(snapshot['year_groups'])
      ? (snapshot['year_groups'] as Array<Record<string, unknown>>)
      : [];
    for (const yg of yearGroups) {
      const sections = Array.isArray(yg['sections'])
        ? (yg['sections'] as Array<Record<string, unknown>>)
        : [];
      for (const s of sections) {
        if (typeof s['class_id'] === 'string' && typeof s['class_name'] === 'string') {
          classMap.set(s['class_id'], s['class_name']);
        }
      }
    }

    const subjectMap = new Map<string, string>();
    const curriculum = Array.isArray(snapshot['curriculum'])
      ? (snapshot['curriculum'] as Array<Record<string, unknown>>)
      : [];
    for (const c of curriculum) {
      if (typeof c['subject_id'] === 'string' && typeof c['subject_name'] === 'string') {
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
        updated_at: true,
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

    return {
      id: run.id,
      status: run.status,
      phase,
      entries_assigned: (run.entries_generated ?? 0) - (run.entries_unassigned ?? 0),
      entries_total: run.entries_generated,
      elapsed_ms: run.solver_duration_ms ?? 0,
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
