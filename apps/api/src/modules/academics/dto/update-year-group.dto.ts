import { updateYearGroupSchema } from '@school/shared';
import { z } from 'zod';

export type UpdateYearGroupDto = z.infer<typeof updateYearGroupSchema>;
export { updateYearGroupSchema };
