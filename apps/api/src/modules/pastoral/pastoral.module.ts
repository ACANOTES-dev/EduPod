import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';

import { ConcernsController } from './controllers/concerns.controller';
import { ConcernVersionService } from './services/concern-version.service';
import { ConcernService } from './services/concern.service';
import { PastoralEventService } from './services/pastoral-event.service';

@Module({
  imports: [
    AuthModule,
    TenantsModule,
    BullModule.registerQueue({ name: 'pastoral' }),
    BullModule.registerQueue({ name: 'notifications' }),
  ],
  controllers: [
    ConcernsController,
  ],
  providers: [
    ConcernService,
    ConcernVersionService,
    PastoralEventService,
  ],
  exports: [
    ConcernService,
    ConcernVersionService,
    PastoralEventService,
  ],
})
export class PastoralModule {}
