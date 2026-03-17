import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';

import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private healthService: HealthService) {}

  @Get()
  async check(@Res() res: Response) {
    const result = await this.healthService.check();
    const status = result.status === 'ok' ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE;
    res.status(status).json(result);
  }

  @Get('ready')
  async ready(@Res() res: Response) {
    const result = await this.healthService.getReadiness();
    const status = result.status === 'unhealthy' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK;
    res.status(status).json(result);
  }
}
