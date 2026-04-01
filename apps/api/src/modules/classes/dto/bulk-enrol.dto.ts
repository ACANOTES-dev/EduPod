import { z } from 'zod';

import { bulkEnrolSchema } from '@school/shared';

export type BulkEnrolDto = z.infer<typeof bulkEnrolSchema>;
export { bulkEnrolSchema };
