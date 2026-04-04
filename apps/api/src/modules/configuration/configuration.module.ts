import { Module } from '@nestjs/common';

import { S3Module } from '../s3/s3.module';
import { TenantsModule } from '../tenants/tenants.module';

import { BrandingController } from './branding.controller';
import { BrandingService } from './branding.service';
import { ConfigurationReadFacade } from './configuration-read.facade';
import { EncryptionService } from './encryption.service';
import { KeyRotationService } from './key-rotation.service';
import { NotificationSettingsController } from './notification-settings.controller';
import { NotificationSettingsService } from './notification-settings.service';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';
import { StripeConfigController } from './stripe-config.controller';
import { StripeConfigService } from './stripe-config.service';

@Module({
  imports: [S3Module, TenantsModule],
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
    ConfigurationReadFacade,
    KeyRotationService,
  ],
  exports: [EncryptionService, SettingsService, ConfigurationReadFacade],
})
export class ConfigurationModule {}
