import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Queue } from 'bullmq';

import type { TriggerExamSolverDto } from '@school/shared';

import { PrismaService } from '../prisma/prisma.service';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EnqueueSolveResult {
  solve_job_id: string;
  status: 'queued';
}

export interface SolveJobProgress {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  placed: number;
  total: number;
  slots_written: number;
  solve_time_ms: number;
  elapsed_ms: number;
  failure_reason: string | null;
  started_at: string | null;
  finished_at: string | null;
  updated_at: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ExamSolverOrchestrationService {
  private readonly logger = new Logger(ExamSolverOrchestrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue('exam-scheduling') private readonly examQueue: Queue,
  ) {}

  // ─── Enqueue a solve (returns immediately) ────────────────────────────────

  async enqueueSolve(
    tenantId: string,
    sessionId: string,
    dto: TriggerExamSolverDto,
    userId: string | null,
  ): Promise<EnqueueSolveResult> {
    // Preflight validation — fail fast if the session is missing or has
    // obvious gaps. The worker repeats these checks defensively, but
    // surfacing them here avoids burning a BullMQ slot on a no-op.
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true, status: true },
    });
    if (!session) {
      throw new NotFoundException({
        error: { code: 'EXAM_SESSION_NOT_FOUND', message: 'Exam session not found' },
      });
    }
    if (session.status !== 'planning') {
      throw new BadRequestException({
        error: {
          code: 'SESSION_NOT_EDITABLE',
          message: 'Can only solve a session that is in planning status',
        },
      });
    }

    const subjectCount = await this.prisma.examSubjectConfig.count({
      where: { tenant_id: tenantId, exam_session_id: sessionId, is_examinable: true },
    });
    if (subjectCount === 0) {
      throw new BadRequestException({
        error: {
          code: 'NO_EXAMINABLE_SUBJECTS',
          message: 'Mark at least one subject as examinable before generating',
        },
      });
    }

    const poolCount = await this.prisma.examInvigilatorPool.count({
      where: { tenant_id: tenantId, exam_session_id: sessionId },
    });
    if (poolCount === 0) {
      throw new BadRequestException({
        error: {
          code: 'INVIGILATOR_POOL_EMPTY',
          message: 'Add at least one invigilator to the pool before generating',
        },
      });
    }

    const config = await this.prisma.examSessionConfig.findFirst({
      where: { tenant_id: tenantId, exam_session_id: sessionId },
      select: { id: true },
    });
    if (!config) {
      throw new BadRequestException({
        error: {
          code: 'SESSION_CONFIG_MISSING',
          message: 'Configure the session window before generating the schedule',
        },
      });
    }

    // Persist the job row BEFORE enqueuing so the worker always has a durable
    // record to claim. Polling starts hitting this row immediately.
    const solveJob = await this.prisma.examSolveJob.create({
      data: {
        tenant_id: tenantId,
        exam_session_id: sessionId,
        status: 'queued',
        max_solver_duration_seconds: dto.max_solver_duration_seconds,
        created_by_user_id: userId,
      },
      select: { id: true },
    });

    await this.examQueue.add(
      'scheduling:exam-solve',
      {
        tenant_id: tenantId,
        solve_job_id: solveJob.id,
        exam_session_id: sessionId,
      },
      {
        removeOnComplete: 50,
        removeOnFail: 100,
      },
    );

    this.logger.log(
      `Enqueued exam solve ${solveJob.id} for session ${sessionId} (budget ${dto.max_solver_duration_seconds}s)`,
    );

    return { solve_job_id: solveJob.id, status: 'queued' };
  }

  // ─── Poll progress ────────────────────────────────────────────────────────

  async getSolveProgress(tenantId: string, solveJobId: string): Promise<SolveJobProgress> {
    const row = await this.prisma.examSolveJob.findFirst({
      where: { id: solveJobId, tenant_id: tenantId },
    });
    if (!row) {
      throw new NotFoundException({
        error: { code: 'SOLVE_JOB_NOT_FOUND', message: 'Exam solve job not found' },
      });
    }

    const elapsedMs = row.started_at
      ? (row.finished_at ?? new Date()).getTime() - row.started_at.getTime()
      : 0;

    return {
      id: row.id,
      status: row.status,
      placed: row.placed,
      total: row.total,
      slots_written: row.slots_written,
      solve_time_ms: row.solve_time_ms,
      elapsed_ms: elapsedMs,
      failure_reason: row.failure_reason,
      started_at: row.started_at?.toISOString() ?? null,
      finished_at: row.finished_at?.toISOString() ?? null,
      updated_at: row.updated_at.toISOString(),
    };
  }

  // ─── Cancel (cooperative) ─────────────────────────────────────────────────

  async cancelSolve(tenantId: string, solveJobId: string): Promise<{ cancelled: boolean }> {
    const row = await this.prisma.examSolveJob.findFirst({
      where: { id: solveJobId, tenant_id: tenantId },
      select: { id: true, status: true },
    });
    if (!row) {
      throw new NotFoundException({
        error: { code: 'SOLVE_JOB_NOT_FOUND', message: 'Exam solve job not found' },
      });
    }

    // Already terminal — no-op.
    if (row.status !== 'queued' && row.status !== 'running') {
      return { cancelled: false };
    }

    await this.prisma.examSolveJob.update({
      where: { id: solveJobId },
      data: {
        status: 'cancelled',
        finished_at: new Date(),
        failure_reason: 'Cancelled by user',
      },
    });

    // Worker's Step 3 conditional updateMany on status='running' respects this
    // cancel — if the sidecar is mid-call, its result is dropped on write.
    return { cancelled: true };
  }
}
