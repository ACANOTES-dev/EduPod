import { z } from 'zod';

import { createSubjectSchema } from '@school/shared';

export type CreateSubjectDto = z.infer<typeof createSubjectSchema>;
export { createSubjectSchema };
