import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { ParentsModule } from '../parents/parents.module';

import { ParentPastoralController } from './controllers/parent-pastoral.controller';
import { PastoralCoreModule } from './pastoral-core.module';
import { ParentPastoralService } from './services/parent-pastoral.service';

// ─── PastoralParentPortalModule ────────────────────────────────────────────────
// Parent-facing read-only pastoral views — zero coupling to admin/report/import.

@Module({
  imports: [AuthModule, PastoralCoreModule, ConfigurationModule, ParentsModule],
  controllers: [ParentPastoralController],
  providers: [ParentPastoralService],
  exports: [ParentPastoralService],
})
export class PastoralParentPortalModule {}
