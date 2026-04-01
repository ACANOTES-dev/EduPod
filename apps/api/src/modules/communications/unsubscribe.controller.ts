import { BadRequestException, Controller, Get, Logger, Query, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';

import { apiError } from '../../common/errors/api-error';

import { UnsubscribeService } from './unsubscribe.service';

/**
 * Public endpoint for email unsubscribe links.
 * No auth guard — parents click this from email without logging in.
 */
@Controller('v1/notifications')
export class UnsubscribeController {
  private readonly logger = new Logger(UnsubscribeController.name);

  constructor(
    private readonly unsubscribeService: UnsubscribeService,
    private readonly configService: ConfigService,
  ) {}

  @Get('unsubscribe')
  async unsubscribe(@Query('token') token: string, @Res() res: Response): Promise<void> {
    const appUrl = this.configService.get<string>('APP_URL', 'http://localhost:5551');

    if (!token) {
      throw new BadRequestException(apiError('MISSING_TOKEN', 'Unsubscribe token is required'));
    }

    try {
      await this.unsubscribeService.processUnsubscribe(token);
      this.logger.log('Unsubscribe processed successfully');
      res.redirect(`${appUrl}/unsubscribed`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Unsubscribe failed: ${message}`);
      res.redirect(`${appUrl}/unsubscribed?error=invalid`);
    }
  }
}
