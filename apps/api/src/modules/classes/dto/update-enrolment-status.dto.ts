import { updateEnrolmentStatusSchema } from '@school/shared';
import { z } from 'zod';

export type UpdateEnrolmentStatusDto = z.infer<typeof updateEnrolmentStatusSchema>;
export { updateEnrolmentStatusSchema };
