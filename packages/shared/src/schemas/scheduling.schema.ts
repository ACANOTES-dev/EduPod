import { z } from 'zod';

// ─── Curriculum Requirements ────────────────────────────────────────────────

export const createCurriculumRequirementSchema = z
  .object({
    academic_year_id: z.string().uuid(),
    year_group_id: z.string().uuid(),
    subject_id: z.string().uuid(),
    min_periods_per_week: z.number().int().min(1).max(35),
    max_periods_per_day: z.number().int().min(1).max(10).default(1),
    preferred_periods_per_week: z.number().int().min(1).max(35).nullable().optional(),
    requires_double_period: z.boolean().default(false),
    double_period_count: z.number().int().min(1).max(10).nullable().optional(),
    period_duration: z.number().int().min(10).max(180).nullable().optional(),
  })
  .refine(
    (data) =>
      !data.preferred_periods_per_week ||
      data.preferred_periods_per_week >= data.min_periods_per_week,
    {
      message: 'preferred_periods_per_week must be >= min_periods_per_week',
      path: ['preferred_periods_per_week'],
    },
  )
  .refine(
    (data) =>
      !data.requires_double_period ||
      (data.double_period_count !== null &&
        data.double_period_count !== undefined &&
        data.double_period_count >= 1),
    {
      message: 'double_period_count is required when requires_double_period is true',
      path: ['double_period_count'],
    },
  );

export type CreateCurriculumRequirementDto = z.infer<typeof createCurriculumRequirementSchema>;

export const updateCurriculumRequirementSchema = z.object({
  min_periods_per_week: z.number().int().min(1).max(35).optional(),
  max_periods_per_day: z.number().int().min(1).max(10).optional(),
  preferred_periods_per_week: z.number().int().min(1).max(35).nullable().optional(),
  requires_double_period: z.boolean().optional(),
  double_period_count: z.number().int().min(1).max(10).nullable().optional(),
  period_duration: z.number().int().min(10).max(180).nullable().optional(),
});

export type UpdateCurriculumRequirementDto = z.infer<typeof updateCurriculumRequirementSchema>;

// ─── Teacher Competencies ───────────────────────────────────────────────────

/**
 * Pin/pool discriminator on teacher competencies.
 * - `class_id === null` / omitted → pool entry; solver picks the section.
 * - `class_id === <uuid>` → pin; solver must honour this class assignment.
 */
export const createTeacherCompetencySchema = z.object({
  academic_year_id: z.string().uuid(),
  staff_profile_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
  class_id: z.string().uuid().nullable().optional(),
});

export type CreateTeacherCompetencyDto = z.infer<typeof createTeacherCompetencySchema>;

/**
 * PATCH body for a teacher competency. The only mutable field is `class_id`:
 * - Set to a UUID → promote a pool entry to a pin on that class.
 * - Set to `null` → demote a pin to a pool entry.
 * - Omit → no change (endpoint behaves as a read).
 */
export const updateTeacherCompetencySchema = z.object({
  class_id: z.string().uuid().nullable().optional(),
});

export type UpdateTeacherCompetencyDto = z.infer<typeof updateTeacherCompetencySchema>;

export const bulkCreateTeacherCompetenciesSchema = z.object({
  academic_year_id: z.string().uuid(),
  staff_profile_id: z.string().uuid(),
  competencies: z
    .array(
      z.object({
        subject_id: z.string().uuid(),
        year_group_id: z.string().uuid(),
        class_id: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});

export type BulkCreateTeacherCompetenciesDto = z.infer<typeof bulkCreateTeacherCompetenciesSchema>;

export const copyCompetenciesToYearsSchema = z.object({
  academic_year_id: z.string().uuid(),
  source_year_group_id: z.string().uuid(),
  targets: z
    .array(
      z.object({
        year_group_id: z.string().uuid(),
        subject_ids: z.array(z.string().uuid()).min(1),
      }),
    )
    .min(1)
    .max(50),
});

export type CopyCompetenciesToYearsDto = z.infer<typeof copyCompetenciesToYearsSchema>;

/**
 * Optional filters for the list endpoint. `class_id` can be:
 * - a UUID (pins for that class only),
 * - the literal string `null` (pool entries only — URL-friendly form),
 * - omitted (all rows).
 */
export const listTeacherCompetenciesQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  staff_profile_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid().optional(),
  class_id: z.union([z.string().uuid(), z.literal('null')]).optional(),
});

export type ListTeacherCompetenciesQuery = z.infer<typeof listTeacherCompetenciesQuerySchema>;

// ─── Substitute Teacher Competencies ────────────────────────────────────────

/**
 * Parallel to teacher-competency schemas, but on the substitute table. Same
 * pin/pool semantics: `class_id === null` → pool (eligible to cover any section
 * in the year group); `class_id === <uuid>` → pin (preferred cover for that
 * section, ranks higher in suggestions).
 */
export const createSubstituteTeacherCompetencySchema = z.object({
  academic_year_id: z.string().uuid(),
  staff_profile_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
  class_id: z.string().uuid().nullable().optional(),
});

export type CreateSubstituteTeacherCompetencyDto = z.infer<
  typeof createSubstituteTeacherCompetencySchema
>;

export const updateSubstituteTeacherCompetencySchema = z.object({
  class_id: z.string().uuid().nullable().optional(),
});

export type UpdateSubstituteTeacherCompetencyDto = z.infer<
  typeof updateSubstituteTeacherCompetencySchema
>;

export const bulkCreateSubstituteTeacherCompetenciesSchema = z.object({
  academic_year_id: z.string().uuid(),
  staff_profile_id: z.string().uuid(),
  competencies: z
    .array(
      z.object({
        subject_id: z.string().uuid(),
        year_group_id: z.string().uuid(),
        class_id: z.string().uuid().nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});

export type BulkCreateSubstituteTeacherCompetenciesDto = z.infer<
  typeof bulkCreateSubstituteTeacherCompetenciesSchema
>;

export const copySubstituteCompetenciesToYearsSchema = z.object({
  academic_year_id: z.string().uuid(),
  source_year_group_id: z.string().uuid(),
  targets: z
    .array(
      z.object({
        year_group_id: z.string().uuid(),
        subject_ids: z.array(z.string().uuid()).min(1),
      }),
    )
    .min(1)
    .max(50),
});

export type CopySubstituteCompetenciesToYearsDto = z.infer<
  typeof copySubstituteCompetenciesToYearsSchema
>;

export const listSubstituteTeacherCompetenciesQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  staff_profile_id: z.string().uuid().optional(),
  subject_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid().optional(),
  class_id: z.union([z.string().uuid(), z.literal('null')]).optional(),
});

export type ListSubstituteTeacherCompetenciesQuery = z.infer<
  typeof listSubstituteTeacherCompetenciesQuerySchema
>;

/**
 * Query for the `/suggest` endpoint. Given a `(class_id, subject_id, date)`,
 * return ranked cover candidates using the pin-first, pool-fallback model
 * plus workload and availability signals.
 */
export const suggestSubstitutesQuerySchema = z.object({
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  date: z.string().date(),
});

export type SuggestSubstitutesQuery = z.infer<typeof suggestSubstitutesQuerySchema>;

// ─── Break Groups ───────────────────────────────────────────────────────────

export const createBreakGroupSchema = z.object({
  academic_year_id: z.string().uuid(),
  name: z.string().min(1).max(100),
  name_ar: z.string().max(100).nullable().optional(),
  location: z.string().max(100).nullable().optional(),
  required_supervisor_count: z.number().int().min(1).max(10).default(1),
  year_group_ids: z.array(z.string().uuid()).min(1),
});

export type CreateBreakGroupDto = z.infer<typeof createBreakGroupSchema>;

export const updateBreakGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  name_ar: z.string().max(100).nullable().optional(),
  location: z.string().max(100).nullable().optional(),
  required_supervisor_count: z.number().int().min(1).max(10).optional(),
  year_group_ids: z.array(z.string().uuid()).min(1).optional(),
});

export type UpdateBreakGroupDto = z.infer<typeof updateBreakGroupSchema>;

// ─── Room Closures ──────────────────────────────────────────────────────────

export const createRoomClosureSchema = z
  .object({
    room_id: z.string().uuid(),
    date_from: z.string().date(),
    date_to: z.string().date(),
    reason: z.string().min(1).max(255),
  })
  .refine((data) => data.date_to >= data.date_from, {
    message: 'date_to must be >= date_from',
    path: ['date_to'],
  });

export type CreateRoomClosureDto = z.infer<typeof createRoomClosureSchema>;

// ─── Teacher Scheduling Config ──────────────────────────────────────────────

export const upsertTeacherSchedulingConfigSchema = z.object({
  academic_year_id: z.string().uuid(),
  staff_profile_id: z.string().uuid(),
  max_periods_per_week: z.number().int().min(1).max(50).nullable().optional(),
  max_periods_per_day: z.number().int().min(1).max(15).nullable().optional(),
  max_supervision_duties_per_week: z.number().int().min(1).max(20).nullable().optional(),
});

export type UpsertTeacherSchedulingConfigDto = z.infer<typeof upsertTeacherSchedulingConfigSchema>;

// ─── Period Grid (Modified for year group scope) ────────────────────────────

export const createPeriodTemplateV2Schema = z
  .object({
    academic_year_id: z.string().uuid(),
    year_group_id: z.string().uuid(),
    weekday: z.number().int().min(0).max(6),
    period_name: z.string().min(1).max(50),
    period_name_ar: z.string().max(50).nullable().optional(),
    period_order: z.number().int().min(0).max(20),
    start_time: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm'),
    end_time: z.string().regex(/^\d{2}:\d{2}$/, 'Must be HH:mm'),
    schedule_period_type: z.enum([
      'teaching',
      'break_supervision',
      'assembly',
      'lunch_duty',
      'free',
    ]),
    supervision_mode: z
      .enum(['none', 'yard', 'classroom_previous', 'classroom_next'])
      .default('none'),
    break_group_id: z.string().uuid().nullable().optional(),
  })
  .refine((data) => data.end_time > data.start_time, {
    message: 'end_time must be after start_time',
    path: ['end_time'],
  })
  .refine((data) => data.supervision_mode !== 'yard' || data.break_group_id, {
    message: 'break_group_id is required for yard supervision mode',
    path: ['break_group_id'],
  });

export type CreatePeriodTemplateV2Dto = z.infer<typeof createPeriodTemplateV2Schema>;

// ─── Solver Execution ───────────────────────────────────────────────────────

// Stage 9.5.1 §D — budget ceiling raised from 600 s to 3600 s. The
// EarlyStopCallback (Stage 9.5.1 §A) halts CP-SAT when convergence
// is detected, so a higher ceiling no longer means longer wall time
// for easy cases — only that hard cases get the headroom they need.
// Default stays at 120 s; tenants raise via this knob or the
// per-tenant ``schedulingSettings.maxSolverDurationSeconds``.
export const triggerSolverRunSchema = z.object({
  academic_year_id: z.string().uuid(),
  solver_seed: z.number().int().nullable().optional(),
  max_solver_duration_seconds: z.number().int().min(10).max(3600).default(120),
});

export type TriggerSolverRunDto = z.infer<typeof triggerSolverRunSchema>;

// ─── Validation ─────────────────────────────────────────────────────────────

export const validateScheduleSchema = z.object({
  // No body needed — validates the current draft state of the run
});

// ─── Export ─────────────────────────────────────────────────────────────────

export const exportScheduleQuerySchema = z.object({
  academic_year_id: z.string().uuid(),
  format: z.enum(['pdf', 'csv']).default('pdf'),
  locale: z.enum(['en', 'ar']).default('en'),
});

export type ExportScheduleQuery = z.infer<typeof exportScheduleQuerySchema>;

// ─── Copy Template ──────────────────────────────────────────────────────────

export const copyTemplateSchema = z.object({
  source_academic_year_id: z.string().uuid(),
  target_academic_year_id: z.string().uuid(),
  copy_items: z
    .array(
      z.enum([
        'period_grid',
        'curriculum_requirements',
        'teacher_competencies',
        'break_groups',
        'teacher_scheduling_config',
      ]),
    )
    .min(1),
});

export type CopyTemplateDto = z.infer<typeof copyTemplateSchema>;
