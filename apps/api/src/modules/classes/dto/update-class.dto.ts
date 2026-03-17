import { updateClassSchema, updateClassStatusSchema } from '@school/shared';
import { z } from 'zod';

export type UpdateClassDto = z.infer<typeof updateClassSchema>;
export { updateClassSchema };

export type UpdateClassStatusDto = z.infer<typeof updateClassStatusSchema>;
export { updateClassStatusSchema };
