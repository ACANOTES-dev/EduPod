import { Module } from '@nestjs/common';

import { PlatformRealtimeModule } from '../platform/platform-realtime.module';
import { PlatformModule } from '../platform/platform.module';
import { PlatformAuditModule } from '../platform-audit/platform-audit.module';
import { PlatformErrorLogModule } from '../platform-error-log/platform-error-log.module';
import { PlatformUsersModule } from '../platform-users/platform-users.module';

import { SyntheticAlertEmitterService } from './synthetic-alert-emitter.service';
import { SyntheticCheckHandlersService } from './synthetic-check-handlers.service';
import { SyntheticCheckRunnerService } from './synthetic-check-runner.service';
import { SyntheticCheckSchedulerService } from './synthetic-check-scheduler.service';
import { SyntheticChecksController } from './synthetic-checks.controller';
import { SyntheticChecksService } from './synthetic-checks.service';
import { SyntheticCredentialResolverService } from './synthetic-credential-resolver.service';

@Module({
  imports: [
    PlatformAuditModule,
    PlatformErrorLogModule,
    PlatformModule,
    PlatformRealtimeModule,
    PlatformUsersModule,
  ],
  controllers: [SyntheticChecksController],
  providers: [
    SyntheticAlertEmitterService,
    SyntheticCheckHandlersService,
    SyntheticCheckRunnerService,
    SyntheticCheckSchedulerService,
    SyntheticChecksService,
    SyntheticCredentialResolverService,
  ],
})
export class PlatformResilienceModule {}
