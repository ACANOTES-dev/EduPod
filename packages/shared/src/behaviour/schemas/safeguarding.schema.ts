import { z } from 'zod';

// ─── Report Concern ─────────────────────────────────────────────────────────

export const reportSafeguardingConcernSchema = z.object({
  student_id: z.string().uuid(),
  concern_type: z.enum([
    'physical_abuse', 'emotional_abuse', 'sexual_abuse', 'neglect',
    'self_harm', 'bullying', 'online_safety', 'domestic_violence',
    'substance_abuse', 'mental_health', 'radicalisation', 'other',
  ]),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  description: z.string().min(10),
  immediate_actions_taken: z.string().nullable().optional(),
  incident_id: z.string().uuid().nullable().optional(),
});

export type ReportSafeguardingConcernDto = z.infer<typeof reportSafeguardingConcernSchema>;

// ─── Update Concern ─────────────────────────────────────────────────────────

export const updateSafeguardingConcernSchema = z.object({
  description: z.string().min(10).optional(),
  concern_type: z.enum([
    'physical_abuse', 'emotional_abuse', 'sexual_abuse', 'neglect',
    'self_harm', 'bullying', 'online_safety', 'domestic_violence',
    'substance_abuse', 'mental_health', 'radicalisation', 'other',
  ]).optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  immediate_actions_taken: z.string().nullable().optional(),
});

export type UpdateSafeguardingConcernDto = z.infer<typeof updateSafeguardingConcernSchema>;

// ─── Status Transition ──────────────────────────────────────────────────────

export const safeguardingStatusTransitionSchema = z.object({
  status: z.enum([
    'reported', 'acknowledged', 'under_investigation', 'referred',
    'monitoring', 'resolved', 'sealed',
  ]),
  reason: z.string().min(1, 'Reason is required for all status transitions'),
});

export type SafeguardingStatusTransitionDto = z.infer<typeof safeguardingStatusTransitionSchema>;

// ─── Assign Concern ─────────────────────────────────────────────────────────

export const assignSafeguardingConcernSchema = z.object({
  designated_liaison_id: z.string().uuid().nullable().optional(),
  assigned_to_id: z.string().uuid().nullable().optional(),
});

export type AssignSafeguardingConcernDto = z.infer<typeof assignSafeguardingConcernSchema>;

// ─── Record Action ──────────────────────────────────────────────────────────

export const recordSafeguardingActionSchema = z.object({
  action_type: z.enum([
    'note_added', 'status_changed', 'assigned', 'meeting_held',
    'parent_contacted', 'agency_contacted', 'tusla_referred',
    'garda_referred', 'document_uploaded', 'document_downloaded',
    'review_completed',
  ]),
  description: z.string().min(1),
  due_date: z.string().datetime().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type RecordSafeguardingActionDto = z.infer<typeof recordSafeguardingActionSchema>;

// ─── Referrals ──────────────────────────────────────────────────────────────

export const tuslaReferralSchema = z.object({
  reference_number: z.string().min(1),
  referred_at: z.string().datetime(),
});

export type TuslaReferralDto = z.infer<typeof tuslaReferralSchema>;

export const gardaReferralSchema = z.object({
  reference_number: z.string().min(1),
  referred_at: z.string().datetime(),
});

export type GardaReferralDto = z.infer<typeof gardaReferralSchema>;

// ─── Seal ───────────────────────────────────────────────────────────────────

export const initiateSealSchema = z.object({
  reason: z.string().min(1, 'Seal reason is required'),
});

export type InitiateSealDto = z.infer<typeof initiateSealSchema>;

export const approveSealSchema = z.object({
  confirmation: z.literal(true),
});

export type ApproveSealDto = z.infer<typeof approveSealSchema>;

// ─── Break-Glass ────────────────────────────────────────────────────────────

export const grantBreakGlassSchema = z.object({
  granted_to_id: z.string().uuid(),
  reason: z.string().min(1),
  duration_hours: z.number().int().min(1).max(72),
  scope: z.enum(['all_concerns', 'specific_concerns']).default('all_concerns'),
  scoped_concern_ids: z.array(z.string().uuid()).optional(),
}).refine(
  (data) => data.scope !== 'specific_concerns' || (data.scoped_concern_ids && data.scoped_concern_ids.length > 0),
  { message: 'scoped_concern_ids required when scope is specific_concerns', path: ['scoped_concern_ids'] },
);

export type GrantBreakGlassDto = z.infer<typeof grantBreakGlassSchema>;

export const completeBreakGlassReviewSchema = z.object({
  notes: z.string().min(1),
});

export type CompleteBreakGlassReviewDto = z.infer<typeof completeBreakGlassReviewSchema>;

// ─── Upload Attachment ──────────────────────────────────────────────────────

export const uploadSafeguardingAttachmentSchema = z.object({
  classification: z.enum([
    'staff_statement', 'student_statement', 'parent_letter',
    'meeting_minutes', 'screenshot', 'photo', 'scanned_document',
    'referral_form', 'return_agreement', 'behaviour_contract',
    'medical_report', 'agency_correspondence', 'other',
  ]),
  description: z.string().max(500).nullable().optional(),
  is_redactable: z.boolean().default(false),
});

export type UploadSafeguardingAttachmentDto = z.infer<typeof uploadSafeguardingAttachmentSchema>;

// ─── Query Schemas ──────────────────────────────────────────────────────────

export const listSafeguardingConcernsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  severity: z.string().optional(),
  type: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  assigned_to_id: z.string().uuid().optional(),
  sla_status: z.enum(['all', 'overdue', 'due_soon', 'on_track']).optional(),
});

export type ListSafeguardingConcernsQuery = z.infer<typeof listSafeguardingConcernsQuerySchema>;

export const listSafeguardingActionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

export type ListSafeguardingActionsQuery = z.infer<typeof listSafeguardingActionsQuerySchema>;

export const myReportsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type MyReportsQuery = z.infer<typeof myReportsQuerySchema>;
