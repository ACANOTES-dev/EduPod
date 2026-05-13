import { SetMetadata } from '@nestjs/common';

import type { ModuleKey } from '@school/shared';

export const MODULE_ENABLED_KEY = 'module_enabled';

export const ModuleEnabled = <K extends ModuleKey>(moduleKey: K) =>
  SetMetadata(MODULE_ENABLED_KEY, moduleKey);
