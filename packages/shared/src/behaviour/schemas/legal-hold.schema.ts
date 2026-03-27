import { z } from 'zod';

export const LEGAL_HOLD_ENTITY_TYPES = [
  'incident', 'sanction', 'intervention', 'appeal',
  'exclusion_case', 'task', 'attachment',
] as const;

export type LegalHoldEntityType = (typeof LEGAL_HOLD_ENTITY_TYPES)[number];

export const createLegalHoldSchema = z.object({
  entity_type: z.enum(LEGAL_HOLD_ENTITY_TYPES),
  entity_id: z.string().uuid(),
  hold_reason: z.string().min(1).max(5000),
  legal_basis: z.string().max(300).nullable().optional(),
  propagate: z.boolean().optional().default(true),
});

export type CreateLegalHoldDto = z.infer<typeof createLegalHoldSchema>;

export const releaseLegalHoldSchema = z.object({
  release_reason: z.string().min(1).max(5000),
  release_linked: z.boolean().optional().default(false),
});

export type ReleaseLegalHoldDto = z.infer<typeof releaseLegalHoldSchema>;

export const legalHoldListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['active', 'released', 'all']).optional().default('active'),
  entity_type: z.enum(LEGAL_HOLD_ENTITY_TYPES).optional(),
});

export type LegalHoldListQuery = z.infer<typeof legalHoldListQuerySchema>;

export interface LegalHoldListItem {
  id: string;
  entity_type: string;
  entity_id: string;
  hold_reason: string;
  legal_basis: string | null;
  status: string;
  set_by: { id: string; first_name: string; last_name: string };
  set_at: string;
  released_by: { id: string; first_name: string; last_name: string } | null;
  released_at: string | null;
  release_reason: string | null;
}
