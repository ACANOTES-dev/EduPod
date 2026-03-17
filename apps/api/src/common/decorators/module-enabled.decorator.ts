import { SetMetadata } from '@nestjs/common';

export const MODULE_ENABLED_KEY = 'module_enabled';

export const ModuleEnabled = (moduleKey: string) =>
  SetMetadata(MODULE_ENABLED_KEY, moduleKey);
