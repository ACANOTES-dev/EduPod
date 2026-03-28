import { Controller, Get } from '@nestjs/common';

import { SubProcessorsService } from './sub-processors.service';

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
