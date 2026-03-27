import { z } from 'zod';

import { cpRecordTypeSchema, exportPurposeSchema, pastoralEntityTypeSchema, pastoralTierSchema } from '../enums';

// ─── Export Request (Tier 1/2 — standard flow) ────────────────────────────

export const exportTier12RequestSchema = z.object({
  entity_type: pastoralEntityTypeSchema,
  entity_ids: z.array(z.string().uuid()).min(1),
  student_id: z.string().uuid().optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});

export type ExportTier12RequestDto = z.infer<typeof exportTier12RequestSchema>;

// ─── CP Export Preview (Tier 3 — first step) ──────────────────────────────

export const cpExportPreviewSchema = z.object({
  student_id: z.string().uuid(),
  record_types: z.array(cpRecordTypeSchema).optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
});

export type CpExportPreviewDto = z.infer<typeof cpExportPreviewSchema>;

// ─── CP Export Generate (Tier 3 — confirm and generate) ────────────────────

export const cpExportGenerateSchema = z
  .object({
    student_id: z.string().uuid(),
    purpose: exportPurposeSchema,
    other_reason: z.string().min(1).max(1000).optional(),
    record_types: z.array(cpRecordTypeSchema).optional(),
    date_from: z.string().datetime().optional(),
    date_to: z.string().datetime().optional(),
    locale: z.enum(['en', 'ar']).default('en'),
  })
  .refine(
    (data) => data.purpose !== 'other' || (!!data.other_reason && data.other_reason.length > 0),
    { message: 'other_reason is required when purpose is "other"', path: ['other_reason'] },
  );

export type CpExportGenerateDto = z.infer<typeof cpExportGenerateSchema>;

// ─── Export Confirm (second step after preview) ────────────────────────────

export const exportConfirmSchema = z.object({
  export_ref_id: z.string().uuid(),
  confirmed: z.boolean(),
});

export type ExportConfirmDto = z.infer<typeof exportConfirmSchema>;

// ─── Export Download ───────────────────────────────────────────────────────

export const exportDownloadSchema = z.object({
  download_token: z.string().min(1),
});

export type ExportDownloadDto = z.infer<typeof exportDownloadSchema>;

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
