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
  gpa_value: z.number().optional(),
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

// ─── Rubric Schemas ───────────────────────────────────────────────────────

export const rubricLevelSchema = z.object({
  label: z.string().min(1).max(100),
  points: z.number().nonnegative(),
  description: z.string().min(1),
});

export const rubricCriterionSchema = z.object({
  id: z.string().min(1).max(50),
  name: z.string().min(1).max(255),
  max_points: z.number().positive(),
  levels: z.array(rubricLevelSchema).min(1),
});

export const createRubricTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  subject_id: z.string().uuid().nullable().optional(),
  criteria: z.array(rubricCriterionSchema).min(1),
});
export type CreateRubricTemplateDto = z.infer<typeof createRubricTemplateSchema>;

export const updateRubricTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject_id: z.string().uuid().nullable().optional(),
  criteria: z.array(rubricCriterionSchema).min(1).optional(),
});
export type UpdateRubricTemplateDto = z.infer<typeof updateRubricTemplateSchema>;

// ─── Standards Schemas ────────────────────────────────────────────────────

export const createCurriculumStandardSchema = z.object({
  subject_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
  code: z.string().min(1).max(50),
  description: z.string().min(1),
});
export type CreateCurriculumStandardDto = z.infer<typeof createCurriculumStandardSchema>;

export const bulkImportStandardsSchema = z.object({
  subject_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
  standards: z.array(z.object({
    code: z.string().min(1).max(50),
    description: z.string().min(1),
  })).min(1),
});
export type BulkImportStandardsDto = z.infer<typeof bulkImportStandardsSchema>;

// ─── Competency Scale Schemas ─────────────────────────────────────────────

export const createCompetencyScaleSchema = z.object({
  name: z.string().min(1).max(100),
  levels: z.array(z.object({
    label: z.string().min(1).max(100),
    threshold_min: z.number().min(0).max(100),
  })).min(1),
});
export type CreateCompetencyScaleDto = z.infer<typeof createCompetencyScaleSchema>;

// ─── Assessment Template Schemas ──────────────────────────────────────────

export const createAssessmentTemplateSchema = z.object({
  name: z.string().min(1).max(255),
  subject_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid(),
  max_score: z.number().positive(),
  rubric_template_id: z.string().uuid().nullable().optional(),
  standard_ids: z.array(z.string().uuid()).nullable().optional(),
  counts_toward_report_card: z.boolean().optional().default(true),
});
export type CreateAssessmentTemplateDto = z.infer<typeof createAssessmentTemplateSchema>;

// ─── Grade Curve Schemas ──────────────────────────────────────────────────

export const applyCurveSchema = z.object({
  method: z.enum(['linear_shift', 'linear_scale', 'sqrt', 'bell', 'custom']),
  params: z.record(z.string(), z.unknown()).optional(),
});
export type ApplyCurveDto = z.infer<typeof applyCurveSchema>;

// ─── Batch Default Grade Schema ───────────────────────────────────────────

export const setDefaultGradeSchema = z.object({
  assessment_id: z.string().uuid(),
  default_score: z.number().nonnegative(),
});
export type SetDefaultGradeDto = z.infer<typeof setDefaultGradeSchema>;

// ─── AI Grading Instruction Schemas ──────────────────────────────────────

export const createAiGradingInstructionSchema = z.object({
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  instruction_text: z.string().min(1),
});
export type CreateAiGradingInstructionDto = z.infer<typeof createAiGradingInstructionSchema>;

export const reviewAiGradingInstructionSchema = z.object({
  status: z.enum(['active', 'rejected']),
  rejection_reason: z.string().min(1).optional(),
});
export type ReviewAiGradingInstructionDto = z.infer<typeof reviewAiGradingInstructionSchema>;

// ─── Risk Alert Schemas ───────────────────────────────────────────────────

export const acknowledgeRiskAlertSchema = z.object({
  note: z.string().optional(),
});
export type AcknowledgeRiskAlertDto = z.infer<typeof acknowledgeRiskAlertSchema>;

export const resolveRiskAlertSchema = z.object({
  resolution_note: z.string().min(1),
});
export type ResolveRiskAlertDto = z.infer<typeof resolveRiskAlertSchema>;

// ─── Progress Report Schemas ──────────────────────────────────────────────

export const generateProgressReportsSchema = z.object({
  class_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
});
export type GenerateProgressReportsDto = z.infer<typeof generateProgressReportsSchema>;

export const updateProgressReportEntrySchema = z.object({
  teacher_note: z.string().nullable().optional(),
});
export type UpdateProgressReportEntryDto = z.infer<typeof updateProgressReportEntrySchema>;

export const sendProgressReportSchema = z.object({
  progress_report_id: z.string().uuid(),
});
export type SendProgressReportDto = z.infer<typeof sendProgressReportSchema>;

// ─── Grade Publishing Schemas ─────────────────────────────────────────────

export const publishGradesSchema = z.object({
  assessment_ids: z.array(z.string().uuid()).min(1),
});
export type PublishGradesDto = z.infer<typeof publishGradesSchema>;

// ─── Natural Language Query Schema ───────────────────────────────────────

export const nlQuerySchema = z.object({
  question: z.string().min(1).max(1000),
});
export type NlQueryDto = z.infer<typeof nlQuerySchema>;

// ─── AI Comment Generation Schema ────────────────────────────────────────

export const generateAiCommentsSchema = z.object({
  report_card_ids: z.array(z.string().uuid()).min(1),
});
export type GenerateAiCommentsDto = z.infer<typeof generateAiCommentsSchema>;

// ─── Additional C1–C7 Schemas ─────────────────────────────────────────────

export const listRubricTemplatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  subject_id: z.string().uuid().optional(),
});

export const rubricGradeItemSchema = z.object({
  criterion_id: z.string().min(1).max(50),
  level_index: z.number().int().nonnegative(),
  points_awarded: z.number().nonnegative(),
});

export const saveRubricGradesSchema = z.object({
  rubric_template_id: z.string().uuid(),
  criteria_scores: z.array(rubricGradeItemSchema).min(1),
});
export type SaveRubricGradesDto = z.infer<typeof saveRubricGradesSchema>;

export const listStandardsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  subject_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid().optional(),
});

export const mapAssessmentStandardsSchema = z.object({
  standard_ids: z.array(z.string().uuid()),
});
export type MapAssessmentStandardsDto = z.infer<typeof mapAssessmentStandardsSchema>;

export const updateCompetencyScaleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  levels: z.array(z.object({
    label: z.string().min(1).max(100),
    threshold_min: z.number().min(0).max(100),
  })).min(1).optional(),
});
export type UpdateCompetencyScaleDto = z.infer<typeof updateCompetencyScaleSchema>;

export const computeGpaSchema = z.object({
  student_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
});
export type ComputeGpaDto = z.infer<typeof computeGpaSchema>;

export const undoCurveSchema = z.object({
  audit_id: z.string().uuid(),
});
export type UndoCurveDto = z.infer<typeof undoCurveSchema>;

export const updateAssessmentTemplateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  subject_id: z.string().uuid().nullable().optional(),
  category_id: z.string().uuid().optional(),
  max_score: z.number().positive().optional(),
  rubric_template_id: z.string().uuid().nullable().optional(),
  standard_ids: z.array(z.string().uuid()).nullable().optional(),
  counts_toward_report_card: z.boolean().optional(),
});
export type UpdateAssessmentTemplateDto = z.infer<typeof updateAssessmentTemplateSchema>;

export const createAssessmentFromTemplateSchema = z.object({
  class_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
  title: z.string().min(1).max(255).optional(),
  due_date: z.string().nullable().optional(),
  grading_deadline: z.string().nullable().optional(),
});
export type CreateAssessmentFromTemplateDto = z.infer<typeof createAssessmentFromTemplateSchema>;

export const listAssessmentTemplatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  subject_id: z.string().uuid().optional(),
});
