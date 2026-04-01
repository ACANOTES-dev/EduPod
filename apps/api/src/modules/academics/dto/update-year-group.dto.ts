import { z } from 'zod';

import { updateYearGroupSchema } from '@school/shared';

export type UpdateYearGroupDto = z.infer<typeof updateYearGroupSchema>;
export { updateYearGroupSchema };
