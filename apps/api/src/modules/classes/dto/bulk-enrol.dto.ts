import { bulkEnrolSchema } from '@school/shared';
import { z } from 'zod';

export type BulkEnrolDto = z.infer<typeof bulkEnrolSchema>;
export { bulkEnrolSchema };
