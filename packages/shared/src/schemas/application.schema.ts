import { z } from 'zod';

import { APPLICATION_STATUSES } from '../constants/application-status';
import { consentCaptureSchema } from '../gdpr/consent.schema';

import { paginationQuerySchema } from './pagination.schema';

// Public application creation (from public admissions page)
export const createPublicApplicationSchema = z.object({
  form_definition_id: z.string().uuid(),
  student_first_name: z.string().min(1).max(100),
  student_last_name: z.string().min(1).max(100),
  date_of_birth: z.string().date().nullable().optional(),
  target_academic_year_id: z.string().uuid(),
  target_year_group_id: z.string().uuid(),
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

// Review application (status transitions) — targets in the new state machine
// are limited to the decisions an admin can take from the queue views. The
// full transition graph is enforced server-side in
// `application-state-machine.service.ts` which will be rewritten in Wave 2.
export const reviewApplicationSchema = z.object({
  status: z.enum(['ready_to_admit', 'conditional_approval', 'approved', 'rejected']),
  expected_updated_at: z.string().datetime(),
  rejection_reason: z.string().min(1).max(5000).optional(),
});

// List applications query
export const listApplicationsSchema = paginationQuerySchema.extend({
  status: z.enum(APPLICATION_STATUSES).optional(),
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

// ─── Admissions payment recording (Wave 3 impl 07) ─────────────────────────

export const recordCashPaymentSchema = z.object({
  amount_cents: z.number().int().positive(),
  receipt_number: z.string().max(100).optional(),
  notes: z.string().max(1000).optional(),
});

export const recordBankTransferSchema = z.object({
  amount_cents: z.number().int().positive(),
  transfer_reference: z.string().min(1).max(100),
  transfer_date: z.string().datetime(),
  notes: z.string().max(1000).optional(),
});

export const forceApproveOverrideSchema = z.object({
  override_type: z.enum(['full_waiver', 'partial_waiver', 'deferred_payment']),
  actual_amount_collected_cents: z.number().int().nonnegative(),
  justification: z.string().min(20).max(2000),
});

export const listAdmissionOverridesSchema = paginationQuerySchema;

// ─── Admissions Stripe checkout regenerate (Wave 3 impl 06) ────────────────

export const regenerateAdmissionsPaymentLinkSchema = z
  .object({
    success_url: z.string().url().max(2048).optional(),
    cancel_url: z.string().url().max(2048).optional(),
  })
  .optional()
  .default({});

// Inferred types
export type CreatePublicApplicationDto = z.infer<typeof createPublicApplicationSchema>;
export type SubmitApplicationDto = z.infer<typeof submitApplicationSchema>;
export type ReviewApplicationDto = z.infer<typeof reviewApplicationSchema>;
export type ListApplicationsQuery = z.infer<typeof listApplicationsSchema>;
export type CreateApplicationNoteDto = z.infer<typeof createApplicationNoteSchema>;
export type AdmissionsAnalyticsQuery = z.infer<typeof admissionsAnalyticsSchema>;
export type RecordCashPaymentDto = z.infer<typeof recordCashPaymentSchema>;
export type RecordBankTransferDto = z.infer<typeof recordBankTransferSchema>;
export type ForceApproveOverrideDto = z.infer<typeof forceApproveOverrideSchema>;
export type ListAdmissionOverridesQuery = z.infer<typeof listAdmissionOverridesSchema>;
export type RegenerateAdmissionsPaymentLinkDto = z.infer<
  typeof regenerateAdmissionsPaymentLinkSchema
>;
