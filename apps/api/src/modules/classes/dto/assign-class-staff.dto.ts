import { z } from 'zod';

import { assignClassStaffSchema } from '@school/shared';

export type AssignClassStaffDto = z.infer<typeof assignClassStaffSchema>;
export { assignClassStaffSchema };
