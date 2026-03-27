import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';
import { TenantsModule } from '../tenants/tenants.module';

import { CasesController } from './controllers/cases.controller';
import { ConcernsController } from './controllers/concerns.controller';
import { AuthorMaskingInterceptor } from './interceptors/author-masking.interceptor';
import { CaseService } from './services/case.service';
import { ConcernVersionService } from './services/concern-version.service';
import { ConcernService } from './services/concern.service';
import { PastoralEventService } from './services/pastoral-event.service';
import { PastoralNotificationService } from './services/pastoral-notification.service';
import { StudentChronologyService } from './services/student-chronology.service';

@Module({
  imports: [
    AuthModule,
    CommunicationsModule,
    TenantsModule,
    BullModule.registerQueue({ name: 'pastoral' }),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [
    CasesController,
    ConcernsController,
  ],
  providers: [
    AuthorMaskingInterceptor,
    CaseService,
    ConcernService,
    ConcernVersionService,
    PastoralEventService,
    PastoralNotificationService,
    StudentChronologyService,
  ],
  exports: [
    CaseService,
    ConcernService,
    ConcernVersionService,
    PastoralEventService,
    PastoralNotificationService,
    StudentChronologyService,
  ],
})
export class PastoralModule {}
