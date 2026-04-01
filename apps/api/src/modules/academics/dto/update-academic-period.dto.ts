import { z } from 'zod';

import { updateAcademicPeriodSchema, updateAcademicPeriodStatusSchema } from '@school/shared';

export type UpdateAcademicPeriodDto = z.infer<typeof updateAcademicPeriodSchema>;
export { updateAcademicPeriodSchema };

export type UpdateAcademicPeriodStatusDto = z.infer<typeof updateAcademicPeriodStatusSchema>;
export { updateAcademicPeriodStatusSchema };
