import { z } from 'zod';

import { updateAcademicYearSchema, updateAcademicYearStatusSchema } from '@school/shared';

export type UpdateAcademicYearDto = z.infer<typeof updateAcademicYearSchema>;
export { updateAcademicYearSchema };

export type UpdateAcademicYearStatusDto = z.infer<typeof updateAcademicYearStatusSchema>;
export { updateAcademicYearStatusSchema };
