import { z } from 'zod';

import { bulkClassAssignmentSchema } from '@school/shared';

export type BulkClassAssignmentDto = z.infer<typeof bulkClassAssignmentSchema>;
export { bulkClassAssignmentSchema };
