import { bulkClassAssignmentSchema } from '@school/shared';
import { z } from 'zod';

export type BulkClassAssignmentDto = z.infer<typeof bulkClassAssignmentSchema>;
export { bulkClassAssignmentSchema };
