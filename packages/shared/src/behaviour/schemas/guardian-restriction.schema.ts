import { z } from 'zod';

// ─── Enums ──────────────────────────────────────────────────────────────────

export const RESTRICTION_TYPE = [
  'no_behaviour_visibility',
  'no_behaviour_notifications',
  'no_portal_access',
  'no_communications',
] as const;
export type RestrictionTypeValue = (typeof RESTRICTION_TYPE)[number];

export const RESTRICTION_STATUS = ['active', 'expired', 'revoked', 'superseded'] as const;
export type RestrictionStatusValue = (typeof RESTRICTION_STATUS)[number];

// ─── Create ─────────────────────────────────────────────────────────────────

export const createGuardianRestrictionSchema = z.object({
  student_id: z.string().uuid(),
  parent_id: z.string().uuid(),
  restriction_type: z.enum(RESTRICTION_TYPE),
  legal_basis: z.string().max(200).nullable().optional(),
  reason: z.string().min(1),
  effective_from: z.string().min(1), // ISO date YYYY-MM-DD
  effective_until: z.string().nullable().optional(),
  review_date: z.string().nullable().optional(),
  approved_by_id: z.string().uuid().nullable().optional(),
});

export type CreateGuardianRestrictionDto = z.infer<typeof createGuardianRestrictionSchema>;

// ─── Update ─────────────────────────────────────────────────────────────────

export const updateGuardianRestrictionSchema = z.object({
  effective_until: z.string().nullable().optional(),
  review_date: z.string().nullable().optional(),
  legal_basis: z.string().max(200).nullable().optional(),
});

export type UpdateGuardianRestrictionDto = z.infer<typeof updateGuardianRestrictionSchema>;

// ─── Revoke ─────────────────────────────────────────────────────────────────

export const revokeGuardianRestrictionSchema = z.object({
  reason: z.string().min(1),
});

export type RevokeGuardianRestrictionDto = z.infer<typeof revokeGuardianRestrictionSchema>;

// ─── List Query ─────────────────────────────────────────────────────────────

export const listGuardianRestrictionsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  student_id: z.string().uuid().optional(),
  parent_id: z.string().uuid().optional(),
  status: z.enum(RESTRICTION_STATUS).optional(),
});

export type ListGuardianRestrictionsQuery = z.infer<typeof listGuardianRestrictionsQuerySchema>;
