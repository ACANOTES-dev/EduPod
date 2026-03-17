import { createYearGroupSchema } from '@school/shared';
import { z } from 'zod';

export type CreateYearGroupDto = z.infer<typeof createYearGroupSchema>;
export { createYearGroupSchema };
