import { createHmac, timingSafeEqual } from 'crypto';

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
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

import { apiError } from '../../common/errors/api-error';

import { WebhookService } from './webhook.service';

@Controller('v1/webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly service: WebhookService,
    private readonly configService: ConfigService,
  ) {}

  @Post('resend')
  @HttpCode(HttpStatus.OK)
  async handleResend(
    @Req() req: RawBodyRequest<Request>,
    @Headers('svix-id') svixId: string,
    @Headers('svix-timestamp') svixTimestamp: string,
    @Headers('svix-signature') svixSignature: string,
    @Body() body: unknown,
  ) {
    const secret = this.configService.get<string>('RESEND_WEBHOOK_SECRET');
    if (secret) {
      // Svix webhook verification: HMAC-SHA256 signature check
      const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(body));
      const payload = `${svixId}.${svixTimestamp}.${rawBody.toString()}`;

      // Svix secrets are base64-encoded, sometimes prefixed with "whsec_"
      const secretBytes = Buffer.from(
        secret.startsWith('whsec_') ? secret.slice(6) : secret,
        'base64',
      );
      const expectedSig = createHmac('sha256', secretBytes).update(payload).digest('base64');

      // svixSignature can contain multiple signatures separated by spaces, each prefixed with "v1,"
      const signatures = svixSignature.split(' ').map((s) => s.replace('v1,', ''));
      const isValid = signatures.some((sig) => {
        try {
          return timingSafeEqual(Buffer.from(sig, 'base64'), Buffer.from(expectedSig, 'base64'));
        } catch {
          return false;
        }
      });

      if (!isValid) {
        this.logger.error('Resend webhook signature verification failed');
        throw new UnauthorizedException(
          apiError('INVALID_RESEND_WEBHOOK_SIGNATURE', 'Invalid webhook signature'),
        );
      }

      // Validate timestamp (reject events older than 5 minutes)
      const ts = parseInt(svixTimestamp, 10);
      if (Math.abs(Date.now() / 1000 - ts) > 300) {
        this.logger.error('Resend webhook timestamp is too old');
        throw new UnauthorizedException(
          apiError('RESEND_WEBHOOK_TIMESTAMP_TOO_OLD', 'Webhook timestamp too old'),
        );
      }
    } else if (process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException(
        apiError(
          'RESEND_WEBHOOK_SECRET_MISSING',
          'Webhook endpoint not configured — RESEND_WEBHOOK_SECRET is missing',
        ),
      );
    } else {
      this.logger.warn('RESEND_WEBHOOK_SECRET not configured — skipping verification (dev only)');
    }

    return this.service.handleResendEvent(body as { type: string; data: Record<string, unknown> });
  }

  @Post('twilio')
  @HttpCode(HttpStatus.OK)
  async handleTwilio(
    @Req() _req: RawBodyRequest<Request>,
    @Headers('x-twilio-signature') twilioSignature: string,
    @Body() body: unknown,
  ) {
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    if (authToken && twilioSignature) {
      // Twilio signature verification: HMAC-SHA1 of URL + sorted body params
      const requestUrl = `${this.configService.get<string>('APP_URL')}/api/v1/webhooks/twilio`;
      const params = body as Record<string, string>;

      // Build the data string: URL + sorted key/value pairs
      const dataStr =
        requestUrl +
        Object.keys(params)
          .sort()
          .map((k) => k + params[k])
          .join('');
      const expectedSig = createHmac('sha1', authToken).update(dataStr).digest('base64');

      try {
        const isValid = timingSafeEqual(Buffer.from(twilioSignature), Buffer.from(expectedSig));
        if (!isValid) {
          this.logger.error('Twilio webhook signature verification failed');
          throw new UnauthorizedException(
            apiError('INVALID_TWILIO_WEBHOOK_SIGNATURE', 'Invalid Twilio webhook signature'),
          );
        }
      } catch (err) {
        if (err instanceof UnauthorizedException) throw err;
        this.logger.error('Twilio signature verification error');
        throw new UnauthorizedException(
          apiError('TWILIO_WEBHOOK_SIGNATURE_ERROR', 'Twilio webhook signature verification error'),
        );
      }
    } else if (!authToken && process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException(
        apiError(
          'TWILIO_AUTH_TOKEN_MISSING',
          'Webhook endpoint not configured — TWILIO_AUTH_TOKEN is missing',
        ),
      );
    } else if (!authToken) {
      this.logger.warn('TWILIO_AUTH_TOKEN not configured — skipping verification (dev only)');
    }

    return this.service.handleTwilioEvent(body as { MessageSid?: string; MessageStatus?: string });
  }
}
