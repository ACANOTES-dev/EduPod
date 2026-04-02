import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import twilio from 'twilio';
import type { Twilio } from 'twilio';

import { CircuitBreakerRegistry } from '../../../common/services/circuit-breaker-registry';

@Injectable()
export class TwilioWhatsAppProvider {
  private readonly logger = new Logger(TwilioWhatsAppProvider.name);
  private client: Twilio | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerRegistry,
  ) {}

  /**
   * Whether all required Twilio WhatsApp env vars are configured.
   */
  isConfigured(): boolean {
    return !!(
      this.configService.get<string>('TWILIO_ACCOUNT_SID') &&
      this.configService.get<string>('TWILIO_AUTH_TOKEN') &&
      this.configService.get<string>('TWILIO_WHATSAPP_FROM')
    );
  }

  /**
   * Send a WhatsApp message via Twilio.
   *
   * Lazily initialises the Twilio client on first call.
   * Automatically prefixes the `to` number with `whatsapp:` if not already present.
   */
  async send(params: { to: string; body: string }): Promise<{ messageSid: string }> {
    const client = this.ensureClient();

    const whatsappFrom = this.configService.get<string>('TWILIO_WHATSAPP_FROM');
    if (!whatsappFrom) {
      throw new Error(
        'Twilio WhatsApp is not configured. Set TWILIO_WHATSAPP_FROM environment variable.',
      );
    }

    const to = params.to.startsWith('whatsapp:') ? params.to : `whatsapp:${params.to}`;
    const from = whatsappFrom.startsWith('whatsapp:') ? whatsappFrom : `whatsapp:${whatsappFrom}`;

    this.logger.log(`Sending WhatsApp message to=${to}`);

    const message = await this.circuitBreaker.exec('twilio', () =>
      client.messages.create({
        body: params.body,
        from,
        to,
      }),
    );

    this.logger.log(`WhatsApp message sent successfully sid=${message.sid}`);

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
