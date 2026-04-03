import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SequenceModule } from '../sequence/sequence.module';

import { CriticalIncidentsController } from './controllers/critical-incidents.controller';
import { PastoralCoreModule } from './pastoral-core.module';
import { CriticalIncidentResponseService } from './services/critical-incident-response.service';
import { CriticalIncidentService } from './services/critical-incident.service';

// ─── PastoralCriticalIncidentsModule ───────────────────────────────────────────
// Critical incidents management.

@Module({
  imports: [
    AuthModule,
    BullModule.registerQueue({ name: 'pastoral' }),
    PastoralCoreModule,
    SequenceModule,
  ],
  controllers: [CriticalIncidentsController],
  providers: [CriticalIncidentResponseService, CriticalIncidentService],
  exports: [CriticalIncidentResponseService, CriticalIncidentService],
})
export class PastoralCriticalIncidentsModule {}
