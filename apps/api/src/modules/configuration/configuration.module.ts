import { Module } from '@nestjs/common';

import { CommsCacheBusModule } from '../communications/cache-bus.module';
import { CommsCacheBusService } from '../communications/comms-cache-bus.service';
import { S3Module } from '../s3/s3.module';

import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { COMMS_CACHE_BUS } from './comms-cache-bus.stub';
import { ConfigurationReadFacade } from './configuration-read.facade';
import { EmailConfigController } from './email-config.controller';
import { EmailConfigService } from './email-config.service';
import { EncryptionService } from './encryption.service';
import { KeyRotationService } from './key-rotation.service';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsService } from './notification-settings.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { SmsConfigController } from './sms-config.controller';
import { SmsConfigService } from './sms-config.service';
import { StripeConfigController } from './stripe-config.controller';
import { StripeConfigService } from './stripe-config.service';
import { WhatsAppConfigController } from './whatsapp-config.controller';
import { WhatsAppConfigService } from './whatsapp-config.service';

@Module({
  imports: [S3Module, CommsCacheBusModule],
  controllers: [
    BrandingController,
    SettingsController,
    StripeConfigController,
    NotificationSettingsController,
    EmailConfigController,
    SmsConfigController,
    WhatsAppConfigController,
  ],
  providers: [
    BrandingService,
    SettingsService,
    StripeConfigService,
    NotificationSettingsService,
    EncryptionService,
    ConfigurationReadFacade,
    KeyRotationService,
    EmailConfigService,
    SmsConfigService,
    WhatsAppConfigService,
    // Impl 04: Redis pub/sub-backed implementation, sourced from `CommsCacheBusModule`.
    { provide: COMMS_CACHE_BUS, useExisting: CommsCacheBusService },
  ],
  exports: [
    EncryptionService,
    SettingsService,
    ConfigurationReadFacade,
    EmailConfigService,
    SmsConfigService,
    WhatsAppConfigService,
    // Export the cache-bus token so Impl 04's per-tenant client cache can subscribe.
    COMMS_CACHE_BUS,
  ],
})
export class ConfigurationModule {}
