import { Controller, Get, HttpStatus, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';

import { HealthService } from './health.service';

@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  // GET /health
  @Get()
  async check(@Res() res: Response) {
    const result = await this.healthService.check();
    const httpStatus =
      result.status === 'unhealthy' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK;
    res.status(httpStatus).json(result);
  }

  // GET /health/ready — load balancer / readiness probe
  @Get('ready')
  async ready(@Res() res: Response) {
    const result = await this.healthService.getReadiness();
    const httpStatus =
      result.status === 'not_ready' ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.OK;
    res.status(httpStatus).json(result);
  }

  // GET /health/live — Kubernetes liveness probe (always 200 if the process responds)
  @Get('live')
  live(@Res() res: Response) {
    const result = this.healthService.getLiveness();
    res.status(HttpStatus.OK).json(result);
  }
}
