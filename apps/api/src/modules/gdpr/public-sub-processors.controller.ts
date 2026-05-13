import { Controller, Get } from '@nestjs/common';

import { SubProcessorsService } from './sub-processors.service';

// LEGAL REQUIREMENT: this controller MUST NEVER be gated. GDPR/DPA features are legally mandatory for every tenant. See Module Gating/STRATEGY.md §5.2.
@Controller('v1/public/sub-processors')
export class PublicSubProcessorsController {
  constructor(private readonly subProcessorsService: SubProcessorsService) {}

  @Get()
  async getCurrent() {
    const [current_version, history] = await Promise.all([
      this.subProcessorsService.getCurrentRegister(),
      this.subProcessorsService.getHistory(),
    ]);

    return {
      current_version,
      history,
    };
  }
}
