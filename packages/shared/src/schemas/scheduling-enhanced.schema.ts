import { z } from 'zod';

// ─── Substitution ────────────────────────────────────────────────────────────

export const reportAbsenceSchema = z
  .object({
    staff_id: z.string().uuid(),
    date: z.string().date(),
    date_to: z.string().date().nullable().optional(),
    full_day: z.boolean().default(true),
    period_from: z.number().int().min(0).nullable().optional(),
    period_to: z.number().int().min(0).nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
  })
  .refine((d) => d.full_day || (d.period_from !== undefined && d.period_from !== null), {
    message: 'period_from is required when full_day is false',
    path: ['period_from'],
  })
  .refine((d) => !d.date_to || d.date_to >= d.date, {
    message: 'date_to must be on or after date',
    path: ['date_to'],
  });

export type ReportAbsenceDto = z.infer<typeof reportAbsenceSchema>;

// Teacher self-report: no staff_id (derived from auth context). Can optionally
// nominate a specific substitute to be offered first — if they decline, the
// absence escalates to admin rather than falling through to the auto-cascade.
export const selfReportAbsenceSchema = z
  .object({
    date: z.string().date(),
    date_to: z.string().date().nullable().optional(),
    full_day: z.boolean().default(true),
    period_from: z.number().int().min(0).nullable().optional(),
    period_to: z.number().int().min(0).nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
    nominated_substitute_staff_id: z.string().uuid().nullable().optional(),
  })
  .refine((d) => d.full_day || (d.period_from !== undefined && d.period_from !== null), {
    message: 'period_from is required when full_day is false',
    path: ['period_from'],
  })
  .refine((d) => !d.date_to || d.date_to >= d.date, {
    message: 'date_to must be on or after date',
    path: ['date_to'],
  });

export type SelfReportAbsenceDto = z.infer<typeof selfReportAbsenceSchema>;

export const cancelAbsenceSchema = z.object({
  cancellation_reason: z.string().max(500).nullable().optional(),
});

export type CancelAbsenceDto = z.infer<typeof cancelAbsenceSchema>;

export const assignSubstituteSchema = z.object({
  absence_id: z.string().uuid(),
  schedule_id: z.string().uuid(),
  substitute_staff_id: z.string().uuid(),
  notes: z.string().max(500).nullable().optional(),
});

export type AssignSubstituteDto = z.infer<typeof assignSubstituteSchema>;

export const absenceQuerySchema = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  staff_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type AbsenceQuery = z.infer<typeof absenceQuerySchema>;

export const substitutionRecordQuerySchema = z.object({
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
  staff_id: z.string().uuid().optional(),
  status: z.enum(['assigned', 'confirmed', 'declined', 'completed', 'revoked']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type SubstitutionRecordQuery = z.infer<typeof substitutionRecordQuerySchema>;

// ─── Cover Tracking ──────────────────────────────────────────────────────────

export const coverReportQuerySchema = z.object({
  date_from: z.string().date(),
  date_to: z.string().date(),
  department_id: z.string().uuid().optional(),
});

export type CoverReportQuery = z.infer<typeof coverReportQuerySchema>;

// ─── Schedule Swap ───────────────────────────────────────────────────────────

export const validateSwapSchema = z.object({
  schedule_id_a: z.string().uuid(),
  schedule_id_b: z.string().uuid(),
});

export type ValidateSwapDto = z.infer<typeof validateSwapSchema>;

export const executeSwapSchema = z.object({
  schedule_id_a: z.string().uuid(),
  schedule_id_b: z.string().uuid(),
});

export type ExecuteSwapDto = z.infer<typeof executeSwapSchema>;

export const emergencyChangeSchema = z.object({
  schedule_id: z.string().uuid(),
  new_room_id: z.string().uuid().nullable().optional(),
  new_teacher_staff_id: z.string().uuid().nullable().optional(),
  cancel_period: z.boolean().optional(),
  reason: z.string().min(1).max(500),
});

export type EmergencyChangeDto = z.infer<typeof emergencyChangeSchema>;

// ─── Personal Timetable ──────────────────────────────────────────────────────

export const timetableQuerySchema = z.object({
  week_date: z.string().date().optional(),
  rotation_week: z.coerce.number().int().min(0).optional(),
});

export type TimetableQuery = z.infer<typeof timetableQuerySchema>;

export const createSubscriptionTokenSchema = z.object({
  entity_type: z.enum(['teacher', 'class']),
  entity_id: z.string().uuid(),
});

export type CreateSubscriptionTokenDto = z.infer<typeof createSubscriptionTokenSchema>;

// ─── Rotation Config ─────────────────────────────────────────────────────────

export const upsertRotationConfigSchema = z
  .object({
    academic_year_id: z.string().uuid(),
    cycle_length: z.number().int().min(1).max(8),
    week_labels: z.array(z.string().min(1).max(20)).min(1).max(8),
    effective_start_date: z.string().date(),
  })
  .refine((d) => d.week_labels.length === d.cycle_length, {
    message: 'week_labels length must equal cycle_length',
    path: ['week_labels'],
  });

export type UpsertRotationConfigDto = z.infer<typeof upsertRotationConfigSchema>;

// ─── Exam Scheduling ─────────────────────────────────────────────────────────

export const createExamSessionSchema = z
  .object({
    academic_period_id: z.string().uuid(),
    name: z.string().min(1).max(255),
    start_date: z.string().date(),
    end_date: z.string().date(),
  })
  .refine((d) => d.end_date >= d.start_date, {
    message: 'end_date must be >= start_date',
    path: ['end_date'],
  });

export type CreateExamSessionDto = z.infer<typeof createExamSessionSchema>;

export const updateExamSessionSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  start_date: z.string().date().optional(),
  end_date: z.string().date().optional(),
});

export type UpdateExamSessionDto = z.infer<typeof updateExamSessionSchema>;

export const addExamSlotSchema = z
  .object({
    subject_id: z.string().uuid(),
    year_group_id: z.string().uuid(),
    date: z.string().date(),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm'),
    end_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/, 'Must be HH:mm')
      .optional(),
    room_id: z.string().uuid().nullable().optional(),
    duration_minutes: z.number().int().min(15).max(480),
    student_count: z.number().int().min(1),
  })
  .refine((d) => !d.end_time || d.end_time > d.start_time, {
    message: 'end_time must be after start_time',
    path: ['end_time'],
  });

export type AddExamSlotDto = z.infer<typeof addExamSlotSchema>;

export const examSessionQuerySchema = z.object({
  academic_period_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ExamSessionQuery = z.infer<typeof examSessionQuerySchema>;

// ─── Scenario Planner ────────────────────────────────────────────────────────

export const createScenarioSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).nullable().optional(),
  academic_year_id: z.string().uuid(),
  base_run_id: z.string().uuid().nullable().optional(),
  adjustments: z.record(z.unknown()),
});

export type CreateScenarioDto = z.infer<typeof createScenarioSchema>;

export const updateScenarioSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).nullable().optional(),
  adjustments: z.record(z.unknown()).optional(),
});

export type UpdateScenarioDto = z.infer<typeof updateScenarioSchema>;

export const compareScenarioSchema = z.object({
  scenario_ids: z.array(z.string().uuid()).min(2).max(5),
});

export type CompareScenarioDto = z.infer<typeof compareScenarioSchema>;

export const scenarioQuerySchema = z.object({
  academic_year_id: z.string().uuid().optional(),
  status: z.enum(['draft', 'solved', 'approved', 'rejected']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ScenarioQuery = z.infer<typeof scenarioQuerySchema>;

// ─── Analytics ───────────────────────────────────────────────────────────────

export const schedulingAnalyticsQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  period_id: z.string().uuid().optional(),
});

export type AnalyticsQuery = z.infer<typeof schedulingAnalyticsQuerySchema>;

export const schedulingHistoricalComparisonQuerySchema = z.object({
  year_id_a: z.string().uuid(),
  year_id_b: z.string().uuid(),
});

export type HistoricalComparisonQuery = z.infer<typeof schedulingHistoricalComparisonQuerySchema>;
