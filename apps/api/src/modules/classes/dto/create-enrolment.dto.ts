import { createEnrolmentSchema } from '@school/shared';
import { z } from 'zod';

export type CreateEnrolmentDto = z.infer<typeof createEnrolmentSchema>;
export { createEnrolmentSchema };
