import { Injectable } from '@nestjs/common';
import { z } from 'zod';

import { EncryptionService } from '../../configuration/encryption.service';

import type { AlertPayload, ChannelDispatcher } from './channel-dispatcher.interface';

const storedTelegramConfigSchema = z.object({
  bot_token_encrypted: z.string().min(1),
  bot_token_key_ref: z.string().min(1),
  chat_id: z.string().min(1),
});

const SEVERITY_MARKER: Record<string, string> = {
  critical: '[CRITICAL]',
  info: '[INFO]',
  warning: '[WARNING]',
};

@Injectable()
export class TelegramAlertDispatcher implements ChannelDispatcher {
  constructor(private readonly encryption: EncryptionService) {}

  async send(config: unknown, alert: AlertPayload): Promise<void> {
    const parsed = storedTelegramConfigSchema.parse(config);
    const botToken = this.encryption.decrypt(parsed.bot_token_encrypted, parsed.bot_token_key_ref);
    const marker = SEVERITY_MARKER[alert.severity] ?? '[ALERT]';
    const text = [
      `${marker} *${this.escapeMarkdown(alert.rule_name)}*`,
      '',
      this.escapeMarkdown(alert.message),
      '',
      `Metric value: \`${alert.metric_value}\``,
      `Severity: ${this.escapeMarkdown(alert.severity)}`,
    ].join('\n');

    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      body: JSON.stringify({
        chat_id: parsed.chat_id,
        parse_mode: 'MarkdownV2',
        text,
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Telegram API error ${response.status}`);
    }
  }

  private escapeMarkdown(value: string): string {
    return value.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }
}
