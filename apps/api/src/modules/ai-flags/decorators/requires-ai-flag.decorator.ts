import { SetMetadata } from '@nestjs/common';

import type { WellbeingAiModuleKey } from '@school/shared/wellbeing';

export const REQUIRES_AI_FLAG_KEY = 'requires_ai_flag';

/**
 * Mark an HTTP handler as requiring the tenant's AI flag for `moduleKey`
 * to be enabled. The global `AiFlagGuard` reads this metadata and throws
 * `403 AI_DISABLED` when the flag is off for the current tenant.
 */
export const RequiresAiFlag = (moduleKey: WellbeingAiModuleKey) =>
  SetMetadata(REQUIRES_AI_FLAG_KEY, moduleKey);
