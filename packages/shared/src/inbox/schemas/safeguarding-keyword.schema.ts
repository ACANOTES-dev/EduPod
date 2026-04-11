import { z } from 'zod';

import { MESSAGE_FLAG_SEVERITIES, SAFEGUARDING_CATEGORIES } from '../constants';

export const createSafeguardingKeywordSchema = z.object({
  keyword: z.string().min(1).max(255),
  severity: z.enum(MESSAGE_FLAG_SEVERITIES),
  category: z.enum(SAFEGUARDING_CATEGORIES),
  active: z.boolean().optional(),
});

export type CreateSafeguardingKeywordDto = z.infer<typeof createSafeguardingKeywordSchema>;

export const updateSafeguardingKeywordSchema = createSafeguardingKeywordSchema.partial();

export type UpdateSafeguardingKeywordDto = z.infer<typeof updateSafeguardingKeywordSchema>;

export const setSafeguardingKeywordActiveSchema = z.object({
  active: z.boolean(),
});

export type SetSafeguardingKeywordActiveDto = z.infer<typeof setSafeguardingKeywordActiveSchema>;

export const bulkImportSafeguardingKeywordsSchema = z.object({
  keywords: z
    .array(createSafeguardingKeywordSchema)
    .min(1, 'At least one keyword is required')
    .max(2000, 'Bulk imports are capped at 2000 keywords per request'),
});

export type BulkImportSafeguardingKeywordsDto = z.infer<
  typeof bulkImportSafeguardingKeywordsSchema
>;
