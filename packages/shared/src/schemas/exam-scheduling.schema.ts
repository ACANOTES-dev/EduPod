import { z } from 'zod';

// ─── Time helpers ────────────────────────────────────────────────────────────

const timeRegex = /^\d{2}:\d{2}$/;
const timeString = z.string().regex(timeRegex, 'Must be HH:mm');

// ─── ExamSessionConfig ───────────────────────────────────────────────────────

export const upsertExamSessionConfigSchema = z
  .object({
    allowed_weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    morning_start: timeString,
    morning_end: timeString,
    afternoon_start: timeString,
    afternoon_end: timeString,
    min_gap_minutes_same_student: z.number().int().min(0).max(480).default(0),
    max_exams_per_day_per_yg: z.number().int().min(1).max(10).default(2),
  })
  .refine((d) => d.morning_end > d.morning_start, {
    message: 'morning_end must be after morning_start',
    path: ['morning_end'],
  })
  .refine((d) => d.afternoon_end > d.afternoon_start, {
    message: 'afternoon_end must be after afternoon_start',
    path: ['afternoon_end'],
  })
  .refine((d) => d.afternoon_start >= d.morning_end, {
    message: 'afternoon_start must be at or after morning_end',
    path: ['afternoon_start'],
  });

export type UpsertExamSessionConfigDto = z.infer<typeof upsertExamSessionConfigSchema>;

// ─── ExamSubjectConfig ───────────────────────────────────────────────────────

export const upsertExamSubjectConfigSchema = z
  .object({
    year_group_id: z.string().uuid(),
    subject_id: z.string().uuid(),
    is_examinable: z.boolean().default(true),
    paper_count: z.number().int().min(1).max(2).default(1),
    paper_1_duration_mins: z.number().int().min(10).max(480).default(90),
    paper_2_duration_mins: z.number().int().min(10).max(480).nullable().optional(),
    mode: z.enum(['in_person', 'online']).default('in_person'),
    invigilators_required: z.number().int().min(0).max(50).default(2),
  })
  .refine((d) => d.paper_count !== 2 || (d.paper_2_duration_mins ?? 0) >= 10, {
    message: 'paper_2_duration_mins is required when paper_count = 2',
    path: ['paper_2_duration_mins'],
  });

export type UpsertExamSubjectConfigDto = z.infer<typeof upsertExamSubjectConfigSchema>;

export const bulkUpsertExamSubjectConfigsSchema = z.object({
  configs: z.array(upsertExamSubjectConfigSchema).min(1).max(500),
});

export type BulkUpsertExamSubjectConfigsDto = z.infer<typeof bulkUpsertExamSubjectConfigsSchema>;

// ─── InvigilatorPool ─────────────────────────────────────────────────────────

export const setInvigilatorPoolSchema = z.object({
  staff_profile_ids: z.array(z.string().uuid()).max(500),
});

export type SetInvigilatorPoolDto = z.infer<typeof setInvigilatorPoolSchema>;

// ─── Solver trigger ──────────────────────────────────────────────────────────

export const triggerExamSolverSchema = z.object({
  max_solver_duration_seconds: z.number().int().min(10).max(3600).default(120),
});

export type TriggerExamSolverDto = z.infer<typeof triggerExamSolverSchema>;

// ─── Publish ─────────────────────────────────────────────────────────────────

export const publishExamSessionSchema = z.object({
  confirm: z.literal(true),
});

export type PublishExamSessionDto = z.infer<typeof publishExamSessionSchema>;

// ─── Solver I/O contract (TS side) ───────────────────────────────────────────

export interface ExamSolverExam {
  exam_subject_config_id: string;
  year_group_id: string;
  subject_id: string;
  paper_number: 1 | 2;
  duration_minutes: number;
  student_count: number;
  invigilators_required: number;
  mode: 'in_person' | 'online';
}

export interface ExamSolverRoom {
  room_id: string;
  capacity: number;
}

export interface ExamSolverInvigilator {
  staff_profile_id: string;
}

export interface ExamSolverInput {
  session_id: string;
  start_date: string;
  end_date: string;
  allowed_weekdays: number[];
  morning_window: { start: string; end: string };
  afternoon_window: { start: string; end: string };
  min_gap_minutes: number;
  max_exams_per_day_per_yg: number;
  max_solver_duration_seconds: number;
  exams: ExamSolverExam[];
  rooms: ExamSolverRoom[];
  invigilators: ExamSolverInvigilator[];
}

export interface ExamSolverRoomAssignment {
  room_id: string;
  capacity: number;
  student_count_in_room: number;
}

export interface ExamSolverSlot {
  exam_subject_config_id: string;
  paper_number: 1 | 2;
  date: string;
  start_time: string;
  end_time: string;
  room_assignments: ExamSolverRoomAssignment[];
  invigilator_ids: string[];
}

export type ExamEarlyStopReason = 'stagnation' | 'gap' | 'cancelled' | 'not_triggered';

export interface ExamSolverOutput {
  status: 'optimal' | 'feasible' | 'infeasible' | 'unknown';
  slots: ExamSolverSlot[];
  solve_time_ms: number;
  message?: string;

  // Early-stop telemetry — all optional, defaulted on the sidecar side, so
  // older builds still deserialise cleanly.
  early_stop_triggered?: boolean;
  termination_reason?: ExamEarlyStopReason;
  improvements_found?: number;
  first_solution_wall_time_seconds?: number | null;
  final_objective_value?: number | null;
  time_saved_ms?: number;
}
