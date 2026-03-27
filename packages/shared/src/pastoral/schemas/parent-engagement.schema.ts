import { z } from 'zod';

import { contactMethodSchema } from '../enums';

// ─── Log Parent Contact ──────────────────────────────────────────────────

export const logParentContactSchema = z.object({
  student_id: z.string().uuid(),
  concern_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  parent_id: z.string().uuid(),
  contact_method: contactMethodSchema,
  contact_date: z.string().datetime(),
  outcome: z.string().min(1).max(5000),
  parent_response: z.string().max(5000).optional(),
});

export type LogParentContactDto = z.infer<typeof logParentContactSchema>;

// ─── Parent Self-Referral ─────────────────────────────────────────────────

export const parentSelfReferralSchema = z.object({
  student_id: z.string().uuid(),
  description: z.string().min(10).max(10000),
  category: z.string().optional(),
});

export type ParentSelfReferralDto = z.infer<typeof parentSelfReferralSchema>;

// ─── List Parent Contacts Query ───────────────────────────────────────────

export const listParentContactsQuerySchema = z.object({
  student_id: z.string().uuid().optional(),
  concern_id: z.string().uuid().optional(),
  case_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ListParentContactsQuery = z.infer<typeof listParentContactsQuerySchema>;

// ─── Parent Pastoral Query ────────────────────────────────────────────────

export const parentPastoralQuerySchema = z.object({
  student_id: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ParentPastoralQuery = z.infer<typeof parentPastoralQuerySchema>;
