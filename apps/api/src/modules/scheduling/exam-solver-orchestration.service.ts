import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type {
  ExamSolverExam,
  ExamSolverInput,
  ExamSolverInvigilator,
  ExamSolverOutput,
  ExamSolverRoom,
  TriggerExamSolverDto,
} from '@school/shared';
import { CpSatSolveError, solveExamViaCpSat } from '@school/shared/scheduler';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { CurriculumMatrixService } from '../academics/curriculum-matrix.service';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface SolveResult {
  status: 'optimal' | 'feasible' | 'infeasible' | 'unknown';
  placed: number;
  total: number;
  slots_written: number;
  message?: string;
  solve_time_ms: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function timeToHhmm(d: Date): string {
  return d.toISOString().slice(11, 16);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ExamSolverOrchestrationService {
  private readonly logger = new Logger(ExamSolverOrchestrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly roomsReadFacade: RoomsReadFacade,
    private readonly curriculumMatrix: CurriculumMatrixService,
  ) {}

  // ─── Trigger a solve (synchronous — calls the CP-SAT sidecar) ─────────────

  async triggerSolve(
    tenantId: string,
    sessionId: string,
    dto: TriggerExamSolverDto,
  ): Promise<SolveResult> {
    const started = Date.now();

    const { session, config, subjectConfigs, pool, rooms, ygStudentCounts } =
      await this.loadSolveInputs(tenantId, sessionId);

    const exams = this.buildExams(subjectConfigs, ygStudentCounts);
    if (exams.length === 0) {
      throw new BadRequestException({
        error: {
          code: 'NO_EXAMS_TO_SCHEDULE',
          message: 'No examinable subjects with enrolled students found for this session',
        },
      });
    }

    const solverInput: ExamSolverInput = {
      session_id: sessionId,
      start_date: isoDate(session.start_date),
      end_date: isoDate(session.end_date),
      allowed_weekdays: config.allowed_weekdays,
      morning_window: {
        start: timeToHhmm(config.morning_start),
        end: timeToHhmm(config.morning_end),
      },
      afternoon_window: {
        start: timeToHhmm(config.afternoon_start),
        end: timeToHhmm(config.afternoon_end),
      },
      min_gap_minutes: config.min_gap_minutes_same_student,
      max_exams_per_day_per_yg: config.max_exams_per_day_per_yg,
      max_solver_duration_seconds: dto.max_solver_duration_seconds,
      exams,
      rooms: rooms.map<ExamSolverRoom>((r) => ({ room_id: r.id, capacity: r.capacity })),
      invigilators: pool.map<ExamSolverInvigilator>((p) => ({
        staff_profile_id: p.staff_profile_id,
      })),
    };

    const output = await this.callSidecar(solverInput, dto.max_solver_duration_seconds);

    const slotsWritten = await this.persistSolverOutput(tenantId, sessionId, exams, output);

    const elapsedMs = Date.now() - started;
    this.logger.log(
      `Exam solve for session ${sessionId}: placed ${output.slots.length}/${exams.length} in ${elapsedMs}ms (solver ${output.solve_time_ms}ms, status=${output.status})`,
    );

    return {
      status: output.status,
      placed: output.slots.length,
      total: exams.length,
      slots_written: slotsWritten,
      message:
        output.status === 'infeasible' || output.status === 'unknown'
          ? (output.message ??
            'Solver could not place every exam — widen the session or add resources')
          : undefined,
      solve_time_ms: output.solve_time_ms,
    };
  }

  // ─── Input assembly ────────────────────────────────────────────────────────

  private async loadSolveInputs(tenantId: string, sessionId: string) {
    const session = await this.prisma.examSession.findFirst({
      where: { id: sessionId, tenant_id: tenantId },
      select: { id: true, status: true, start_date: true, end_date: true },
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

    const config = await this.prisma.examSessionConfig.findFirst({
      where: { tenant_id: tenantId, exam_session_id: sessionId },
    });
    if (!config) {
      throw new BadRequestException({
        error: {
          code: 'SESSION_CONFIG_MISSING',
          message: 'Configure the session window before generating the schedule',
        },
      });
    }

    const subjectConfigs = await this.prisma.examSubjectConfig.findMany({
      where: { tenant_id: tenantId, exam_session_id: sessionId, is_examinable: true },
    });
    if (subjectConfigs.length === 0) {
      throw new BadRequestException({
        error: {
          code: 'NO_EXAMINABLE_SUBJECTS',
          message: 'Mark at least one subject as examinable before generating',
        },
      });
    }

    const pool = await this.prisma.examInvigilatorPool.findMany({
      where: { tenant_id: tenantId, exam_session_id: sessionId },
      select: { staff_profile_id: true },
    });
    if (pool.length === 0) {
      throw new BadRequestException({
        error: {
          code: 'INVIGILATOR_POOL_EMPTY',
          message: 'Add at least one invigilator to the pool before generating',
        },
      });
    }

    const roomBasics = await this.roomsReadFacade.findActiveRoomBasics(tenantId);
    const rooms = roomBasics
      .filter((r) => r.capacity !== null && r.capacity > 0)
      .map((r) => ({ id: r.id, capacity: r.capacity ?? 0 }));

    const ygStudentCounts = await this.computeYgSubjectStudentCounts(tenantId);

    return { session, config, subjectConfigs, pool, rooms, ygStudentCounts };
  }

  // ─── Build the solver-side exam list (handles 2-paper subjects) ───────────

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
    const exams: ExamSolverExam[] = [];
    for (const cfg of subjectConfigs) {
      const key = `${cfg.year_group_id}:${cfg.subject_id}`;
      const studentCount = ygStudentCounts.get(key) ?? 0;
      if (studentCount === 0) continue;

      const mode: 'in_person' | 'online' = cfg.mode === 'online' ? 'online' : 'in_person';

      exams.push({
        exam_subject_config_id: cfg.id,
        year_group_id: cfg.year_group_id,
        subject_id: cfg.subject_id,
        paper_number: 1,
        duration_minutes: cfg.paper_1_duration_mins,
        student_count: studentCount,
        invigilators_required: cfg.invigilators_required,
        mode,
      });

      if (cfg.paper_count === 2 && cfg.paper_2_duration_mins) {
        exams.push({
          exam_subject_config_id: cfg.id,
          year_group_id: cfg.year_group_id,
          subject_id: cfg.subject_id,
          paper_number: 2,
          duration_minutes: cfg.paper_2_duration_mins,
          student_count: studentCount,
          invigilators_required: cfg.invigilators_required,
          mode,
        });
      }
    }
    return exams;
  }

  // ─── Sidecar call ─────────────────────────────────────────────────────────

  private async callSidecar(
    input: ExamSolverInput,
    maxDurationSeconds: number,
  ): Promise<ExamSolverOutput> {
    const baseUrl = process.env.SOLVER_PY_URL ?? 'http://127.0.0.1:5557';
    // Give the sidecar an extra 60 s of breathing room on top of its own
    // wall-clock ceiling so AbortController doesn't trip during presolve.
    const floorMs = parseInt(process.env.CP_SAT_REQUEST_TIMEOUT_FLOOR_MS ?? '120000', 10);
    const timeoutMs = Math.max(floorMs, (maxDurationSeconds + 60) * 1000);

    try {
      return await solveExamViaCpSat(input, { baseUrl, timeoutMs });
    } catch (err) {
      if (err instanceof CpSatSolveError) {
        this.logger.error(
          `Exam solver sidecar error: ${err.code} (${err.status}) — ${err.message}`,
        );
        throw new BadRequestException({
          error: {
            code: err.code,
            message: err.message,
          },
        });
      }
      throw err;
    }
  }

  // ─── DB write (clear + insert fresh slots) ───────────────────────────────

  private async persistSolverOutput(
    tenantId: string,
    sessionId: string,
    exams: ExamSolverExam[],
    output: ExamSolverOutput,
  ): Promise<number> {
    const examByKey = new Map<string, ExamSolverExam>();
    for (const e of exams) {
      examByKey.set(`${e.exam_subject_config_id}:${e.paper_number}`, e);
    }

    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    let slotsWritten = 0;
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.examSlot.deleteMany({
        where: { tenant_id: tenantId, exam_session_id: sessionId },
      });

      for (const s of output.slots) {
        const key = `${s.exam_subject_config_id}:${s.paper_number}`;
        const exam = examByKey.get(key);
        if (!exam) continue;

        const slot = await db.examSlot.create({
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

        const slotRoomRecords: Array<{ room_id: string; slot_room_id: string }> = [];
        for (const r of s.room_assignments) {
          const roomRow = await db.examSlotRoom.create({
            data: {
              tenant_id: tenantId,
              exam_slot_id: slot.id,
              room_id: r.room_id,
              capacity: r.student_count_in_room,
            },
          });
          slotRoomRecords.push({ room_id: r.room_id, slot_room_id: roomRow.id });
        }

        for (let i = 0; i < s.invigilator_ids.length; i++) {
          const staffId = s.invigilator_ids[i];
          if (!staffId) continue;
          const assignedRoom =
            slotRoomRecords.length > 0 ? slotRoomRecords[i % slotRoomRecords.length] : undefined;
          await db.examInvigilation.create({
            data: {
              tenant_id: tenantId,
              exam_slot_id: slot.id,
              staff_profile_id: staffId,
              role: i === 0 ? 'lead' : 'assistant',
              exam_slot_room_id: assignedRoom?.slot_room_id ?? null,
            },
          });
        }
        slotsWritten++;
      }
    });

    return slotsWritten;
  }

  // ─── Compute (year_group, subject) student counts — curriculum-restricted ─

  private async computeYgSubjectStudentCounts(tenantId: string): Promise<Map<string, number>> {
    const pairs = await this.curriculumMatrix.findExamCurriculumPairs(tenantId);
    const ygSubject = new Map<string, number>();
    for (const p of pairs) {
      ygSubject.set(`${p.year_group_id}:${p.subject_id}`, p.student_count);
    }
    return ygSubject;
  }
}
