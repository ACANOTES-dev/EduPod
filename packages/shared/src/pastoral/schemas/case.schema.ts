import { z } from 'zod';

import { caseStatusSchema, pastoralTierSchema } from '../enums';

// ─── Create ────────────────────────────────────────────────────────────────

export const createCaseSchema = z.object({
  student_id: z.string().uuid(),
  concern_ids: z.array(z.string().uuid()).min(1),
  owner_user_id: z.string().uuid(),
  opened_reason: z.string().min(1),
  tier: pastoralTierSchema.optional().default(1),
  next_review_date: z.string().optional(),
  additional_student_ids: z.array(z.string().uuid()).optional(),
});

export type CreateCaseDto = z.infer<typeof createCaseSchema>;

// ─── Update ────────────────────────────────────────────────────────────────

export const updateCaseSchema = z.object({
  owner_user_id: z.string().uuid().optional(),
  next_review_date: z.string().nullable().optional(),
  tier: pastoralTierSchema.optional(),
  legal_hold: z.boolean().optional(),
});

export type UpdateCaseDto = z.infer<typeof updateCaseSchema>;

// ─── Status Transition ─────────────────────────────────────────────────────

export const caseStatusTransitionSchema = z.object({
  status: caseStatusSchema,
  reason: z.string().min(1),
});

export type CaseStatusTransitionDto = z.infer<typeof caseStatusTransitionSchema>;

// ─── Ownership Transfer ────────────────────────────────────────────────────

export const caseOwnershipTransferSchema = z.object({
  new_owner_user_id: z.string().uuid(),
  reason: z.string().min(1),
});

export type CaseOwnershipTransferDto = z.infer<typeof caseOwnershipTransferSchema>;

// ─── Link Concern ──────────────────────────────────────────────────────────

export const linkConcernToCaseSchema = z.object({
  concern_id: z.string().uuid(),
});

export type LinkConcernToCaseDto = z.infer<typeof linkConcernToCaseSchema>;

// ─── Add Student ───────────────────────────────────────────────────────────

export const addStudentToCaseSchema = z.object({
  student_id: z.string().uuid(),
});

export type AddStudentToCaseDto = z.infer<typeof addStudentToCaseSchema>;

// ─── Filters ───────────────────────────────────────────────────────────────

export const caseFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  status: caseStatusSchema.optional(),
  owner_user_id: z.string().uuid().optional(),
  tier: pastoralTierSchema.optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  sort: z.enum(['created_at', 'next_review_date', 'status']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CaseFilters = z.infer<typeof caseFiltersSchema>;
