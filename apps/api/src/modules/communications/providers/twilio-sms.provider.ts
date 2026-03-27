import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import type { Twilio } from 'twilio';

/** Maximum SMS body length before truncation. */
const SMS_MAX_LENGTH = 1600;

@Injectable()
export class TwilioSmsProvider {
  private readonly logger = new Logger(TwilioSmsProvider.name);
  private client: Twilio | null = null;

  constructor(private readonly configService: ConfigService) {}

  /**
   * Whether all required Twilio SMS env vars are configured.
   */
  isConfigured(): boolean {
    return !!(
      this.configService.get<string>('TWILIO_ACCOUNT_SID') &&
      this.configService.get<string>('TWILIO_AUTH_TOKEN') &&
      this.configService.get<string>('TWILIO_SMS_FROM')
    );
  }

  /**
   * Send an SMS via Twilio.
   *
   * Lazily initialises the Twilio client on first call.
   * Truncates the body to 1600 characters with a `...` suffix if exceeded.
   */
  async send(params: { to: string; body: string }): Promise<{ messageSid: string }> {
    const client = this.ensureClient();

    const smsFrom = this.configService.get<string>('TWILIO_SMS_FROM');
    if (!smsFrom) {
      throw new Error(
        'Twilio SMS is not configured. Set TWILIO_SMS_FROM environment variable.',
      );
    }

    let body = params.body;
    if (body.length > SMS_MAX_LENGTH) {
      this.logger.warn(
        `SMS body exceeds ${SMS_MAX_LENGTH} chars (${body.length}), truncating`,
      );
      body = body.slice(0, SMS_MAX_LENGTH - 3) + '...';
    }

    this.logger.log(`Sending SMS to=${params.to}`);

    const message = await client.messages.create({
      body,
      from: smsFrom,
      to: params.to,
    });

    this.logger.log(`SMS sent successfully sid=${message.sid}`);

    return { messageSid: message.sid };
  }

  private ensureClient(): Twilio {
    if (this.client) {
      return this.client;
    }

    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');

    if (!accountSid || !authToken) {
      throw new Error(
        'Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables.',
      );
    }

    this.client = twilio(accountSid, authToken);
    return this.client;
  }
}
