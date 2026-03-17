import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { Request } from 'express';

import { WebhookService } from './webhook.service';

@Controller('v1/webhooks')
export class WebhookController {
  constructor(private readonly service: WebhookService) {}

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  async handleResend(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
    @Body() body: unknown,
  ) {
    return this.service.handleResendEvent(body as { type: string; data: Record<string, unknown> });
  }

  @Post('twilio')
  @HttpCode(HttpStatus.OK)
  async handleTwilio(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-twilio-signature') twilioSignature: string,
    @Body() body: unknown,
  ) {
    return this.service.handleTwilioEvent(body as { MessageSid?: string; MessageStatus?: string });
  }
}
