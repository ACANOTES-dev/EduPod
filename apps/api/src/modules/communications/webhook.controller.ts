import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Request } from 'express';

import { WebhookService } from './webhook.service';

@SkipThrottle()
@Controller('v1/webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

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
    // Impl 05: the platform-shared `RESEND_WEBHOOK_SECRET` env var was removed.
    // Per-tenant webhook verification lives on
    // `/v1/webhooks/communications/email/:tenantId` (Impl 06). This legacy
    // platform endpoint stays alive temporarily so any provider that's still
    // pointed at the old URL doesn't 404, but signature verification can no
    // longer be performed here — every event lands as unverified, with a
    // log line so operators see the migration is needed.
    void svixId;
    void svixTimestamp;
    void svixSignature;
    void req;

    this.logger.warn(
      'Legacy /v1/webhooks/resend hit — signature verification is no longer performed at this endpoint. ' +
        'Reconfigure Resend to POST to /v1/webhooks/communications/email/:tenantId (Impl 06).',
    );

    return this.service.handleResendEvent(body as { type: string; data: Record<string, unknown> });
  }

  @Post('twilio')
  @HttpCode(HttpStatus.OK)
  async handleTwilio(
    @Req() _req: RawBodyRequest<Request>,
    @Headers('x-twilio-signature') twilioSignature: string,
    @Body() body: unknown,
  ) {
    // Impl 05: TWILIO_AUTH_TOKEN env var was removed. Per-tenant webhook
    // verification lives on /v1/webhooks/communications/{sms,whatsapp}/:tenantId
    // (Impl 06). This legacy platform endpoint stays alive temporarily so any
    // provider that's still pointed at the old URL doesn't 404. Signature
    // verification cannot be performed here — operators must reconfigure Twilio
    // to use the per-tenant URLs.
    void twilioSignature;

    this.logger.warn(
      'Legacy /v1/webhooks/twilio hit — signature verification is no longer performed at this endpoint. ' +
        'Reconfigure Twilio to POST to /v1/webhooks/communications/{sms,whatsapp}/:tenantId (Impl 06).',
    );

    return this.service.handleTwilioEvent(body as { MessageSid?: string; MessageStatus?: string });
  }
}
