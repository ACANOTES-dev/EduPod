import { Buffer } from 'buffer';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { whatsappAlertChannelConfigSchema } from '@school/shared';

import type { AlertPayload, ChannelDispatcher } from './channel-dispatcher.interface';

function normalizeWhatsAppNumber(value: string): string {
  return value.startsWith('whatsapp:') ? value : `whatsapp:${value}`;
}

@Injectable()
export class WhatsAppAlertDispatcher implements ChannelDispatcher {
  constructor(private readonly configService: ConfigService) {}

  async send(config: unknown, alert: AlertPayload): Promise<void> {
    const parsed = whatsappAlertChannelConfigSchema.parse(config);
    const accountSid = this.configService.get<string>('TWILIO_ACCOUNT_SID');
    const authToken = this.configService.get<string>('TWILIO_AUTH_TOKEN');
    const fromNumber = this.configService.get<string>('TWILIO_WHATSAPP_FROM');

    if (!accountSid || !authToken || !fromNumber) {
      throw new Error('Twilio WhatsApp credentials are not configured');
    }

    const body = [
      `[${alert.severity.toUpperCase()}] ${alert.rule_name}`,
      '',
      alert.message,
      '',
      `Metric value: ${alert.metric_value}`,
    ].join('\n');
    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        body: new URLSearchParams({
          Body: body,
          From: normalizeWhatsAppNumber(fromNumber),
          To: normalizeWhatsAppNumber(parsed.to_number),
        }).toString(),
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        method: 'POST',
      },
    );

    if (!response.ok) {
      throw new Error(`Twilio API error ${response.status}`);
    }
  }
}
