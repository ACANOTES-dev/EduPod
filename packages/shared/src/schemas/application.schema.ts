import { z } from 'zod';

import { consentCaptureSchema } from '../gdpr/consent.schema';

import { paginationQuerySchema } from './pagination.schema';

// Public application creation (from public admissions page)
export const createPublicApplicationSchema = z.object({
  form_definition_id: z.string().uuid(),
  student_first_name: z.string().min(1).max(100),
  student_last_name: z.string().min(1).max(100),
  date_of_birth: z.string().date().nullable().optional(),
  payload_json: z.record(z.string(), z.unknown()),
  consents: consentCaptureSchema.default({
    health_data: false,
    whatsapp_channel: false,
    ai_features: {
      ai_grading: false,
      ai_comments: false,
      ai_risk_detection: false,
      ai_progress_summary: false,
    },
  }),
  website_url: z.string().optional(), // honeypot field
});

// Submit application (after parent auth)
export const submitApplicationSchema = z.object({
  // No body needed - application_id comes from path param
});

// Review application (status transitions)
export const reviewApplicationSchema = z.object({
  status: z.enum(['under_review', 'pending_acceptance_approval', 'rejected']),
  expected_updated_at: z.string().datetime(),
  rejection_reason: z.string().min(1).max(5000).optional(),
});

// Convert application to student
export const convertApplicationSchema = z.object({
  student_first_name: z.string().min(1).max(100),
  student_last_name: z.string().min(1).max(100),
  date_of_birth: z.string().date(),
  year_group_id: z.string().uuid(),
  national_id: z.string().min(1).max(50).nullable().optional(),
  nationality: z.string().min(1).max(100).nullable().optional(),
  parent1_first_name: z.string().min(1).max(100),
  parent1_last_name: z.string().min(1).max(100),
  parent1_email: z.string().email().nullable().optional(),
  parent1_phone: z.string().max(50).nullable().optional(),
  parent1_link_existing_id: z.string().uuid().nullable().optional(),
  parent2_first_name: z.string().max(100).nullable().optional(),
  parent2_last_name: z.string().max(100).nullable().optional(),
  parent2_email: z.string().email().nullable().optional(),
  parent2_link_existing_id: z.string().uuid().nullable().optional(),
  household_name: z.string().min(1).max(255).optional(),
  expected_updated_at: z.string().datetime(),
});

// List applications query
export const listApplicationsSchema = paginationQuerySchema.extend({
  status: z
    .enum([
      'draft',
      'submitted',
      'under_review',
      'pending_acceptance_approval',
      'accepted',
      'rejected',
      'withdrawn',
    ])
    .optional(),
  form_definition_id: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
});

// Create application note
export const createApplicationNoteSchema = z.object({
  note: z.string().min(1).max(5000),
  is_internal: z.boolean().default(true),
});

// Admissions analytics query
export const admissionsAnalyticsSchema = z.object({
  form_definition_id: z.string().uuid().optional(),
  date_from: z.string().date().optional(),
  date_to: z.string().date().optional(),
});

// Inferred types
export type CreatePublicApplicationDto = z.infer<typeof createPublicApplicationSchema>;
export type SubmitApplicationDto = z.infer<typeof submitApplicationSchema>;
export type ReviewApplicationDto = z.infer<typeof reviewApplicationSchema>;
export type ConvertApplicationDto = z.infer<typeof convertApplicationSchema>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsSchema>;
export type CreateApplicationNoteDto = z.infer<typeof createApplicationNoteSchema>;
export type AdmissionsAnalyticsQuery = z.infer<typeof admissionsAnalyticsSchema>;
