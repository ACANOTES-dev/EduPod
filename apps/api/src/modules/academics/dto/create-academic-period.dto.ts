import { createAcademicPeriodSchema } from '@school/shared';
import { z } from 'zod';

export type CreateAcademicPeriodDto = z.infer<typeof createAcademicPeriodSchema>;
export { createAcademicPeriodSchema };
