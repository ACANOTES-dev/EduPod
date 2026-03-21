import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  AddAdjustmentDto,
  CreateSchedulingRunDto,
  DiscardRunDto,
  SchedulingResultJson,
  SchedulingAdjustment,
} from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { PrismaService } from '../prisma/prisma.service';

import { SchedulingPrerequisitesService } from './scheduling-prerequisites.service';

interface PaginationParams {
  page: number;
  pageSize: number;
}

@Injectable()
export class SchedulingRunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly prerequisites: SchedulingPrerequisitesService,
  ) {}

  // ─── Create a new scheduling run ──────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSchedulingRunDto) {
    // Verify the academic year belongs to this tenant
    const academicYear = await this.prisma.academicYear.findFirst({
      where: { id: dto.academic_year_id, tenant_id: tenantId },
      select: { id: true },
    });

    if (!academicYear) {
      throw new NotFoundException({
        code: 'ACADEMIC_YEAR_NOT_FOUND',
        message: `Academic year "${dto.academic_year_id}" not found`,
      });
    }

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

    // Auto-detect mode: if there are any pinned entries, it's hybrid
    const pinnedCount = await this.prisma.schedule.count({
      where: {
        tenant_id: tenantId,
        academic_year_id: dto.academic_year_id,
        is_pinned: true,
        OR: [{ effective_end_date: null }, { effective_end_date: { gte: new Date() } }],
      },
    });
    const mode: 'auto' | 'hybrid' = pinnedCount > 0 ? 'hybrid' : 'auto';

    // Build config snapshot
    const configSnapshot = {
      academic_year_id: dto.academic_year_id,
      solver_seed: dto.solver_seed ?? null,
      mode,
      created_at: new Date().toISOString(),
      // The worker will read this and compute the full grid hash when it runs
      grid_hash: null as string | null,
    };

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    const run = await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      return db.schedulingRun.create({
        data: {
          tenant_id: tenantId,
          academic_year_id: dto.academic_year_id,
          mode,
          status: 'queued',
          config_snapshot: configSnapshot,
          solver_seed: dto.solver_seed !== undefined && dto.solver_seed !== null
            ? BigInt(dto.solver_seed)
            : null,
          created_by_user_id: userId,
        },
      });
    });

    // TODO: Enqueue the solver job once BullMQ is registered in the API module.
    // Pattern:
    //   await this.schedulingQueue.add('scheduling:solve', {
    //     tenant_id: tenantId,
    //     run_id: run.id,
    //     academic_year_id: dto.academic_year_id,
    //   });
    // For now, the worker polls for 'queued' runs directly.

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

  // ─── Get single run with full JSONB ───────────────────────────────────────

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

    return this.formatRun(run as unknown as Record<string, unknown>);
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
        message:
          'The run has been modified since you last loaded it. Reload and try again.',
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
        message:
          'The run has been modified since you last loaded it. Reload and try again.',
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
      solver_seed: run['solver_seed'] !== null && run['solver_seed'] !== undefined
        ? Number(run['solver_seed'])
        : null,
      soft_preference_score: run['soft_preference_score'] !== null
        ? Number(run['soft_preference_score'])
        : null,
      soft_preference_max: run['soft_preference_max'] !== null
        ? Number(run['soft_preference_max'])
        : null,
      created_at: run['created_at'] instanceof Date
        ? (run['created_at'] as Date).toISOString()
        : run['created_at'],
      updated_at: run['updated_at'] instanceof Date
        ? (run['updated_at'] as Date).toISOString()
        : run['updated_at'],
      applied_at: run['applied_at'] instanceof Date
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
