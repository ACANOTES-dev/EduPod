import type { z } from 'zod';
import type {
  createGradingScaleSchema,
  updateGradingScaleSchema,
  createAssessmentCategorySchema,
  updateAssessmentCategorySchema,
  upsertGradeConfigSchema,
  createAssessmentSchema,
  updateAssessmentSchema,
  transitionAssessmentStatusSchema,
  bulkUpsertGradesSchema,
  computePeriodGradesSchema,
  overridePeriodGradeSchema,
  generateReportCardsSchema,
  updateReportCardSchema,
  importProcessSchema,
} from '@school/shared';

export type CreateGradingScaleDto = z.infer<typeof createGradingScaleSchema>;
export type UpdateGradingScaleDto = z.infer<typeof updateGradingScaleSchema>;
export type CreateAssessmentCategoryDto = z.infer<typeof createAssessmentCategorySchema>;
export type UpdateAssessmentCategoryDto = z.infer<typeof updateAssessmentCategorySchema>;
export type UpsertGradeConfigDto = z.infer<typeof upsertGradeConfigSchema>;
export type CreateAssessmentDto = z.infer<typeof createAssessmentSchema>;
export type UpdateAssessmentDto = z.infer<typeof updateAssessmentSchema>;
export type TransitionAssessmentStatusDto = z.infer<typeof transitionAssessmentStatusSchema>;
export type BulkUpsertGradesDto = z.infer<typeof bulkUpsertGradesSchema>;
export type ComputePeriodGradesDto = z.infer<typeof computePeriodGradesSchema>;
export type OverridePeriodGradeDto = z.infer<typeof overridePeriodGradeSchema>;
export type GenerateReportCardsDto = z.infer<typeof generateReportCardsSchema>;
export type UpdateReportCardDto = z.infer<typeof updateReportCardSchema>;
export type ImportProcessDto = z.infer<typeof importProcessSchema>;
