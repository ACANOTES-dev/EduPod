import { NotFoundException } from '@nestjs/common';

import type { ModuleKey } from '@school/shared';

export class ModuleDisabledException extends NotFoundException {
  constructor(moduleKey: ModuleKey) {
    super({
      error: {
        code: 'MODULE_DISABLED',
        module: moduleKey,
        message: 'This feature is disabled by your administrator.',
      },
    });
  }
}
