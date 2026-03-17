import { createSubjectSchema } from '@school/shared';
import { z } from 'zod';

export type CreateSubjectDto = z.infer<typeof createSubjectSchema>;
export { createSubjectSchema };
