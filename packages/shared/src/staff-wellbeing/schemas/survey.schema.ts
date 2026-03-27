import { z } from 'zod';

import { QUESTION_TYPE, SURVEY_FREQUENCY } from '../enums';

export const createSurveyQuestionSchema = z.object({
  question_text: z.string().min(1).max(1000),
  question_type: z.enum(QUESTION_TYPE),
  display_order: z.number().int().min(0),
  options: z.array(z.string().min(1)).min(2).optional(), // required for single_choice, validated in service
  is_required: z.boolean().default(true),
});
export type CreateSurveyQuestionDto = z.infer<typeof createSurveyQuestionSchema>;

export const createSurveySchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(2000).optional(),
  frequency: z.enum(SURVEY_FREQUENCY).default('fortnightly'),
  window_opens_at: z.string().datetime(),
  window_closes_at: z.string().datetime(),
  min_response_threshold: z.number().int().min(3).default(5),
  dept_drill_down_threshold: z.number().int().min(8).default(10),
  moderation_enabled: z.boolean().default(true),
  questions: z.array(createSurveyQuestionSchema).min(1).max(10),
});
export type CreateSurveyDto = z.infer<typeof createSurveySchema>;

export const updateSurveySchema = createSurveySchema.partial();
export type UpdateSurveyDto = z.infer<typeof updateSurveySchema>;

export const submitSurveyResponseSchema = z.object({
  answers: z.array(z.object({
    question_id: z.string().uuid(),
    answer_value: z.number().int().min(1).max(5).optional(), // for likert/choice
    answer_text: z.string().max(2000).optional(),            // for freeform
  })).min(1),
});
export type SubmitSurveyResponseDto = z.infer<typeof submitSurveyResponseSchema>;

export const moderateResponseSchema = z.object({
  status: z.enum(['approved', 'flagged', 'redacted']),
  reason: z.string().max(500).optional(),
});
export type ModerateResponseDto = z.infer<typeof moderateResponseSchema>;

export const surveyResultsQuerySchema = z.object({
  department: z.string().max(150).optional(),
});
export type SurveyResultsQueryDto = z.infer<typeof surveyResultsQuerySchema>;
