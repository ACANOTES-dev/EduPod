import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChildProtectionModule } from '../child-protection/child-protection.module';
import { CommunicationsModule } from '../communications/communications.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { RbacModule } from '../rbac/rbac.module';
import { StudentsModule } from '../students/students.module';

import { ConcernsController } from './controllers/concerns.controller';
import { PastoralDsarController } from './controllers/pastoral-dsar.controller';
import { AuthorMaskingInterceptor } from './interceptors/author-masking.interceptor';
import { PastoralReadFacade } from './pastoral-read.facade';
import { AffectedTrackingService } from './services/affected-tracking.service';
import { ConcernQueriesService } from './services/concern-queries.service';
import { ConcernVersionService } from './services/concern-version.service';
import { ConcernService } from './services/concern.service';
import { PastoralDsarService } from './services/pastoral-dsar.service';
import { PastoralEventService } from './services/pastoral-event.service';
import { PastoralNotificationService } from './services/pastoral-notification.service';
import { StudentChronologyService } from './services/student-chronology.service';

// ─── PastoralCoreModule ────────────────────────────────────────────────────────
// Concerns, versions, notifications, events, DSAR, affected tracking, chronology.

@Module({
  imports: [
    AuthModule,
    forwardRef(() => ChildProtectionModule),
    CommunicationsModule,
    ConfigurationModule,
    RbacModule,
    StudentsModule,
    BullModule.registerQueue({ name: 'pastoral' }),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [ConcernsController, PastoralDsarController],
  providers: [
    AffectedTrackingService,
    AuthorMaskingInterceptor,
    ConcernQueriesService,
    ConcernService,
    ConcernVersionService,
    PastoralDsarService,
    PastoralEventService,
    PastoralNotificationService,
    PastoralReadFacade,
    StudentChronologyService,
  ],
  exports: [
    AffectedTrackingService,
    ConcernQueriesService,
    ConcernService,
    ConcernVersionService,
    PastoralDsarService,
    PastoralEventService,
    PastoralNotificationService,
    PastoralReadFacade,
    StudentChronologyService,
  ],
})
export class PastoralCoreModule {}
