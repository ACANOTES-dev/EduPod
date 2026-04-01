import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { Response } from 'express';

import { WorkerHealthService } from './worker-health.service';

@Controller('health')
export class WorkerHealthController {
  constructor(private readonly healthService: WorkerHealthService) {}

  // GET /health
  @Get()
  async check(@Res() res: Response): Promise<void> {
    const result = await this.healthService.check();
    const httpStatus =
      result.status === 'unhealthy' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK;
    res.status(httpStatus).json(result);
  }

  // GET /health/live — liveness probe (always 200 if the process responds)
  @Get('live')
  live(@Res() res: Response): void {
    const result = this.healthService.getLiveness();
    res.status(HttpStatus.OK).json(result);
  }
}
