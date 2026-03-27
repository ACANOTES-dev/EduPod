export const SURVEY_STATUS = ['draft', 'active', 'closed', 'archived'] as const;
export type SurveyStatus = (typeof SURVEY_STATUS)[number];

export const QUESTION_TYPE = ['likert_5', 'single_choice', 'freeform'] as const;
export type QuestionType = (typeof QUESTION_TYPE)[number];

export const MODERATION_STATUS = ['pending', 'approved', 'flagged', 'redacted'] as const;
export type ModerationStatus = (typeof MODERATION_STATUS)[number];

export const SURVEY_FREQUENCY = ['weekly', 'fortnightly', 'monthly', 'ad_hoc'] as const;
export type SurveyFrequency = (typeof SURVEY_FREQUENCY)[number];

// V2 prep
export const SUGGESTION_CATEGORY = ['workload', 'facilities', 'policy', 'professional_development', 'wellbeing', 'communication', 'other'] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORY)[number];
