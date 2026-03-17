import { createAcademicYearSchema } from '@school/shared';
import { z } from 'zod';

export type CreateAcademicYearDto = z.infer<typeof createAcademicYearSchema>;
export { createAcademicYearSchema };
