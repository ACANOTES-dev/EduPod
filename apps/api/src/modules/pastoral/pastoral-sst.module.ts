import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { RbacModule } from '../rbac/rbac.module';

import { SstController } from './controllers/sst.controller';
import { PastoralCoreModule } from './pastoral-core.module';
import { SstAgendaGeneratorService } from './services/sst-agenda-generator.service';
import { SstMeetingService } from './services/sst-meeting.service';
import { SstService } from './services/sst.service';

// ─── PastoralSstModule ─────────────────────────────────────────────────────────
// SST meetings, agenda generation.

@Module({
  imports: [
    AuthModule,
    PastoralCoreModule,
    BullModule.registerQueue({ name: 'pastoral' }),
    ConfigurationModule,
    RbacModule,
  ],
  controllers: [SstController],
  providers: [SstAgendaGeneratorService, SstMeetingService, SstService],
  exports: [SstService],
})
export class PastoralSstModule {}
