import { Module } from '@nestjs/common';

import { OnboardingService } from './onboarding.service';
import { PlatformRealtimeModule } from './platform-realtime.module';

@Module({
  imports: [PlatformRealtimeModule],
  providers: [OnboardingService],
  exports: [OnboardingService],
})
export class PlatformOnboardingModule {}
