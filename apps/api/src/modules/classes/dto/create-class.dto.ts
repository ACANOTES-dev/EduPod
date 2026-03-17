import { createClassSchema } from '@school/shared';
import { z } from 'zod';

export type CreateClassDto = z.infer<typeof createClassSchema>;
export { createClassSchema };
