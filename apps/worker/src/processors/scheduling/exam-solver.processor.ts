import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { Job } from 'bullmq';

import { CpSatSolveError, solveExamViaCpSat } from '../../../../../packages/shared/src/scheduler';
import type {
  ExamSolverExam,
  ExamSolverInput,
  ExamSolverInvigilator,
  ExamSolverRoom,
} from '../../../../../packages/shared/src/schemas/exam-scheduling.schema';
import { QUEUE_NAMES } from '../../base/queue.constants';
import { TenantAwareJob, type TenantJobPayload } from '../../base/tenant-aware-job';

// ─── Job contract ─────────────────────────────────────────────────────────────

export interface ExamSolverPayload extends TenantJobPayload {
  tenant_id: string;
  solve_job_id: string;
  exam_session_id: string;
}

export const EXAM_SOLVE_JOB = 'scheduling:exam-solve';

// Budget ceiling. Client-side the frontend sends `max_solver_duration_seconds`
// up to 450; we add +60s HTTP slack like the timetable solver uses.
const HTTP_TIMEOUT_FLOOR_MS = 120_000;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeToHhmm(d: Date): string {
  return d.toISOString().slice(11, 16);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Processor ────────────────────────────────────────────────────────────────

@Processor(QUEUE_NAMES.EXAM_SCHEDULING, {
  lockDuration: 600_000,
  stalledInterval: 60_000,
  maxStalledCount: 2,
})
export class ExamSolverProcessor extends WorkerHost {
  private readonly logger = new Logger(ExamSolverProcessor.name);

  constructor(@Inject('PRISMA_CLIENT') private readonly prisma: PrismaClient) {
    super();
  }

  async process(job: Job<ExamSolverPayload>): Promise<void> {
    // Sibling processor on the same queue — ignore anything that isn't ours.
    if (job.name !== EXAM_SOLVE_JOB) return;

    this.logger.log(`Processing ${EXAM_SOLVE_JOB} — solve_job ${job.data.solve_job_id}`);

    const runner = new ExamSolverRunner(this.prisma, job);
    try {
      await runner.execute(job.data);
    } catch (err) {
      const message =
        err instanceof CpSatSolveError
          ? `${err.code}: ${err.message}`
          : err instanceof Error
            ? err.message
            : 'Unknown exam-solver error';
      this.logger.error(`Exam solve failed for ${job.data.solve_job_id}: ${message}`);
      try {
        await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${job.data.tenant_id}::text, true)`;
          await tx.examSolveJob.update({
            where: { id: job.data.solve_job_id },
            data: {
              status: 'failed',
              failure_reason: message,
              finished_at: new Date(),
            },
          });
        });
      } catch (updateErr) {
        this.logger.error(
          `Failed to mark exam solve job ${job.data.solve_job_id} as failed: ${updateErr}`,
        );
      }
      throw err;
    }
  }
}

// ─── Runner — the actual solve logic (three-step pattern) ─────────────────────

class ExamSolverRunner extends TenantAwareJob<ExamSolverPayload> {
  private readonly logger = new Logger(ExamSolverRunner.name);

  // Matches the class-scheduling long-job pattern: transaction timeout covers
  // the worst-case solver budget (450s) plus pre-solve fetch + post-solve
  // persistence overhead.
  protected override readonly transactionTimeoutMs: number = 600 * 1000;

  constructor(
    prisma: PrismaClient,
    private readonly job: Job<ExamSolverPayload>,
  ) {
    super(prisma);
  }

  // The outer TenantAwareJob wrapper opens a tx used only for validation and
  // correlation logging. All DB work happens in dedicated short transactions
  // below so the solve row stays unlocked during the CPU-bound sidecar call.
  protected async processJob(data: ExamSolverPayload): Promise<void> {
    const { solve_job_id, tenant_id, exam_session_id } = data;

    // ─── Step 1: claim the run ────────────────────────────────────────────────
    const claim = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant_id}::text, true)`;
      const row = await tx.examSolveJob.findFirst({ where: { id: solve_job_id } });
      if (!row) return { outcome: 'missing' as const, row: null };
      if (row.status === 'queued') {
        const updated = await tx.examSolveJob.update({
          where: { id: solve_job_id },
          data: { status: 'running', started_at: new Date() },
        });
        return { outcome: 'claimed' as const, row: updated };
      }
      if (row.status === 'running') {
        await tx.examSolveJob.update({
          where: { id: solve_job_id },
          data: {
            status: 'failed',
            failure_reason: 'Worker crashed mid-solve — BullMQ retry reaped the run',
            finished_at: new Date(),
          },
        });
        return { outcome: 'crash-retry' as const, row };
      }
      return { outcome: 'terminal' as const, row };
    });

    if (claim.outcome === 'missing') {
      this.logger.warn(`Exam solve job ${solve_job_id} not found, skipping`);
      return;
    }
    if (claim.outcome !== 'claimed') {
      this.logger.warn(
        `Exam solve job ${solve_job_id} not in queued state (${claim.outcome}), skipping`,
      );
      return;
    }
    const solveJob = claim.row;
    if (!solveJob) return;

    // ─── Step 2: build inputs + run the solver ────────────────────────────────
    const inputs = await this.loadSolveInputs(tenant_id, exam_session_id);
    const exams = this.buildExams(inputs.subjectConfigs, inputs.ygStudentCounts);
    if (exams.length === 0) {
      await this.markFailed(
        tenant_id,
        solve_job_id,
        'No examinable subjects with enrolled students',
      );
      return;
    }

    const solverInput: ExamSolverInput = {
      session_id: exam_session_id,
      start_date: isoDate(inputs.session.start_date),
      end_date: isoDate(inputs.session.end_date),
      allowed_weekdays: inputs.config.allowed_weekdays,
      morning_window: {
        start: timeToHhmm(inputs.config.morning_start),
        end: timeToHhmm(inputs.config.morning_end),
      },
      afternoon_window: {
        start: timeToHhmm(inputs.config.afternoon_start),
        end: timeToHhmm(inputs.config.afternoon_end),
      },
      min_gap_minutes: inputs.config.min_gap_minutes_same_student,
      max_exams_per_day_per_yg: inputs.config.max_exams_per_day_per_yg,
      max_solver_duration_seconds: solveJob.max_solver_duration_seconds,
      exams,
      rooms: inputs.rooms,
      invigilators: inputs.invigilators,
    };

    // Heartbeat — extend BullMQ lock + bump updated_at while the sidecar is
    // busy so the progress endpoint surfaces a live timestamp.
    const extendTimer = setInterval(() => {
      this.job.extendLock(this.job.token!, 300_000).catch((err) => {
        this.logger.warn(`Failed to extend lock for exam solve ${solve_job_id}: ${err}`);
      });
      this.prisma
        .$transaction(async (tx) => {
          await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant_id}::text, true)`;
          await tx.$executeRaw`UPDATE exam_solve_jobs SET updated_at = NOW() WHERE id = ${solve_job_id}::uuid AND status = 'running'`;
        })
        .catch((err) => this.logger.warn(`Heartbeat failed for ${solve_job_id}: ${err}`));
    }, 60_000);

    const sidecarUrl = process.env.SOLVER_PY_URL ?? 'http://localhost:5557';
    const budgetTimeoutMs = (solveJob.max_solver_duration_seconds + 60) * 1000;
    const httpTimeoutMs = Math.max(HTTP_TIMEOUT_FLOOR_MS, budgetTimeoutMs);

    const started = Date.now();
    let output;
    try {
      output = await solveExamViaCpSat(solverInput, {
        baseUrl: sidecarUrl,
        timeoutMs: httpTimeoutMs,
      });
    } finally {
      clearInterval(extendTimer);
    }
    const elapsedMs = Date.now() - started;

    // ─── Step 3: persist exam slots + mark job complete ───────────────────────
    const persisted = await this.persistOutput(tenant_id, exam_session_id, exams, output);

    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenant_id}::text, true)`;
      await tx.examSolveJob.updateMany({
        where: { id: solve_job_id, status: 'running' },
        data: {
          status: 'completed',
          placed: output.slots.length,
          total: exams.length,
          slots_written: persisted,
          solve_time_ms: output.solve_time_ms,
          failure_reason:
            output.status === 'infeasible' || output.status === 'unknown'
              ? (output.message ??
                'Solver could not place every exam — widen the session or add resources')
              : null,
          result_meta: {
            solve_status: output.status,
            sidecar_duration_ms: output.solve_time_ms,
            elapsed_ms: elapsedMs,
            placed: output.slots.length,
            total: exams.length,
          },
          finished_at: new Date(),
        },
      });
    });

    this.logger.log(
      `Exam solve ${solve_job_id} completed: ${output.slots.length}/${exams.length} placed in ${elapsedMs}ms (solver ${output.solve_time_ms}ms, status=${output.status})`,
    );
  }

  private async markFailed(tenantId: string, solveJobId: string, reason: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;
      await tx.examSolveJob.update({
        where: { id: solveJobId },
        data: { status: 'failed', failure_reason: reason, finished_at: new Date() },
      });
    });
  }

  // ─── Input assembly (ported from ExamSolverOrchestrationService) ────────────

  private async loadSolveInputs(tenantId: string, sessionId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;

      const session = await tx.examSession.findFirst({
        where: { id: sessionId, tenant_id: tenantId },
        select: { id: true, start_date: true, end_date: true },
      });
      if (!session) throw new Error(`Exam session ${sessionId} not found`);

      const config = await tx.examSessionConfig.findFirst({
        where: { tenant_id: tenantId, exam_session_id: sessionId },
      });
      if (!config) throw new Error('Session config missing — configure the window first');

      const subjectConfigs = await tx.examSubjectConfig.findMany({
        where: { tenant_id: tenantId, exam_session_id: sessionId, is_examinable: true },
      });

      const poolRows = await tx.examInvigilatorPool.findMany({
        where: { tenant_id: tenantId, exam_session_id: sessionId },
        select: { staff_profile_id: true },
      });
      const invigilators: ExamSolverInvigilator[] = poolRows.map((p) => ({
        staff_profile_id: p.staff_profile_id,
      }));

      const roomRows = await tx.room.findMany({
        where: { tenant_id: tenantId, active: true },
        select: { id: true, capacity: true },
      });
      const rooms: ExamSolverRoom[] = roomRows
        .filter((r) => r.capacity !== null && r.capacity > 0)
        .map((r) => ({ room_id: r.id, capacity: r.capacity ?? 0 }));

      // Curriculum-aware student-count map: sum of active enrolments per
      // (year_group, subject) pair present in the curriculum matrix. Mirrors
      // CurriculumMatrixService.findExamCurriculumPairs on the API side.
      const configs = await tx.classSubjectGradeConfig.findMany({
        where: {
          tenant_id: tenantId,
          class_entity: { status: 'active', year_group_id: { not: null } },
          subject: { active: true, subject_type: 'academic' },
        },
        select: {
          subject_id: true,
          class_entity: {
            select: {
              year_group_id: true,
              _count: { select: { class_enrolments: { where: { status: 'active' } } } },
            },
          },
        },
      });

      const ygStudentCounts = new Map<string, number>();
      for (const c of configs) {
        const ygId = c.class_entity.year_group_id;
        if (!ygId) continue;
        const key = `${ygId}:${c.subject_id}`;
        ygStudentCounts.set(
          key,
          (ygStudentCounts.get(key) ?? 0) + c.class_entity._count.class_enrolments,
        );
      }

      return { session, config, subjectConfigs, invigilators, rooms, ygStudentCounts };
    });
  }

  private buildExams(
    subjectConfigs: Array<{
      id: string;
      year_group_id: string;
      subject_id: string;
      paper_count: number;
      paper_1_duration_mins: number;
      paper_2_duration_mins: number | null;
      mode: string;
      invigilators_required: number;
    }>,
    ygStudentCounts: Map<string, number>,
  ): ExamSolverExam[] {
    const out: ExamSolverExam[] = [];
    for (const cfg of subjectConfigs) {
      const students = ygStudentCounts.get(`${cfg.year_group_id}:${cfg.subject_id}`) ?? 0;
      if (students === 0) continue;
      const mode: 'in_person' | 'online' = cfg.mode === 'online' ? 'online' : 'in_person';
      out.push({
        exam_subject_config_id: cfg.id,
        year_group_id: cfg.year_group_id,
        subject_id: cfg.subject_id,
        paper_number: 1,
        duration_minutes: cfg.paper_1_duration_mins,
        student_count: students,
        invigilators_required: cfg.invigilators_required,
        mode,
      });
      if (cfg.paper_count === 2 && cfg.paper_2_duration_mins) {
        out.push({
          exam_subject_config_id: cfg.id,
          year_group_id: cfg.year_group_id,
          subject_id: cfg.subject_id,
          paper_number: 2,
          duration_minutes: cfg.paper_2_duration_mins,
          student_count: students,
          invigilators_required: cfg.invigilators_required,
          mode,
        });
      }
    }
    return out;
  }

  private async persistOutput(
    tenantId: string,
    sessionId: string,
    exams: ExamSolverExam[],
    output: Awaited<ReturnType<typeof solveExamViaCpSat>>,
  ): Promise<number> {
    const byKey = new Map<string, ExamSolverExam>();
    for (const e of exams) {
      byKey.set(`${e.exam_subject_config_id}:${e.paper_number}`, e);
    }

    let written = 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}::text, true)`;

      // Clear prior slots — a solve always replaces, never merges.
      await tx.examSlot.deleteMany({
        where: { tenant_id: tenantId, exam_session_id: sessionId },
      });

      for (const s of output.slots) {
        const exam = byKey.get(`${s.exam_subject_config_id}:${s.paper_number}`);
        if (!exam) continue;

        const slot = await tx.examSlot.create({
          data: {
            tenant_id: tenantId,
            exam_session_id: sessionId,
            subject_id: exam.subject_id,
            year_group_id: exam.year_group_id,
            date: new Date(`${s.date}T00:00:00.000Z`),
            start_time: new Date(`1970-01-01T${s.start_time}:00.000Z`),
            end_time: new Date(`1970-01-01T${s.end_time}:00.000Z`),
            duration_minutes: exam.duration_minutes,
            student_count: exam.student_count,
            paper_number: exam.paper_number,
            exam_subject_config_id: exam.exam_subject_config_id,
            room_id: s.room_assignments[0]?.room_id ?? null,
          },
        });

        const roomRecords: Array<{ room_id: string; slot_room_id: string }> = [];
        for (const r of s.room_assignments) {
          const rr = await tx.examSlotRoom.create({
            data: {
              tenant_id: tenantId,
              exam_slot_id: slot.id,
              room_id: r.room_id,
              capacity: r.student_count_in_room,
            },
          });
          roomRecords.push({ room_id: r.room_id, slot_room_id: rr.id });
        }

        for (let i = 0; i < s.invigilator_ids.length; i++) {
          const staffId = s.invigilator_ids[i];
          if (!staffId) continue;
          const assignedRoom =
            roomRecords.length > 0 ? roomRecords[i % roomRecords.length] : undefined;
          await tx.examInvigilation.create({
            data: {
              tenant_id: tenantId,
              exam_slot_id: slot.id,
              staff_profile_id: staffId,
              role: i === 0 ? 'lead' : 'assistant',
              exam_slot_room_id: assignedRoom?.slot_room_id ?? null,
            },
          });
        }
        written++;
      }
    });

    return written;
  }
}
