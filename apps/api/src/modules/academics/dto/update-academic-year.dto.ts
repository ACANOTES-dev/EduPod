import { updateAcademicYearSchema, updateAcademicYearStatusSchema } from '@school/shared';
import { z } from 'zod';

export type UpdateAcademicYearDto = z.infer<typeof updateAcademicYearSchema>;
export { updateAcademicYearSchema };

export type UpdateAcademicYearStatusDto = z.infer<typeof updateAcademicYearStatusSchema>;
export { updateAcademicYearStatusSchema };
