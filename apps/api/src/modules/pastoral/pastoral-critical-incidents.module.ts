import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { TenantsModule } from '../tenants/tenants.module';

import { CriticalIncidentsController } from './controllers/critical-incidents.controller';
import { PastoralCoreModule } from './pastoral-core.module';
import { CriticalIncidentService } from './services/critical-incident.service';

// ─── PastoralCriticalIncidentsModule ───────────────────────────────────────────
// Critical incidents management.

@Module({
  imports: [AuthModule, PastoralCoreModule, TenantsModule],
  controllers: [CriticalIncidentsController],
  providers: [CriticalIncidentService],
  exports: [CriticalIncidentService],
})
export class PastoralCriticalIncidentsModule {}
