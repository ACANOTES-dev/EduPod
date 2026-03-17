import { updateAcademicPeriodSchema, updateAcademicPeriodStatusSchema } from '@school/shared';
import { z } from 'zod';

export type UpdateAcademicPeriodDto = z.infer<typeof updateAcademicPeriodSchema>;
export { updateAcademicPeriodSchema };

export type UpdateAcademicPeriodStatusDto = z.infer<typeof updateAcademicPeriodStatusSchema>;
export { updateAcademicPeriodStatusSchema };
