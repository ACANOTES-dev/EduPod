import { Module } from '@nestjs/common';

import { CommunicationsModule } from '../communications/communications.module';

import { WellbeingEmailProvider } from './providers/email.provider';
import { WellbeingInAppProvider } from './providers/in-app.provider';
import { WellbeingSmsProvider } from './providers/sms.provider';
import { WellbeingWhatsappProvider } from './providers/whatsapp.provider';
import { WellbeingNotificationsController } from './wellbeing-notifications.controller';
import { WellbeingNotificationsService } from './wellbeing-notifications.service';

/**
 * WellbeingNotificationsModule — orchestration layer for wellbeing-event
 * fan-out across in-app + email + SMS + WhatsApp.
 *
 * Imports `CommunicationsModule` so `WellbeingInAppProvider` can use
 * `NotificationsService.createBatch` to write `notifications` rows
 * (channel = 'in_app', status = 'delivered'). Email/SMS/WhatsApp providers
 * are stubs throwing `PROVIDER_NOT_WIRED`; provider hardening is deferred
 * per PLAN.md §8.
 *
 * Exported so Wave 3 backend services and the upcoming Wave 5 admin UI can
 * call `dispatch()` directly. Service is auto-injectable into worker
 * processors via the same import path because the worker app composes
 * the same module tree.
 */
@Module({
  imports: [CommunicationsModule],
  controllers: [WellbeingNotificationsController],
  providers: [
    WellbeingNotificationsService,
    WellbeingInAppProvider,
    WellbeingEmailProvider,
    WellbeingSmsProvider,
    WellbeingWhatsappProvider,
  ],
  exports: [WellbeingNotificationsService],
})
export class WellbeingNotificationsModule {}
