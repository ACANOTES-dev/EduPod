import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { ParentPastoralController } from './controllers/parent-pastoral.controller';
import { PastoralCoreModule } from './pastoral-core.module';
import { ParentPastoralService } from './services/parent-pastoral.service';

// ─── PastoralParentPortalModule ────────────────────────────────────────────────
// Parent-facing read-only pastoral views — zero coupling to admin/report/import.

@Module({
  imports: [AuthModule, PastoralCoreModule],
  controllers: [ParentPastoralController],
  providers: [ParentPastoralService],
  exports: [ParentPastoralService],
})
export class PastoralParentPortalModule {}
