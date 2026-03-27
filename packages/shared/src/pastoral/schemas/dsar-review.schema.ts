import { z } from 'zod';

import { dsarDecisionSchema, pastoralEntityTypeSchema, pastoralTierSchema } from '../enums';

// ─── Record Decision ───────────────────────────────────────────────────────

export const dsarReviewDecisionSchema = z.object({
  decision: dsarDecisionSchema,
  legal_basis: z.string().max(100).optional(),
  justification: z.string().optional(),
});

export type DsarReviewDecisionDto = z.infer<typeof dsarReviewDecisionSchema>;

// Require legal_basis when excluding or redacting
export const dsarReviewDecisionRefinedSchema = dsarReviewDecisionSchema.refine(
  (data) => {
    if (data.decision === 'exclude' || data.decision === 'redact') {
      return !!data.legal_basis;
    }
    return true;
  },
  { message: 'legal_basis is required when decision is exclude or redact', path: ['legal_basis'] },
);

// ─── Filters ───────────────────────────────────────────────────────────────

export const dsarReviewFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  compliance_request_id: z.string().uuid().optional(),
  entity_type: pastoralEntityTypeSchema.optional(),
  tier: pastoralTierSchema.optional(),
  decision: dsarDecisionSchema.optional(),
  pending_only: z.coerce.boolean().optional(),
  sort: z.enum(['created_at', 'tier']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type DsarReviewFilters = z.infer<typeof dsarReviewFiltersSchema>;
