import { z } from 'zod';

import { updateSubjectSchema } from '@school/shared';

export type UpdateSubjectDto = z.infer<typeof updateSubjectSchema>;
export { updateSubjectSchema };
