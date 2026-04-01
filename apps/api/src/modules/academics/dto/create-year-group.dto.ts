import { z } from 'zod';

import { createYearGroupSchema } from '@school/shared';

export type CreateYearGroupDto = z.infer<typeof createYearGroupSchema>;
export { createYearGroupSchema };
