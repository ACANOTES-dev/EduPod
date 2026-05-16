import { Module } from '@nestjs/common';

import { PlatformAuditModule } from '../platform-audit/platform-audit.module';

import { OnboardingService } from './onboarding.service';
import { PlatformRealtimeModule } from './platform-realtime.module';

@Module({
  imports: [PlatformAuditModule, PlatformRealtimeModule],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class PlatformOnboardingModule {}
