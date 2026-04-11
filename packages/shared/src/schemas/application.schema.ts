import { z } from 'zod';

import { APPLICATION_STATUSES } from '../constants/application-status';
import { consentCaptureSchema } from '../gdpr/consent.schema';

import { paginationQuerySchema } from './pagination.schema';

// ─── Public application — multi-student shape ─────────────────────────────────

export const publicApplicationStudentSchema = z.object({
  first_name: z.string().trim().min(1).max(100),
  middle_name: z.string().trim().max(100).optional(),
  last_name: z.string().trim().min(1).max(100),
  date_of_birth: z.string().date(),
  gender: z.enum(['male', 'female']),
  national_id: z.string().trim().min(1).max(100),
  target_academic_year_id: z.string().uuid(),
  target_year_group_id: z.string().uuid(),
  medical_notes: z.string().max(5000).optional(),
  has_allergies: z.boolean().optional(),
});

export const publicHouseholdPayloadSchema = z.object({
  parent1_first_name: z.string().trim().min(1).max(100),
  parent1_last_name: z.string().trim().min(1).max(100),
  parent1_email: z.string().email(),
  parent1_phone: z.string().trim().min(5).max(40),
  parent1_relationship: z.string().trim().min(1).max(50),
  parent2_first_name: z.string().trim().max(100).optional(),
  parent2_last_name: z.string().trim().max(100).optional(),
  parent2_email: z.string().email().optional(),
  parent2_phone: z.string().trim().max(40).optional(),
  parent2_relationship: z.string().trim().max(50).optional(),
  address_line_1: z.string().trim().min(1).max(200),
  address_line_2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  country: z.string().trim().length(2),
  postal_code: z.string().trim().max(20).optional(),
  emergency_name: z.string().trim().max(200).optional(),
  emergency_phone: z.string().trim().max(40).optional(),
  emergency_relationship: z.string().trim().max(50).optional(),
});

export const createPublicApplicationSchema = z
  .object({
    mode: z.enum(['new_household', 'existing_household']),
    form_definition_id: z.string().uuid(),
    existing_household_id: z.string().uuid().optional(),
    household_payload: publicHouseholdPayloadSchema.optional(),
    students: z.array(publicApplicationStudentSchema).min(1).max(20),
    website_url: z.string().optional(), // honeypot
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
  })
  .refine((v) => (v.mode === 'new_household' ? v.household_payload !== undefined : true), {
    path: ['household_payload'],
    message: 'household_payload is required for new_household mode',
  })
  .refine(
    (v) =>
      v.mode === 'existing_household'
        ? v.existing_household_id !== undefined && v.household_payload === undefined
        : true,
    {
      path: ['existing_household_id'],
      message:
        'existing_household_id is required for existing_household mode and household_payload must be omitted',
    },
  );

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

// ─── Admissions queue pages (Wave 4 impl 11) ───────────────────────────────

// Rejected archive — pagination + free-text search by student or parent name.
export const listRejectedApplicationsSchema = paginationQuerySchema.extend({
  search: z.string().max(200).optional(),
});

// Approved queue — paginated list of approved applications with search.
export const listApprovedApplicationsSchema = paginationQuerySchema.extend({
  search: z.string().max(200).optional(),
});

// Conditional-approval queue — pagination only; urgency is computed server-side.
export const listConditionalApprovalQueueSchema = paginationQuerySchema;

// Manual promotion out of FIFO order (admin override of waiting-list priority).
export const manualPromoteApplicationSchema = z.object({
  justification: z.string().min(10).max(2000),
});

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
export type PublicApplicationStudent = z.infer<typeof publicApplicationStudentSchema>;
export type PublicHouseholdPayload = z.infer<typeof publicHouseholdPayloadSchema>;
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
export type ListApprovedApplicationsQuery = z.infer<typeof listApprovedApplicationsSchema>;
export type ListRejectedApplicationsQuery = z.infer<typeof listRejectedApplicationsSchema>;
export type ListConditionalApprovalQueueQuery = z.infer<typeof listConditionalApprovalQueueSchema>;
export type ManualPromoteApplicationDto = z.infer<typeof manualPromoteApplicationSchema>;
