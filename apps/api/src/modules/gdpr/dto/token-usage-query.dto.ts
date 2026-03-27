import { gdprTokenUsageQuerySchema, gdprTokenUsageStatsQuerySchema } from '@school/shared';
import { z } from 'zod';

export type GdprTokenUsageQueryDto = z.infer<typeof gdprTokenUsageQuerySchema>;
export { gdprTokenUsageQuerySchema };

export type GdprTokenUsageStatsQueryDto = z.infer<typeof gdprTokenUsageStatsQuerySchema>;
export { gdprTokenUsageStatsQuerySchema };
