import { z } from 'zod';

import { updateClassSchema, updateClassStatusSchema } from '@school/shared';

export type UpdateClassDto = z.infer<typeof updateClassSchema>;
export { updateClassSchema };

export type UpdateClassStatusDto = z.infer<typeof updateClassStatusSchema>;
export { updateClassStatusSchema };
