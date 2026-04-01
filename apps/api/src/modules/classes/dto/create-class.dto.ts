import { z } from 'zod';

import { createClassSchema } from '@school/shared';

export type CreateClassDto = z.infer<typeof createClassSchema>;
export { createClassSchema };
