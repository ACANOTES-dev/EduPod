import { z } from 'zod';

import { updateEnrolmentStatusSchema } from '@school/shared';

export type UpdateEnrolmentStatusDto = z.infer<typeof updateEnrolmentStatusSchema>;
export { updateEnrolmentStatusSchema };
