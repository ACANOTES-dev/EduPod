import { Controller, Get } from '@nestjs/common';

@Controller('health')
export class WorkerHealthController {
  @Get()
  check() {
    return { status: 'ok', service: 'worker' };
  }
}
