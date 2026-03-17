import { updateSubjectSchema } from '@school/shared';
import { z } from 'zod';

export type UpdateSubjectDto = z.infer<typeof updateSubjectSchema>;
export { updateSubjectSchema };
