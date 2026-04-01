import { z } from 'zod';

import { createEnrolmentSchema } from '@school/shared';

export type CreateEnrolmentDto = z.infer<typeof createEnrolmentSchema>;
export { createEnrolmentSchema };
