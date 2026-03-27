import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { CommunicationsModule } from '../communications/communications.module';
import { TenantsModule } from '../tenants/tenants.module';

import { CasesController } from './controllers/cases.controller';
import { ConcernsController } from './controllers/concerns.controller';
import { ParentContactsController } from './controllers/parent-contacts.controller';
import { ParentPastoralController } from './controllers/parent-pastoral.controller';
import { PastoralAdminController } from './controllers/pastoral-admin.controller';
import { SstController } from './controllers/sst.controller';
import { AuthorMaskingInterceptor } from './interceptors/author-masking.interceptor';
import { CaseService } from './services/case.service';
import { ConcernVersionService } from './services/concern-version.service';
import { ConcernService } from './services/concern.service';
import { ParentContactService } from './services/parent-contact.service';
import { ParentPastoralService } from './services/parent-pastoral.service';
import { PastoralEventService } from './services/pastoral-event.service';
import { PastoralNotificationService } from './services/pastoral-notification.service';
import { SstAgendaGeneratorService } from './services/sst-agenda-generator.service';
import { SstMeetingService } from './services/sst-meeting.service';
import { SstService } from './services/sst.service';
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
    ParentContactsController,
    ParentPastoralController,
    PastoralAdminController,
    SstController,
  ],
  providers: [
    AuthorMaskingInterceptor,
    CaseService,
    ConcernService,
    ConcernVersionService,
    ParentContactService,
    ParentPastoralService,
    PastoralEventService,
    PastoralNotificationService,
    SstAgendaGeneratorService,
    SstMeetingService,
    SstService,
    StudentChronologyService,
  ],
  exports: [
    CaseService,
    ConcernService,
    ConcernVersionService,
    ParentContactService,
    PastoralEventService,
    PastoralNotificationService,
    SstService,
    StudentChronologyService,
  ],
})
export class PastoralModule {}
