import { Module } from '@nestjs/common';

import { PastoralAdminModule } from './pastoral-admin.module';
import { PastoralCasesModule } from './pastoral-cases.module';
import { PastoralCheckinsSubModule } from './pastoral-checkins.module';
import { PastoralCoreModule } from './pastoral-core.module';
import { PastoralCriticalIncidentsModule } from './pastoral-critical-incidents.module';
import { PastoralParentPortalModule } from './pastoral-parent-portal.module';
import { PastoralSstModule } from './pastoral-sst.module';

// ─── PastoralModule (root) ─────────────────────────────────────────────────────
// Thin aggregator — imports and re-exports focused sub-modules.
// No providers or controllers at this level.

@Module({
  imports: [
    PastoralCoreModule,
    PastoralCasesModule,
    PastoralSstModule,
    PastoralCheckinsSubModule,
    PastoralCriticalIncidentsModule,
    PastoralAdminModule,
    PastoralParentPortalModule,
  ],
  exports: [
    PastoralCoreModule,
    PastoralCasesModule,
    PastoralSstModule,
    PastoralCheckinsSubModule,
    PastoralCriticalIncidentsModule,
    PastoralAdminModule,
    PastoralParentPortalModule,
  ],
})
export class PastoralModule {}
