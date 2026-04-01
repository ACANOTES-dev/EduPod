import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';

import { ConcernsController } from './controllers/concerns.controller';
import { PastoralDsarController } from './controllers/pastoral-dsar.controller';
import { AuthorMaskingInterceptor } from './interceptors/author-masking.interceptor';
import { AffectedTrackingService } from './services/affected-tracking.service';
import { ConcernVersionService } from './services/concern-version.service';
import { ConcernService } from './services/concern.service';
import { PastoralDsarService } from './services/pastoral-dsar.service';
import { PastoralEventService } from './services/pastoral-event.service';
import { PastoralNotificationService } from './services/pastoral-notification.service';
import { StudentChronologyService } from './services/student-chronology.service';

// ─── PastoralCoreModule ────────────────────────────────────────────────────────
// Concerns, versions, notifications, events, DSAR, affected tracking, chronology.
// This is a leaf module — it does NOT import ChildProtectionModule.

@Module({
  imports: [
    AuthModule,
    CommunicationsModule,
    BullModule.registerQueue({ name: 'pastoral' }),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [ConcernsController, PastoralDsarController],
  providers: [
    AffectedTrackingService,
    AuthorMaskingInterceptor,
    ConcernService,
    ConcernVersionService,
    PastoralDsarService,
    PastoralEventService,
    PastoralNotificationService,
    StudentChronologyService,
  ],
  exports: [
    AffectedTrackingService,
    ConcernService,
    ConcernVersionService,
    PastoralDsarService,
    PastoralEventService,
    PastoralNotificationService,
    StudentChronologyService,
  ],
})
export class PastoralCoreModule {}
