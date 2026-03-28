export const CONSENT_TYPES = {
  HEALTH_DATA: 'health_data',
  ALLERGY_DATA: 'allergy_data',
  MEDICAL_NOTES: 'medical_notes',
  PHOTO_USE: 'photo_use',
  WHATSAPP_CHANNEL: 'whatsapp_channel',
  EMAIL_MARKETING: 'email_marketing',
  AI_GRADING: 'ai_grading',
  AI_COMMENTS: 'ai_comments',
  AI_RISK_DETECTION: 'ai_risk_detection',
  AI_PROGRESS_SUMMARY: 'ai_progress_summary',
  CROSS_SCHOOL_BENCHMARKING: 'cross_school_benchmarking',
  HOMEWORK_DIARY: 'homework_diary',
} as const;

export type ConsentType = typeof CONSENT_TYPES[keyof typeof CONSENT_TYPES];

export const CONSENT_SUBJECT_TYPES = ['student', 'parent', 'staff', 'applicant'] as const;
export type ConsentSubjectType = (typeof CONSENT_SUBJECT_TYPES)[number];

export const CONSENT_EVIDENCE_TYPES = [
  'in_app_modal',
  'registration_form',
  'paper_form',
  'email_link',
] as const;
export type ConsentEvidenceType = (typeof CONSENT_EVIDENCE_TYPES)[number];

export const CONSENT_CATEGORIES = {
  health: 'health',
  communications: 'communications',
  ai_features: 'ai_features',
  student_experience: 'student_experience',
} as const;

export const CONSENT_TYPE_CATEGORY_MAP: Record<ConsentType, string> = {
  [CONSENT_TYPES.HEALTH_DATA]: CONSENT_CATEGORIES.health,
  [CONSENT_TYPES.ALLERGY_DATA]: CONSENT_CATEGORIES.health,
  [CONSENT_TYPES.MEDICAL_NOTES]: CONSENT_CATEGORIES.health,
  [CONSENT_TYPES.PHOTO_USE]: CONSENT_CATEGORIES.student_experience,
  [CONSENT_TYPES.WHATSAPP_CHANNEL]: CONSENT_CATEGORIES.communications,
  [CONSENT_TYPES.EMAIL_MARKETING]: CONSENT_CATEGORIES.communications,
  [CONSENT_TYPES.AI_GRADING]: CONSENT_CATEGORIES.ai_features,
  [CONSENT_TYPES.AI_COMMENTS]: CONSENT_CATEGORIES.ai_features,
  [CONSENT_TYPES.AI_RISK_DETECTION]: CONSENT_CATEGORIES.ai_features,
  [CONSENT_TYPES.AI_PROGRESS_SUMMARY]: CONSENT_CATEGORIES.ai_features,
  [CONSENT_TYPES.CROSS_SCHOOL_BENCHMARKING]: CONSENT_CATEGORIES.student_experience,
  [CONSENT_TYPES.HOMEWORK_DIARY]: CONSENT_CATEGORIES.student_experience,
};

export const STUDENT_PARENT_PORTAL_CONSENT_TYPES: ConsentType[] = [
  CONSENT_TYPES.HEALTH_DATA,
  CONSENT_TYPES.ALLERGY_DATA,
  CONSENT_TYPES.MEDICAL_NOTES,
  CONSENT_TYPES.PHOTO_USE,
  CONSENT_TYPES.AI_GRADING,
  CONSENT_TYPES.AI_COMMENTS,
  CONSENT_TYPES.AI_RISK_DETECTION,
  CONSENT_TYPES.AI_PROGRESS_SUMMARY,
  CONSENT_TYPES.CROSS_SCHOOL_BENCHMARKING,
  CONSENT_TYPES.HOMEWORK_DIARY,
];

const CONSENT_TYPE_VALUES = Object.values(CONSENT_TYPES) as ConsentType[];
const CONSENT_SUBJECT_TYPE_VALUES = [...CONSENT_SUBJECT_TYPES] as ConsentSubjectType[];

export function isConsentType(value: string): value is ConsentType {
  return CONSENT_TYPE_VALUES.includes(value as ConsentType);
}

export function isConsentSubjectType(value: string): value is ConsentSubjectType {
  return CONSENT_SUBJECT_TYPE_VALUES.includes(value as ConsentSubjectType);
}
