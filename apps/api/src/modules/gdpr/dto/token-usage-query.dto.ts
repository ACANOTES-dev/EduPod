import { z } from 'zod';

import { gdprTokenUsageQuerySchema, gdprTokenUsageStatsQuerySchema } from '@school/shared/gdpr';

export type GdprTokenUsageQueryDto = z.infer<typeof gdprTokenUsageQuerySchema>;
export { gdprTokenUsageQuerySchema };

export type GdprTokenUsageStatsQueryDto = z.infer<typeof gdprTokenUsageStatsQuerySchema>;
export { gdprTokenUsageStatsQuerySchema };
