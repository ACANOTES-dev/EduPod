import { z } from 'zod';

import { createAcademicPeriodSchema } from '@school/shared';

export type CreateAcademicPeriodDto = z.infer<typeof createAcademicPeriodSchema>;
export { createAcademicPeriodSchema };
