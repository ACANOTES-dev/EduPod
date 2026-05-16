import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import webpush from 'web-push';

import { pushAlertChannelConfigSchema } from '@school/shared';

import type { AlertPayload, ChannelDispatcher } from './channel-dispatcher.interface';

@Injectable()
export class PushAlertDispatcher implements ChannelDispatcher {
  constructor(private readonly configService: ConfigService) {}

  async send(config: unknown, alert: AlertPayload): Promise<void> {
    const parsed = pushAlertChannelConfigSchema.parse(config);
    const vapidPublicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const vapidPrivateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const vapidEmail = this.configService.get<string>('VAPID_EMAIL') ?? 'mailto:admin@edupod.app';

    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error('VAPID keys are not configured');
    }

    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

    await webpush.sendNotification(
      {
        endpoint: parsed.endpoint,
        keys: parsed.keys,
      },
      JSON.stringify({
        badge: '/badge-72.png',
        body: alert.message,
        data: { metric_value: alert.metric_value },
        icon: '/icon-192.png',
        title: `[${alert.severity.toUpperCase()}] ${alert.rule_name}`,
      }),
    );
  }
}
