import { z } from 'zod';

// ─── Grading Scale Config ────────────────────────────────────────────────

export const gradingScaleRangeSchema = z.object({
  min: z.number(),
  max: z.number(),
  label: z.string().min(1),
  gpa_value: z.number().optional(),
});

export const gradingScaleGradeSchema = z.object({
  label: z.string().min(1),
  numeric_value: z.number().optional(),
});

export const gradingScaleConfigSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('numeric'),
    ranges: z.array(gradingScaleRangeSchema).min(1),
    passing_threshold: z.number().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('letter'),
    grades: z.array(gradingScaleGradeSchema).min(1),
    passing_threshold: z.number().nonnegative().optional(),
  }),
  z.object({
    type: z.literal('custom'),
    grades: z.array(gradingScaleGradeSchema).min(1),
    passing_threshold: z.number().nonnegative().optional(),
  }),
]);

// ─── CRUD Schemas ────────────────────────────────────────────────────────

export const createGradingScaleSchema = z.object({
  name: z.string().min(1).max(100),
  config_json: gradingScaleConfigSchema,
});
export type CreateGradingScaleDto = z.infer<typeof createGradingScaleSchema>;

export const updateGradingScaleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config_json: gradingScaleConfigSchema.optional(),
});
export type UpdateGradingScaleDto = z.infer<typeof updateGradingScaleSchema>;

export const createAssessmentCategorySchema = z.object({
  name: z.string().min(1).max(100),
  default_weight: z.number().positive(),
});
export type CreateAssessmentCategoryDto = z.infer<typeof createAssessmentCategorySchema>;

export const updateAssessmentCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  default_weight: z.number().positive().optional(),
});
export type UpdateAssessmentCategoryDto = z.infer<typeof updateAssessmentCategorySchema>;

// ─── Category Weight JSON ────────────────────────────────────────────────

export const categoryWeightJsonSchema = z.object({
  weights: z.array(z.object({
    category_id: z.string().uuid(),
    weight: z.number().positive(),
  })).min(1),
});

export const upsertGradeConfigSchema = z.object({
  grading_scale_id: z.string().uuid(),
  category_weight_json: categoryWeightJsonSchema,
});
export type UpsertGradeConfigDto = z.infer<typeof upsertGradeConfigSchema>;

// ─── Assessments ─────────────────────────────────────────────────────────

export const createAssessmentSchema = z.object({
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
  category_id: z.string().uuid(),
  title: z.string().min(1).max(255),
  max_score: z.number().positive(),
  due_date: z.string().nullable().optional(),
  grading_deadline: z.string().nullable().optional(),
  counts_toward_report_card: z.boolean().optional().default(true),
});
export type CreateAssessmentDto = z.infer<typeof createAssessmentSchema>;

export const updateAssessmentSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  max_score: z.number().positive().optional(),
  due_date: z.string().nullable().optional(),
  grading_deadline: z.string().nullable().optional(),
  category_id: z.string().uuid().optional(),
  counts_toward_report_card: z.boolean().optional(),
  expected_updated_at: z.string().optional(),
});
export type UpdateAssessmentDto = z.infer<typeof updateAssessmentSchema>;

export const transitionAssessmentStatusSchema = z.object({
  status: z.enum(['draft', 'open', 'closed', 'locked']),
});
export type TransitionAssessmentStatusDto = z.infer<typeof transitionAssessmentStatusSchema>;

// ─── Grades ──────────────────────────────────────────────────────────────

export const gradeEntryItemSchema = z.object({
  student_id: z.string().uuid(),
  raw_score: z.number().nullable(),
  is_missing: z.boolean(),
  comment: z.string().nullable().optional(),
});

export const bulkUpsertGradesSchema = z.object({
  grades: z.array(gradeEntryItemSchema).min(1),
});
export type BulkUpsertGradesDto = z.infer<typeof bulkUpsertGradesSchema>;

// ─── Period Grades ───────────────────────────────────────────────────────

export const computePeriodGradesSchema = z.object({
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
});
export type ComputePeriodGradesDto = z.infer<typeof computePeriodGradesSchema>;

export const overridePeriodGradeSchema = z.object({
  overridden_value: z.string().min(1),
  override_reason: z.string().min(1),
});
export type OverridePeriodGradeDto = z.infer<typeof overridePeriodGradeSchema>;

// ─── Report Cards ────────────────────────────────────────────────────────

export const generateReportCardsSchema = z.object({
  student_ids: z.array(z.string().uuid()).min(1),
  academic_period_id: z.string().uuid(),
});
export type GenerateReportCardsDto = z.infer<typeof generateReportCardsSchema>;

export const generateBatchReportCardsSchema = z.object({
  class_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
  template_id: z.string().min(1).max(50).optional().default('classic'),
});
export type GenerateBatchReportCardsDto = z.infer<typeof generateBatchReportCardsSchema>;

export const reportCardOverviewQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  class_id: z.string().uuid().optional(),
  academic_period_id: z.string().uuid().optional(),
});

export const updateReportCardSchema = z.object({
  teacher_comment: z.string().nullable().optional(),
  principal_comment: z.string().nullable().optional(),
  template_locale: z.string().min(1).max(10).optional(),
  expected_updated_at: z.string().optional(),
});
export type UpdateReportCardDto = z.infer<typeof updateReportCardSchema>;

export const reportCardSnapshotSchema = z.object({
  student: z.object({
    full_name: z.string(),
    student_number: z.string().nullable(),
    year_group: z.string(),
    class_homeroom: z.string().nullable(),
  }),
  period: z.object({
    name: z.string(),
    academic_year: z.string(),
    start_date: z.string(),
    end_date: z.string(),
  }),
  subjects: z.array(z.object({
    subject_name: z.string(),
    subject_code: z.string().nullable(),
    computed_value: z.number(),
    display_value: z.string(),
    overridden_value: z.string().nullable(),
    assessments: z.array(z.object({
      title: z.string(),
      category: z.string(),
      max_score: z.number(),
      raw_score: z.number().nullable(),
      is_missing: z.boolean(),
    })),
  })),
  attendance_summary: z.object({
    total_days: z.number(),
    present_days: z.number(),
    absent_days: z.number(),
    late_days: z.number(),
  }).optional(),
  teacher_comment: z.string().nullable(),
  principal_comment: z.string().nullable(),
});

// ─── Year Group Grade Weights ───────────────────────────────────────────

export const upsertYearGroupGradeWeightSchema = z.object({
  year_group_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
  category_weights: z.array(z.object({
    category_id: z.string().uuid(),
    weight: z.number().min(0).max(100),
  })).min(1),
});
export type UpsertYearGroupGradeWeightDto = z.infer<typeof upsertYearGroupGradeWeightSchema>;

export const copyYearGroupGradeWeightsSchema = z.object({
  source_year_group_id: z.string().uuid(),
  target_year_group_id: z.string().uuid(),
});
export type CopyYearGroupGradeWeightsDto = z.infer<typeof copyYearGroupGradeWeightsSchema>;

// ─── Results Matrix ─────────────────────────────────────────────────────

export const saveResultsMatrixSchema = z.object({
  grades: z.array(z.object({
    student_id: z.string().uuid(),
    assessment_id: z.string().uuid(),
    raw_score: z.number().nullable(),
    is_missing: z.boolean(),
  })).min(1),
});
export type SaveResultsMatrixDto = z.infer<typeof saveResultsMatrixSchema>;

// ─── Import ──────────────────────────────────────────────────────────────

export const importProcessSchema = z.object({
  rows: z.array(z.object({
    student_id: z.string().uuid(),
    assessment_id: z.string().uuid(),
    score: z.number(),
  })).min(1),
});
export type ImportProcessDto = z.infer<typeof importProcessSchema>;
