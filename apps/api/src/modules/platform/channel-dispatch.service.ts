import { Injectable, Logger } from '@nestjs/common';
import type { PlatformAlertChannelType } from '@prisma/client';

import type {
  AlertChannelForDispatch,
  AlertPayload,
  ChannelDispatcher,
} from './dispatchers/channel-dispatcher.interface';
import { EmailAlertDispatcher } from './dispatchers/email-alert.dispatcher';
import { PushAlertDispatcher } from './dispatchers/push-alert.dispatcher';
import { TelegramAlertDispatcher } from './dispatchers/telegram-alert.dispatcher';
import { WhatsAppAlertDispatcher } from './dispatchers/whatsapp-alert.dispatcher';

@Injectable()
export class ChannelDispatchService {
  private readonly logger = new Logger(ChannelDispatchService.name);
  private readonly dispatchers: Map<PlatformAlertChannelType, ChannelDispatcher>;

  constructor(
    private readonly emailDispatcher: EmailAlertDispatcher,
    private readonly telegramDispatcher: TelegramAlertDispatcher,
    private readonly whatsappDispatcher: WhatsAppAlertDispatcher,
    private readonly pushDispatcher: PushAlertDispatcher,
  ) {
    this.dispatchers = new Map<PlatformAlertChannelType, ChannelDispatcher>([
      ['email', this.emailDispatcher],
      ['telegram', this.telegramDispatcher],
      ['whatsapp', this.whatsappDispatcher],
      ['push', this.pushDispatcher],
    ]);
  }

  async dispatchAlert(alert: AlertPayload, channels: AlertChannelForDispatch[]): Promise<string[]> {
    const notified: string[] = [];

    for (const channel of channels) {
      if (!channel.is_enabled) {
        continue;
      }

      const dispatcher = this.dispatchers.get(channel.type);
      if (!dispatcher) {
        continue;
      }

      try {
        await dispatcher.send(channel.config, alert);
        notified.push(channel.type);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Unknown dispatch error';
        this.logger.warn(
          `[dispatchAlert] channel=${channel.id} type=${channel.type} failed: ${message}`,
        );
      }
    }

    return notified;
  }

  async sendTestAlert(
    channel: AlertChannelForDispatch,
  ): Promise<{ success: boolean; message: string }> {
    const dispatcher = this.dispatchers.get(channel.type);
    if (!dispatcher) {
      return { success: false, message: `Unknown channel type: ${channel.type}` };
    }

    try {
      await dispatcher.send(channel.config, {
        message: 'This is a test alert from EduPod Platform Admin.',
        metric_value: 0,
        rule_name: 'Test Alert',
        severity: 'info',
      });
      return { success: true, message: `Test alert sent to ${channel.type} successfully.` };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown dispatch error';
      return { success: false, message: `Failed to send test alert: ${message}` };
    }
  }
}
