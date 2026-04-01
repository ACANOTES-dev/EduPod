import { z } from 'zod';

import { createAcademicYearSchema } from '@school/shared';

export type CreateAcademicYearDto = z.infer<typeof createAcademicYearSchema>;
export { createAcademicYearSchema };
