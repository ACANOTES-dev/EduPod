import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import type { ExamSolverExam, TriggerExamSolverDto } from '@school/shared';

import { createRlsClient } from '../../common/middleware/rls.middleware';
import { ClassesReadFacade } from '../classes/classes-read.facade';
import { PrismaService } from '../prisma/prisma.service';
import { RoomsReadFacade } from '../rooms/rooms-read.facade';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PlacedExam {
  exam_subject_config_id: string;
  paper_number: 1 | 2;
  year_group_id: string;
  subject_id: string;
  date: Date;
  start_time: string;
  end_time: string;
  duration_minutes: number;
  student_count: number;
  mode: 'in_person' | 'online';
  room_assignments: Array<{ room_id: string; capacity: number; student_count_in_room: number }>;
  invigilator_ids: string[];
}

export interface SolveResult {
  status: 'optimal' | 'feasible' | 'infeasible';
  placed: number;
  total: number;
  slots_written: number;
  message?: string;
  solve_time_ms: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map((n) => parseInt(n, 10));
  const total = (h ?? 0) * 60 + (m ?? 0) + minutes;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function timeToHhmm(d: Date): string {
  return d.toISOString().slice(11, 16);
}

function diffMinutes(a: string, b: string): number {
  const [ah, am] = a.split(':').map((n) => parseInt(n, 10));
  const [bh, bm] = b.split(':').map((n) => parseInt(n, 10));
  return Math.abs((ah ?? 0) * 60 + (am ?? 0) - ((bh ?? 0) * 60 + (bm ?? 0)));
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function eachAllowedDate(start: Date, end: Date, weekdays: number[]): Date[] {
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    if (weekdays.includes(cur.getUTCDay())) {
      days.push(new Date(cur));
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return days;
}

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class ExamSolverOrchestrationService {
  private readonly logger = new Logger(ExamSolverOrchestrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly roomsReadFacade: RoomsReadFacade,
    private readonly classesReadFacade: ClassesReadFacade,
  ) {}

  // ─── Trigger a solve (synchronous for MVP) ────────────────────────────────

  async triggerSolve(
    tenantId: string,
    sessionId: string,
    _dto: TriggerExamSolverDto,
  ): Promise<SolveResult> {
    const start = Date.now();
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

    const rooms = await this.roomsReadFacade.findActiveRoomBasics(tenantId);
    const inPersonRooms = rooms
      .filter((r) => r.capacity !== null && r.capacity > 0)
      .map((r) => ({ id: r.id, capacity: r.capacity ?? 0 }));

    const ygStudentCounts = await this.computeYgSubjectStudentCounts(tenantId);

    // Expand configs into exams (handle 2-paper subjects)
    const exams: ExamSolverExam[] = [];
    for (const cfg of subjectConfigs) {
      const key = `${cfg.year_group_id}:${cfg.subject_id}`;
      const studentCount = ygStudentCounts.get(key) ?? 0;
      if (studentCount === 0) continue;

      exams.push({
        exam_subject_config_id: cfg.id,
        year_group_id: cfg.year_group_id,
        subject_id: cfg.subject_id,
        paper_number: 1,
        duration_minutes: cfg.paper_1_duration_mins,
        student_count: studentCount,
        invigilators_required: cfg.invigilators_required,
        mode: (cfg.mode === 'online' ? 'online' : 'in_person') as 'in_person' | 'online',
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
          mode: (cfg.mode === 'online' ? 'online' : 'in_person') as 'in_person' | 'online',
        });
      }
    }

    // Greedy placement: biggest cohorts first, then by duration desc
    exams.sort((a, b) => {
      if (b.student_count !== a.student_count) return b.student_count - a.student_count;
      return b.duration_minutes - a.duration_minutes;
    });

    const allowedDates = eachAllowedDate(
      session.start_date,
      session.end_date,
      config.allowed_weekdays,
    );
    if (allowedDates.length === 0) {
      throw new BadRequestException({
        error: {
          code: 'NO_ALLOWED_DATES',
          message: 'Session window has no allowed weekdays',
        },
      });
    }

    const morningStart = timeToHhmm(config.morning_start);
    const morningEnd = timeToHhmm(config.morning_end);
    const afternoonStart = timeToHhmm(config.afternoon_start);
    const afternoonEnd = timeToHhmm(config.afternoon_end);

    // Solver state trackers
    const ygDaySlotCount = new Map<string, number>(); // `${yg}:${dateKey}` -> exam count
    const ygDayTimes = new Map<string, Array<{ start: string; end: string }>>(); // for min-gap
    const roomSlotBusy = new Map<string, Set<string>>(); // `${roomId}:${dateKey}:${slot}` -> used
    const invigilatorBusy = new Map<string, Set<string>>(); // `${staffId}:${dateKey}:${slot}` -> used
    const invigilatorCount = new Map<string, number>(); // fairness
    const paperDates = new Map<string, string>(); // `${cfgId}:paperNum` -> date to enforce paper-1 vs paper-2 different days

    const placed: PlacedExam[] = [];
    const unplaced: string[] = [];

    for (const exam of exams) {
      let placedExam: PlacedExam | null = null;

      outer: for (const date of allowedDates) {
        const dk = dateKey(date);

        const existingPaperDate = paperDates.get(`${exam.exam_subject_config_id}:1`);
        if (exam.paper_number === 2 && existingPaperDate === dk) continue;

        const ygKey = `${exam.year_group_id}:${dk}`;
        const ygCount = ygDaySlotCount.get(ygKey) ?? 0;
        if (ygCount >= config.max_exams_per_day_per_yg) continue;

        for (const slotName of ['morning', 'afternoon'] as const) {
          const slotStart = slotName === 'morning' ? morningStart : afternoonStart;
          const slotEnd = slotName === 'morning' ? morningEnd : afternoonEnd;
          const examEnd = addMinutes(slotStart, exam.duration_minutes);
          if (examEnd > slotEnd) continue;

          const ygTimes = ygDayTimes.get(ygKey) ?? [];
          let clash = false;
          for (const t of ygTimes) {
            // Same-slot clash (different exams for same year group on same day, same slot)
            if (t.start === slotStart) {
              clash = true;
              break;
            }
            // Min-gap check across morning<->afternoon same day
            const earlier = t.start < slotStart ? t : { start: slotStart, end: examEnd };
            const later = t.start < slotStart ? { start: slotStart, end: examEnd } : t;
            if (diffMinutes(earlier.end, later.start) < config.min_gap_minutes_same_student) {
              clash = true;
              break;
            }
          }
          if (clash) continue;

          // Try to assign rooms (in-person only)
          const roomAssignments: PlacedExam['room_assignments'] = [];
          if (exam.mode === 'in_person') {
            const sortedRooms = [...inPersonRooms]
              .filter((r) => {
                const key = `${r.id}:${dk}:${slotName}`;
                return !roomSlotBusy.get(key)?.size;
              })
              .sort((a, b) => b.capacity - a.capacity); // biggest first

            let remaining = exam.student_count;
            for (const r of sortedRooms) {
              if (remaining <= 0) break;
              const take = Math.min(r.capacity, remaining);
              roomAssignments.push({
                room_id: r.id,
                capacity: r.capacity,
                student_count_in_room: take,
              });
              remaining -= take;
            }
            if (remaining > 0) continue; // not enough room capacity
          }

          // Pick invigilators (fairness-sorted, available in this slot)
          const available = pool
            .map((p) => p.staff_profile_id)
            .filter((sid) => !invigilatorBusy.get(`${sid}:${dk}:${slotName}`)?.size)
            .sort((a, b) => (invigilatorCount.get(a) ?? 0) - (invigilatorCount.get(b) ?? 0));

          if (available.length < exam.invigilators_required) continue;
          const chosen = available.slice(0, exam.invigilators_required);

          // Commit tentatively
          placedExam = {
            exam_subject_config_id: exam.exam_subject_config_id,
            paper_number: exam.paper_number,
            year_group_id: exam.year_group_id,
            subject_id: exam.subject_id,
            date,
            start_time: slotStart,
            end_time: examEnd,
            duration_minutes: exam.duration_minutes,
            student_count: exam.student_count,
            mode: exam.mode,
            room_assignments: roomAssignments,
            invigilator_ids: chosen,
          };

          ygDaySlotCount.set(ygKey, ygCount + 1);
          ygDayTimes.set(ygKey, [...ygTimes, { start: slotStart, end: examEnd }]);
          for (const r of roomAssignments) {
            const key = `${r.room_id}:${dk}:${slotName}`;
            const set = roomSlotBusy.get(key) ?? new Set<string>();
            set.add(exam.exam_subject_config_id);
            roomSlotBusy.set(key, set);
          }
          for (const sid of chosen) {
            const key = `${sid}:${dk}:${slotName}`;
            const set = invigilatorBusy.get(key) ?? new Set<string>();
            set.add(exam.exam_subject_config_id);
            invigilatorBusy.set(key, set);
            invigilatorCount.set(sid, (invigilatorCount.get(sid) ?? 0) + 1);
          }
          paperDates.set(`${exam.exam_subject_config_id}:${exam.paper_number}`, dk);

          break outer;
        }
      }

      if (placedExam) {
        placed.push(placedExam);
      } else {
        unplaced.push(`${exam.exam_subject_config_id}:${exam.paper_number}`);
      }
    }

    // Persist: clear existing slots, write new ones
    const prismaWithRls = createRlsClient(this.prisma, { tenant_id: tenantId });

    let slotsWritten = 0;
    await prismaWithRls.$transaction(async (tx) => {
      const db = tx as unknown as PrismaService;
      await db.examSlot.deleteMany({
        where: { tenant_id: tenantId, exam_session_id: sessionId },
      });

      for (const p of placed) {
        const slot = await db.examSlot.create({
          data: {
            tenant_id: tenantId,
            exam_session_id: sessionId,
            subject_id: p.subject_id,
            year_group_id: p.year_group_id,
            date: p.date,
            start_time: new Date(`1970-01-01T${p.start_time}:00.000Z`),
            end_time: new Date(`1970-01-01T${p.end_time}:00.000Z`),
            duration_minutes: p.duration_minutes,
            student_count: p.student_count,
            paper_number: p.paper_number,
            exam_subject_config_id: p.exam_subject_config_id,
            room_id: p.room_assignments[0]?.room_id ?? null,
          },
        });

        const slotRoomRecords: Array<{ room_id: string; slot_room_id: string }> = [];
        for (const r of p.room_assignments) {
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

        for (let i = 0; i < p.invigilator_ids.length; i++) {
          const staffId = p.invigilator_ids[i];
          if (!staffId) continue;
          const assignedRoom = slotRoomRecords[i % Math.max(1, slotRoomRecords.length)];
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

    const solveMs = Date.now() - start;
    const status: SolveResult['status'] =
      unplaced.length === 0 ? 'optimal' : placed.length > 0 ? 'feasible' : 'infeasible';

    this.logger.log(
      `Exam solve for session ${sessionId}: placed ${placed.length}/${exams.length} in ${solveMs}ms`,
    );

    return {
      status,
      placed: placed.length,
      total: exams.length,
      slots_written: slotsWritten,
      message:
        unplaced.length > 0
          ? `${unplaced.length} exam(s) could not be placed — try widening the session window or adding more rooms/invigilators`
          : undefined,
      solve_time_ms: solveMs,
    };
  }

  // ─── Compute (year_group, subject) student counts ──────────────────────────

  private async computeYgSubjectStudentCounts(tenantId: string): Promise<Map<string, number>> {
    const classes = await this.classesReadFacade.findActiveClassesForExamPlanning(tenantId);
    const ygSubject = new Map<string, number>();
    for (const c of classes) {
      const key = `${c.year_group_id}:${c.subject_id}`;
      ygSubject.set(key, (ygSubject.get(key) ?? 0) + c.enrolment_count);
    }
    return ygSubject;
  }
}
