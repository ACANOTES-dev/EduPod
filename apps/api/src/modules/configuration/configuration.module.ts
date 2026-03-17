import { Module } from '@nestjs/common';

import { S3Module } from '../s3/s3.module';

import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { EncryptionService } from './encryption.service';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsService } from './notification-settings.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { StripeConfigController } from './stripe-config.controller';
import { StripeConfigService } from './stripe-config.service';

@Module({
  imports: [S3Module],
  controllers: [
    BrandingController,
    SettingsController,
    StripeConfigController,
    NotificationSettingsController,
  ],
  providers: [
    BrandingService,
    SettingsService,
    StripeConfigService,
    NotificationSettingsService,
    EncryptionService,
  ],
  exports: [
    BrandingService,
    SettingsService,
    StripeConfigService,
    NotificationSettingsService,
    EncryptionService,
  ],
})
export class ConfigurationModule {}
