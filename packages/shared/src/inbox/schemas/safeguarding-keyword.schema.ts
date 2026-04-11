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
