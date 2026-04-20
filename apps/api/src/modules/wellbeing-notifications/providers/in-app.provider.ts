import { Injectable, Logger } from '@nestjs/common';

import { NotificationsService } from '../../communications/notifications.service';

import type { WellbeingChannelProvider, WellbeingDispatchInput } from './types';

/**
 * InAppProvider — always-on channel for wellbeing events.
 *
 * Writes one row per recipient into the existing `notifications` table with
 * `channel: 'in_app'` (status `delivered` per `NotificationsService.createBatch`).
 * Recipients see the row in the existing in-app notification surface; cache
 * invalidation is handled by `createBatch`.
 *
 * Wave 5 impl 18 + Wave 6 hidden-feature UIs surface dedicated wellbeing
 * inboxes on top of these rows. For now the rows live alongside the rest of
 * the platform's notifications.
 */
@Injectable()
export class WellbeingInAppProvider implements WellbeingChannelProvider {
  readonly key = 'in_app' as const;
  private readonly logger = new Logger(WellbeingInAppProvider.name);

  constructor(private readonly notifications: NotificationsService) {}

  async send(input: WellbeingDispatchInput): Promise<void> {
    if (input.recipients.length === 0) {
      this.logger.debug(`[wellbeing-in-app] event=${input.event} skipped — no recipients`);
      return;
    }

    const locale = input.locale ?? 'en';
    const templateKey = `wellbeing.${input.event}`;

    await this.notifications.createBatch(
      input.tenantId,
      input.recipients.map((recipient) => ({
        tenant_id: input.tenantId,
        recipient_user_id: recipient.user_id,
        channel: 'in_app',
        template_key: templateKey,
        locale,
        payload_json: {
          event: input.event,
          severity: input.severity,
          title: input.title,
          body: input.body,
          href: input.href,
        },
        source_entity_type: input.source_entity_type,
        source_entity_id: input.source_entity_id,
      })),
    );
  }
}
