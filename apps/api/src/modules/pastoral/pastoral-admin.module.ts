import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChildProtectionModule } from '../child-protection/child-protection.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';

import { ParentPastoralController } from './controllers/parent-pastoral.controller';
import { PastoralAdminController } from './controllers/pastoral-admin.controller';
import { PastoralImportController } from './controllers/pastoral-import.controller';
import { PastoralReportsController } from './controllers/pastoral-reports.controller';
import { PastoralCoreModule } from './pastoral-core.module';
import { ParentPastoralService } from './services/parent-pastoral.service';
import { PastoralExportService } from './services/pastoral-export.service';
import { PastoralImportService } from './services/pastoral-import.service';
import { PastoralReportService } from './services/pastoral-report.service';

// ─── PastoralAdminModule ───────────────────────────────────────────────────────
// Admin, reports, export, import, parent portal.
// Imports ChildProtectionModule directly (no forwardRef) because the cycle
// is broken: CP → PastoralCoreModule (leaf), PastoralAdminModule → CP.

@Module({
  imports: [AuthModule, ChildProtectionModule, PastoralCoreModule, PdfRenderingModule],
  controllers: [
    ParentPastoralController,
    PastoralAdminController,
    PastoralImportController,
    PastoralReportsController,
  ],
  providers: [
    ParentPastoralService,
    PastoralExportService,
    PastoralImportService,
    PastoralReportService,
  ],
  exports: [PastoralReportService],
})
export class PastoralAdminModule {}
