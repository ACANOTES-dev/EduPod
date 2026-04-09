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
  default_weight: z.number().positive().optional(),
  subject_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid().optional(),
});
export type CreateAssessmentCategoryDto = z.infer<typeof createAssessmentCategorySchema>;

export const updateAssessmentCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  default_weight: z.number().positive().optional(),
  subject_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid().optional(),
});
export type UpdateAssessmentCategoryDto = z.infer<typeof updateAssessmentCategorySchema>;

// ─── Config Approval ────────────────────────────────────────────────────

export const CONFIG_APPROVAL_STATUSES = [
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'archived',
] as const;
export type ConfigApprovalStatus = (typeof CONFIG_APPROVAL_STATUSES)[number];

export const reviewConfigSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    rejection_reason: z.string().min(1).max(1000).optional(),
  })
  .refine(
    (data) =>
      data.status !== 'rejected' || (data.rejection_reason && data.rejection_reason.length > 0),
    { message: 'rejection_reason is required when rejecting', path: ['rejection_reason'] },
  );
export type ReviewConfigDto = z.infer<typeof reviewConfigSchema>;

// ─── Unlock Request ─────────────────────────────────────────────────────

export const createUnlockRequestSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type CreateUnlockRequestDto = z.infer<typeof createUnlockRequestSchema>;

export const reviewUnlockRequestSchema = z
  .object({
    status: z.enum(['approved', 'rejected']),
    rejection_reason: z.string().min(1).max(1000).optional(),
  })
  .refine(
    (data) =>
      data.status !== 'rejected' || (data.rejection_reason && data.rejection_reason.length > 0),
    { message: 'rejection_reason is required when rejecting', path: ['rejection_reason'] },
  );
export type ReviewUnlockRequestDto = z.infer<typeof reviewUnlockRequestSchema>;

// ─── Teacher Grading Weights ────────────────────────────────────────────

export const createTeacherGradingWeightSchema = z.object({
  subject_id: z.string().uuid(),
  year_group_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
  category_weights: z
    .array(
      z.object({
        category_id: z.string().uuid(),
        weight: z.number().min(0).max(100),
      }),
    )
    .min(1),
});
export type CreateTeacherGradingWeightDto = z.infer<typeof createTeacherGradingWeightSchema>;

export const updateTeacherGradingWeightSchema = z.object({
  category_weights: z
    .array(
      z.object({
        category_id: z.string().uuid(),
        weight: z.number().min(0).max(100),
      }),
    )
    .min(1),
});
export type UpdateTeacherGradingWeightDto = z.infer<typeof updateTeacherGradingWeightSchema>;

// ─── Category Weight JSON ────────────────────────────────────────────────

export const categoryWeightJsonSchema = z.object({
  weights: z
    .array(
      z.object({
        category_id: z.string().uuid(),
        weight: z.number().positive(),
      }),
    )
    .min(1),
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
  status: z.enum([
    'draft',
    'open',
    'closed',
    'locked',
    'submitted_locked',
    'unlock_requested',
    'reopened',
    'final_locked',
  ]),
  cancellation_reason: z.string().min(1).optional(),
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
  subjects: z.array(
    z.object({
      subject_name: z.string(),
      subject_code: z.string().nullable(),
      computed_value: z.number(),
      display_value: z.string(),
      overridden_value: z.string().nullable(),
      assessments: z.array(
        z.object({
          title: z.string(),
          category: z.string(),
          max_score: z.number(),
          raw_score: z.number().nullable(),
          is_missing: z.boolean(),
        }),
      ),
    }),
  ),
  attendance_summary: z
    .object({
      total_days: z.number(),
      present_days: z.number(),
      absent_days: z.number(),
      late_days: z.number(),
    })
    .optional(),
  teacher_comment: z.string().nullable(),
  principal_comment: z.string().nullable(),
});

// ─── Year Group Grade Weights ───────────────────────────────────────────

export const upsertYearGroupGradeWeightSchema = z.object({
  year_group_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
  category_weights: z
    .array(
      z.object({
        category_id: z.string().uuid(),
        weight: z.number().min(0).max(100),
      }),
    )
    .min(1),
});
export type UpsertYearGroupGradeWeightDto = z.infer<typeof upsertYearGroupGradeWeightSchema>;

export const copyYearGroupGradeWeightsSchema = z.object({
  source_year_group_id: z.string().uuid(),
  target_year_group_id: z.string().uuid(),
});
export type CopyYearGroupGradeWeightsDto = z.infer<typeof copyYearGroupGradeWeightsSchema>;

// ─── Results Matrix ─────────────────────────────────────────────────────

export const saveResultsMatrixSchema = z.object({
  grades: z
    .array(
      z.object({
        student_id: z.string().uuid(),
        assessment_id: z.string().uuid(),
        raw_score: z.number().nullable(),
        is_missing: z.boolean(),
      }),
    )
    .min(1),
});
export type SaveResultsMatrixDto = z.infer<typeof saveResultsMatrixSchema>;

// ─── Import ──────────────────────────────────────────────────────────────

export const importProcessSchema = z.object({
  rows: z
    .array(
      z.object({
        student_id: z.string().uuid(),
        assessment_id: z.string().uuid(),
        score: z.number(),
      }),
    )
    .min(1),
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
  standards: z
    .array(
      z.object({
        code: z.string().min(1).max(50),
        description: z.string().min(1),
      }),
    )
    .min(1),
});
export type BulkImportStandardsDto = z.infer<typeof bulkImportStandardsSchema>;

// ─── Competency Scale Schemas ─────────────────────────────────────────────

export const createCompetencyScaleSchema = z.object({
  name: z.string().min(1).max(100),
  levels: z
    .array(
      z.object({
        label: z.string().min(1).max(100),
        threshold_min: z.number().min(0).max(100),
      }),
    )
    .min(1),
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
  levels: z
    .array(
      z.object({
        label: z.string().min(1).max(100),
        threshold_min: z.number().min(0).max(100),
      }),
    )
    .min(1)
    .optional(),
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

// ─── Report Card World-Class Enhancement Schemas ──────────────────────────

// Template Designer (R1 + R2)

export const templateSectionConfigSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.enum([
    'header',
    'student_info',
    'grades_table',
    'attendance_summary',
    'competency_summary',
    'conduct',
    'extracurriculars',
    'custom_text',
    'teacher_comment',
    'principal_comment',
    'threshold_remarks',
    'comparative_indicators',
    'qr_code',
    'signature_area',
  ]),
  order: z.number().int().nonnegative(),
  style_variant: z.string().min(1).max(50),
  enabled: z.boolean(),
  config: z.record(z.string(), z.unknown()),
});

export const createReportCardTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  locale: z.string().min(1).max(10),
  sections_json: z.array(templateSectionConfigSchema).min(1),
  branding_overrides_json: z.record(z.string(), z.unknown()).nullable().optional(),
  is_default: z.boolean().optional(),
});
export type CreateReportCardTemplateDto = z.infer<typeof createReportCardTemplateSchema>;

export const updateReportCardTemplateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  sections_json: z.array(templateSectionConfigSchema).min(1).optional(),
  branding_overrides_json: z.record(z.string(), z.unknown()).nullable().optional(),
  is_default: z.boolean().optional(),
});
export type UpdateReportCardTemplateDto = z.infer<typeof updateReportCardTemplateSchema>;

export const listReportCardTemplatesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  locale: z.string().min(1).max(10).optional(),
});

// Approval Workflow (R3)

export const approvalStepSchema = z.object({
  order: z.number().int().nonnegative(),
  role_key: z.string().min(1).max(50),
  label: z.string().min(1).max(100),
  required: z.boolean(),
});

export const createApprovalConfigSchema = z.object({
  name: z.string().min(1).max(100),
  steps_json: z.array(approvalStepSchema),
  is_active: z.boolean().optional(),
});
export type CreateApprovalConfigDto = z.infer<typeof createApprovalConfigSchema>;

export const updateApprovalConfigSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  steps_json: z.array(approvalStepSchema).optional(),
  is_active: z.boolean().optional(),
});
export type UpdateApprovalConfigDto = z.infer<typeof updateApprovalConfigSchema>;

export const rejectApprovalSchema = z.object({
  reason: z.string().min(1).max(1000),
});
export type RejectApprovalDto = z.infer<typeof rejectApprovalSchema>;

export const bulkApproveSchema = z.object({
  approval_ids: z.array(z.string().uuid()).min(1).max(100),
});
export type BulkApproveDto = z.infer<typeof bulkApproveSchema>;

export const getPendingApprovalsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  role_key: z.string().min(1).max(50),
});

// Bulk Operations (R4)

export const bulkGenerateSchema = z.object({
  class_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
});
export type BulkGenerateDto = z.infer<typeof bulkGenerateSchema>;

export const bulkPublishSchema = z.object({
  report_card_ids: z.array(z.string().uuid()).min(1).max(200),
});
export type BulkPublishDto = z.infer<typeof bulkPublishSchema>;

export const bulkDeliverSchema = z.object({
  report_card_ids: z.array(z.string().uuid()).min(1).max(200),
});
export type BulkDeliverDto = z.infer<typeof bulkDeliverSchema>;

// Delivery (R5)

// Batch PDF (R6)

export const batchPdfSchema = z.object({
  class_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
  template_id: z.string().uuid().nullable().optional(),
});
export type BatchPdfDto = z.infer<typeof batchPdfSchema>;

// Custom Fields (R8)

export const createCustomFieldDefSchema = z.object({
  name: z.string().min(1).max(100),
  label: z.string().min(1).max(200),
  label_ar: z.string().max(200).nullable().optional(),
  field_type: z.enum(['text', 'select', 'rating']),
  options_json: z.record(z.string(), z.unknown()).nullable().optional(),
  section_type: z.enum(['conduct', 'extracurricular', 'custom']),
  display_order: z.number().int().nonnegative().optional(),
});
export type CreateCustomFieldDefDto = z.infer<typeof createCustomFieldDefSchema>;

export const updateCustomFieldDefSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  label_ar: z.string().max(200).nullable().optional(),
  field_type: z.enum(['text', 'select', 'rating']).optional(),
  options_json: z.record(z.string(), z.unknown()).nullable().optional(),
  section_type: z.enum(['conduct', 'extracurricular', 'custom']).optional(),
  display_order: z.number().int().nonnegative().optional(),
});
export type UpdateCustomFieldDefDto = z.infer<typeof updateCustomFieldDefSchema>;

export const saveCustomFieldValuesSchema = z.object({
  values: z
    .array(
      z.object({
        field_def_id: z.string().uuid(),
        value: z.string().min(1),
      }),
    )
    .min(1),
});
export type SaveCustomFieldValuesDto = z.infer<typeof saveCustomFieldValuesSchema>;

// Grade Thresholds (R11)

export const thresholdEntrySchema = z.object({
  min_score: z.number().nonnegative().max(100),
  label: z.string().min(1).max(100),
  label_ar: z.string().min(1).max(100),
});

export const createGradeThresholdConfigSchema = z.object({
  name: z.string().min(1).max(100),
  thresholds_json: z.array(thresholdEntrySchema).min(1),
  is_default: z.boolean().optional(),
});
export type CreateGradeThresholdConfigDto = z.infer<typeof createGradeThresholdConfigSchema>;

export const updateGradeThresholdConfigSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  thresholds_json: z.array(thresholdEntrySchema).min(1).optional(),
  is_default: z.boolean().optional(),
});
export type UpdateGradeThresholdConfigDto = z.infer<typeof updateGradeThresholdConfigSchema>;

// Analytics (R10)

export const analyticsQuerySchema = z.object({
  academic_period_id: z.string().uuid().optional(),
});

// Acknowledgment (R13)

export const acknowledgeReportCardSchema = z.object({
  parent_id: z.string().uuid(),
});
export type AcknowledgeReportCardDto = z.infer<typeof acknowledgeReportCardSchema>;

// ─── Weight Configuration (cross-subject / cross-period) ──────────────────────

export const subjectWeightEntrySchema = z.object({
  subject_id: z.string().uuid(),
  weight: z.number().min(0).max(100),
});

export const upsertSubjectWeightsSchema = z.object({
  academic_year_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
  scope_type: z.enum(['year_group', 'class']),
  scope_id: z.string().uuid(),
  weights: z.array(subjectWeightEntrySchema).min(1),
});
export type UpsertSubjectWeightsDto = z.infer<typeof upsertSubjectWeightsSchema>;

export const periodWeightEntrySchema = z.object({
  academic_period_id: z.string().uuid(),
  weight: z.number().min(0).max(100),
});

export const upsertPeriodWeightsSchema = z.object({
  academic_year_id: z.string().uuid(),
  scope_type: z.enum(['year_group', 'class']),
  scope_id: z.string().uuid(),
  weights: z.array(periodWeightEntrySchema).min(1),
});
export type UpsertPeriodWeightsDto = z.infer<typeof upsertPeriodWeightsSchema>;

export const propagateWeightsSchema = z.object({
  academic_year_id: z.string().uuid(),
  academic_period_id: z.string().uuid().optional(),
  year_group_id: z.string().uuid(),
});
export type PropagateWeightsDto = z.infer<typeof propagateWeightsSchema>;

// ─── Cross-aggregation query schemas ────────────────────────────────────

export const crossSubjectGradesQuerySchema = z.object({
  class_id: z.string().uuid(),
  academic_period_id: z.string().uuid(),
});
export type CrossSubjectGradesQuery = z.infer<typeof crossSubjectGradesQuerySchema>;

export const crossPeriodGradesQuerySchema = z.object({
  class_id: z.string().uuid(),
  subject_id: z.string().uuid(),
  academic_year_id: z.string().uuid(),
});
export type CrossPeriodGradesQuery = z.infer<typeof crossPeriodGradesQuerySchema>;

export const yearOverviewGradesQuerySchema = z.object({
  class_id: z.string().uuid(),
  academic_year_id: z.string().uuid(),
});
export type YearOverviewGradesQuery = z.infer<typeof yearOverviewGradesQuerySchema>;
