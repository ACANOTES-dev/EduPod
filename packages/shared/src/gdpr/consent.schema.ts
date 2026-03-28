import { z } from 'zod';

import { paginationQuerySchema } from '../schemas/pagination.schema';

import {
  type ConsentEvidenceType,
  type ConsentSubjectType,
  type ConsentType,
  CONSENT_EVIDENCE_TYPES,
  CONSENT_SUBJECT_TYPES,
  CONSENT_TYPES,
} from './consent-types';

const consentTypeValues = Object.values(CONSENT_TYPES) as [ConsentType, ...ConsentType[]];
const subjectTypeValues =
  CONSENT_SUBJECT_TYPES satisfies readonly [ConsentSubjectType, ...ConsentSubjectType[]];
const evidenceTypeValues =
  CONSENT_EVIDENCE_TYPES satisfies readonly [ConsentEvidenceType, ...ConsentEvidenceType[]];

export const consentCaptureSchema = z.object({
  health_data: z.boolean().default(false),
  whatsapp_channel: z.boolean().default(false),
  email_marketing: z.boolean().default(false),
  photo_use: z.boolean().default(false),
  cross_school_benchmarking: z.boolean().default(false),
  homework_diary: z.boolean().default(false),
  ai_features: z.object({
    ai_grading: z.boolean().default(false),
    ai_comments: z.boolean().default(false),
    ai_risk_detection: z.boolean().default(false),
    ai_progress_summary: z.boolean().default(false),
  }).default({
    ai_grading: false,
    ai_comments: false,
    ai_risk_detection: false,
    ai_progress_summary: false,
  }),
}).default({
  health_data: false,
  whatsapp_channel: false,
  email_marketing: false,
  photo_use: false,
  cross_school_benchmarking: false,
  homework_diary: false,
  ai_features: {
    ai_grading: false,
    ai_comments: false,
    ai_risk_detection: false,
    ai_progress_summary: false,
  },
});
export type ConsentCaptureDto = z.infer<typeof consentCaptureSchema>;

export function mapConsentCaptureToTypes(capture: ConsentCaptureDto): ConsentType[] {
  const consentTypes: ConsentType[] = [];

  if (capture.health_data) consentTypes.push(CONSENT_TYPES.HEALTH_DATA);
  if (capture.whatsapp_channel) consentTypes.push(CONSENT_TYPES.WHATSAPP_CHANNEL);
  if (capture.email_marketing) consentTypes.push(CONSENT_TYPES.EMAIL_MARKETING);
  if (capture.photo_use) consentTypes.push(CONSENT_TYPES.PHOTO_USE);
  if (capture.cross_school_benchmarking) consentTypes.push(CONSENT_TYPES.CROSS_SCHOOL_BENCHMARKING);
  if (capture.homework_diary) consentTypes.push(CONSENT_TYPES.HOMEWORK_DIARY);
  if (capture.ai_features.ai_grading) consentTypes.push(CONSENT_TYPES.AI_GRADING);
  if (capture.ai_features.ai_comments) consentTypes.push(CONSENT_TYPES.AI_COMMENTS);
  if (capture.ai_features.ai_risk_detection) consentTypes.push(CONSENT_TYPES.AI_RISK_DETECTION);
  if (capture.ai_features.ai_progress_summary) consentTypes.push(CONSENT_TYPES.AI_PROGRESS_SUMMARY);

  return consentTypes;
}

export const grantConsentSchema = z.object({
  subject_type: z.enum(subjectTypeValues),
  subject_id: z.string().uuid(),
  consent_type: z.enum(consentTypeValues),
  evidence_type: z.enum(evidenceTypeValues),
  privacy_notice_version_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(5000).optional(),
});
export type GrantConsentDto = z.infer<typeof grantConsentSchema>;

export const bulkGrantConsentsSchema = z.object({
  subject_type: z.enum(subjectTypeValues),
  subject_id: z.string().uuid(),
  consents: z.array(z.object({
    type: z.enum(consentTypeValues),
    evidence_type: z.enum(evidenceTypeValues),
    privacy_notice_version_id: z.string().uuid().nullable().optional(),
    notes: z.string().max(5000).optional(),
  })).min(1),
});
export type BulkGrantConsentsDto = z.infer<typeof bulkGrantConsentsSchema>;

export const getConsentsByTypeQuerySchema = paginationQuerySchema.pick({
  page: true,
  pageSize: true,
});
export type GetConsentsByTypeQueryDto = z.infer<typeof getConsentsByTypeQuerySchema>;

export const parentPortalConsentItemSchema = z.object({
  consent_id: z.string().uuid().nullable(),
  subject_type: z.enum(subjectTypeValues),
  subject_id: z.string().uuid(),
  subject_name: z.string(),
  consent_type: z.enum(consentTypeValues),
  status: z.enum(['granted', 'withdrawn', 'expired']),
  granted_at: z.string().datetime().nullable(),
  withdrawn_at: z.string().datetime().nullable(),
  evidence_type: z.enum(evidenceTypeValues).nullable(),
  notes: z.string().nullable(),
});
export type ParentPortalConsentItemDto = z.infer<typeof parentPortalConsentItemSchema>;
