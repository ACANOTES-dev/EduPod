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
  purpose: exportPurposeSchema.optional(),
  other_reason: z.string().min(1).max(1000).optional(),
  record_types: z.array(cpRecordTypeSchema).optional(),
  date_from: z.string().datetime().optional(),
  date_to: z.string().datetime().optional(),
}).refine(
  (data) => data.purpose !== 'other' || (!!data.other_reason && data.other_reason.length > 0),
  { message: 'other_reason is required when purpose is "other"', path: ['other_reason'] },
);

export type CpExportPreviewDto = z.infer<typeof cpExportPreviewSchema>;

// ─── CP Export Generate (Tier 3 — confirm and generate) ────────────────────

export const cpExportGenerateSchema = z
  .object({
    preview_token: z.string().uuid().optional(),
    student_id: z.string().uuid().optional(),
    purpose: exportPurposeSchema.optional(),
    other_reason: z.string().min(1).max(1000).optional(),
    record_types: z.array(cpRecordTypeSchema).optional(),
    date_from: z.string().datetime().optional(),
    date_to: z.string().datetime().optional(),
    locale: z.enum(['en', 'ar']).default('en'),
  })
  .superRefine((data, ctx) => {
    if (!data.preview_token && !data.student_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'student_id is required when preview_token is not provided',
        path: ['student_id'],
      });
    }

    if (!data.preview_token && !data.purpose) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'purpose is required when preview_token is not provided',
        path: ['purpose'],
      });
    }

    if (
      data.purpose === 'other' &&
      (!data.other_reason || data.other_reason.trim().length === 0)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'other_reason is required when purpose is "other"',
        path: ['other_reason'],
      });
    }
  });

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
  export_ref_id: z.string().min(1),
  watermarked: z.boolean(),
});

export type ExportEventPayload = z.infer<typeof exportEventPayloadSchema>;
