import { z } from 'zod';

import { promotionCommitSchema } from '@school/shared';

export type PromotionCommitDto = z.infer<typeof promotionCommitSchema>;
export { promotionCommitSchema };
