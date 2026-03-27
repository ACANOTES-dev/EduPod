import { z } from 'zod';

import { exportPurposeSchema, pastoralEntityTypeSchema, pastoralTierSchema } from '../enums';

// ─── Export Request (Tier 1/2 — standard flow) ────────────────────────────

export const exportTier12RequestSchema = z.object({
  entity_type: pastoralEntityTypeSchema,
  entity_ids: z.array(z.string().uuid()).min(1),
  student_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

export type ExportTier12RequestDto = z.infer<typeof exportTier12RequestSchema>;

// ─── Export Request (Tier 3 — purpose/confirm/watermark flow) ──────────────

export const exportTier3RequestSchema = z.object({
  purpose: exportPurposeSchema,
  purpose_detail: z.string().optional(),
  entity_type: pastoralEntityTypeSchema,
  entity_ids: z.array(z.string().uuid()).min(1),
  student_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

export type ExportTier3RequestDto = z.infer<typeof exportTier3RequestSchema>;

// Require purpose_detail when purpose is 'other'
export const exportTier3RequestRefinedSchema = exportTier3RequestSchema.refine(
  (data) => {
    if (data.purpose === 'other') {
      return !!data.purpose_detail;
    }
    return true;
  },
  { message: 'purpose_detail is required when purpose is other', path: ['purpose_detail'] },
);

// ─── Export Confirm (second step after preview) ────────────────────────────

export const exportConfirmSchema = z.object({
  export_ref_id: z.string().uuid(),
  confirmed: z.boolean(),
});

export type ExportConfirmDto = z.infer<typeof exportConfirmSchema>;

// ─── Export Event Payload ──────────────────────────────────────────────────

export const exportEventPayloadSchema = z.object({
  export_tier: pastoralTierSchema,
  entity_type: pastoralEntityTypeSchema,
  entity_ids: z.array(z.string().uuid()),
  purpose: exportPurposeSchema.optional(),
  export_ref_id: z.string().uuid(),
  watermarked: z.boolean(),
});

export type ExportEventPayload = z.infer<typeof exportEventPayloadSchema>;
