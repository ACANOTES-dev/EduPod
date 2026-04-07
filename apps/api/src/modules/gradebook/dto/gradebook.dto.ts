import type { z } from 'zod';

import type {
  acknowledgeRiskAlertSchema,
  applyCurveSchema,
  bulkImportStandardsSchema,
  bulkUpsertGradesSchema,
  computeGpaSchema,
  computePeriodGradesSchema,
  copyYearGroupGradeWeightsSchema,
  createAiGradingInstructionSchema,
  createAssessmentCategorySchema,
  createAssessmentFromTemplateSchema,
  createAssessmentSchema,
  createAssessmentTemplateSchema,
  createCompetencyScaleSchema,
  createCurriculumStandardSchema,
  createGradingScaleSchema,
  createRubricTemplateSchema,
  createTeacherGradingWeightSchema,
  generateAiCommentsSchema,
  generateProgressReportsSchema,
  generateReportCardsSchema,
  importProcessSchema,
  mapAssessmentStandardsSchema,
  nlQuerySchema,
  overridePeriodGradeSchema,
  publishGradesSchema,
  resolveRiskAlertSchema,
  reviewAiGradingInstructionSchema,
  reviewConfigSchema,
  saveRubricGradesSchema,
  sendProgressReportSchema,
  setDefaultGradeSchema,
  transitionAssessmentStatusSchema,
  undoCurveSchema,
  updateAssessmentCategorySchema,
  updateAssessmentSchema,
  updateAssessmentTemplateSchema,
  updateCompetencyScaleSchema,
  updateGradingScaleSchema,
  updateProgressReportEntrySchema,
  updateReportCardSchema,
  updateRubricTemplateSchema,
  updateTeacherGradingWeightSchema,
  upsertGradeConfigSchema,
  upsertYearGroupGradeWeightSchema,
} from '@school/shared';

export type CreateGradingScaleDto = z.infer<typeof createGradingScaleSchema>;
export type UpdateGradingScaleDto = z.infer<typeof updateGradingScaleSchema>;
export type CreateAssessmentCategoryDto = z.infer<typeof createAssessmentCategorySchema>;
export type UpdateAssessmentCategoryDto = z.infer<typeof updateAssessmentCategorySchema>;
export type UpsertGradeConfigDto = z.infer<typeof upsertGradeConfigSchema>;
export type UpsertYearGroupGradeWeightDto = z.infer<typeof upsertYearGroupGradeWeightSchema>;
export type CopyYearGroupGradeWeightsDto = z.infer<typeof copyYearGroupGradeWeightsSchema>;
export type CreateAssessmentDto = z.infer<typeof createAssessmentSchema>;
export type UpdateAssessmentDto = z.infer<typeof updateAssessmentSchema>;
export type TransitionAssessmentStatusDto = z.infer<typeof transitionAssessmentStatusSchema>;
export type BulkUpsertGradesDto = z.infer<typeof bulkUpsertGradesSchema>;
export type ComputePeriodGradesDto = z.infer<typeof computePeriodGradesSchema>;
export type OverridePeriodGradeDto = z.infer<typeof overridePeriodGradeSchema>;
export type GenerateReportCardsDto = z.infer<typeof generateReportCardsSchema>;
export type UpdateReportCardDto = z.infer<typeof updateReportCardSchema>;
export type ImportProcessDto = z.infer<typeof importProcessSchema>;

// ─── C1: Rubric ───────────────────────────────────────────────────────────
export type CreateRubricTemplateDto = z.infer<typeof createRubricTemplateSchema>;
export type UpdateRubricTemplateDto = z.infer<typeof updateRubricTemplateSchema>;
export type SaveRubricGradesDto = z.infer<typeof saveRubricGradesSchema>;

// ─── C2: Standards ────────────────────────────────────────────────────────
export type CreateCurriculumStandardDto = z.infer<typeof createCurriculumStandardSchema>;
export type BulkImportStandardsDto = z.infer<typeof bulkImportStandardsSchema>;
export type MapAssessmentStandardsDto = z.infer<typeof mapAssessmentStandardsSchema>;
export type CreateCompetencyScaleDto = z.infer<typeof createCompetencyScaleSchema>;
export type UpdateCompetencyScaleDto = z.infer<typeof updateCompetencyScaleSchema>;

// ─── C3: GPA ──────────────────────────────────────────────────────────────
export type ComputeGpaDto = z.infer<typeof computeGpaSchema>;

// ─── C5: Grade Curve ─────────────────────────────────────────────────────
export type ApplyCurveDto = z.infer<typeof applyCurveSchema>;
export type UndoCurveDto = z.infer<typeof undoCurveSchema>;

// ─── C6: Assessment Templates ─────────────────────────────────────────────
export type CreateAssessmentTemplateDto = z.infer<typeof createAssessmentTemplateSchema>;
export type UpdateAssessmentTemplateDto = z.infer<typeof updateAssessmentTemplateSchema>;
export type CreateAssessmentFromTemplateDto = z.infer<typeof createAssessmentFromTemplateSchema>;

// ─── C7: Batch Default Grades ─────────────────────────────────────────────
export type SetDefaultGradeDto = z.infer<typeof setDefaultGradeSchema>;

// ─── B1: AI Comments ──────────────────────────────────────────────────────
export type GenerateAiCommentsDto = z.infer<typeof generateAiCommentsSchema>;

// ─── B2: AI Grading Instructions ─────────────────────────────────────────
export type CreateAiGradingInstructionDto = z.infer<typeof createAiGradingInstructionSchema>;
export type ReviewAiGradingInstructionDto = z.infer<typeof reviewAiGradingInstructionSchema>;

// ─── B3/B4: Risk Alerts ───────────────────────────────────────────────────
export type AcknowledgeRiskAlertDto = z.infer<typeof acknowledgeRiskAlertSchema>;
export type ResolveRiskAlertDto = z.infer<typeof resolveRiskAlertSchema>;

// ─── B5: Natural Language Query ───────────────────────────────────────────
export type NlQueryDto = z.infer<typeof nlQuerySchema>;

// ─── D1: Grade Publishing ─────────────────────────────────────────────────
export type PublishGradesDto = z.infer<typeof publishGradesSchema>;

// ─── Teacher-Centric Config ──────────────────────────────────────────────
export type ReviewConfigDto = z.infer<typeof reviewConfigSchema>;
export type CreateTeacherGradingWeightDto = z.infer<typeof createTeacherGradingWeightSchema>;
export type UpdateTeacherGradingWeightDto = z.infer<typeof updateTeacherGradingWeightSchema>;

// ─── D2: Progress Reports ─────────────────────────────────────────────────
export type GenerateProgressReportsDto = z.infer<typeof generateProgressReportsSchema>;
export type UpdateProgressReportEntryDto = z.infer<typeof updateProgressReportEntrySchema>;
export type SendProgressReportDto = z.infer<typeof sendProgressReportSchema>;
