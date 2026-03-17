import { assignClassStaffSchema } from '@school/shared';
import { z } from 'zod';

export type AssignClassStaffDto = z.infer<typeof assignClassStaffSchema>;
export { assignClassStaffSchema };
