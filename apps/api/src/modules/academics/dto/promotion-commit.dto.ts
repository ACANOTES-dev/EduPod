import { promotionCommitSchema } from '@school/shared';
import { z } from 'zod';

export type PromotionCommitDto = z.infer<typeof promotionCommitSchema>;
export { promotionCommitSchema };
