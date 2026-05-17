import { Controller, Get, Header, HttpStatus, Param, Res } from '@nestjs/common';
import type { Response } from 'express';

import { AlertRoutingService } from './alert-routing.service';

@Controller('v1/admin/alerts/ack')
export class AlertMagicAckController {
  constructor(private readonly routing: AlertRoutingService) {}

  // GET /v1/admin/alerts/ack/:token
  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async acknowledge(@Param('token') token: string, @Res() response: Response): Promise<void> {
    await this.routing.acknowledgeMagicToken(token);
    response.status(HttpStatus.OK).send(`
      <!doctype html>
      <html lang="en">
        <head><title>Alert acknowledged</title></head>
        <body style="font-family: system-ui, sans-serif; padding: 32px;">
          <h1>Alert acknowledged</h1>
          <p>Escalation has been halted. You can close this page.</p>
        </body>
      </html>
    `);
  }
}
