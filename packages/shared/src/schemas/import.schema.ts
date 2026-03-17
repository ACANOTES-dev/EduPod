import { z } from 'zod';

export const importUploadSchema = z.object({
  import_type: z.enum(['students', 'parents', 'staff', 'fees', 'exam_results', 'staff_compensation']),
});

export type ImportUploadDto = z.infer<typeof importUploadSchema>;

export const importFilterSchema = z.object({
  status: z.enum(['uploaded', 'validated', 'processing', 'completed', 'failed']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type ImportFilterDto = z.infer<typeof importFilterSchema>;

export const importSummarySchema = z.object({
  total_rows: z.number().default(0),
  successful: z.number().default(0),
  failed: z.number().default(0),
  warnings: z.number().default(0),
  errors: z.array(z.object({
    row: z.number(),
    field: z.string(),
    error: z.string(),
  })).default([]),
  warnings_list: z.array(z.object({
    row: z.number(),
    field: z.string(),
    warning: z.string(),
  })).default([]),
});

export type ImportSummaryDto = z.infer<typeof importSummarySchema>;
