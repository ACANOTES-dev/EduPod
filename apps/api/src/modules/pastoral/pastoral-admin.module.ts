import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { ChildProtectionModule } from '../child-protection/child-protection.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';

import { PastoralAdminController } from './controllers/pastoral-admin.controller';
import { PastoralImportController } from './controllers/pastoral-import.controller';
import { PastoralReportsController } from './controllers/pastoral-reports.controller';
import { PastoralCoreModule } from './pastoral-core.module';
import { PastoralExportService } from './services/pastoral-export.service';
import { PastoralImportService } from './services/pastoral-import.service';
import { PastoralReportDesInspectionService } from './services/pastoral-report-des-inspection.service';
import { PastoralReportSafeguardingService } from './services/pastoral-report-safeguarding.service';
import { PastoralReportSstActivityService } from './services/pastoral-report-sst-activity.service';
import { PastoralReportStudentSummaryService } from './services/pastoral-report-student-summary.service';
import { PastoralReportWellbeingService } from './services/pastoral-report-wellbeing.service';
import { PastoralReportService } from './services/pastoral-report.service';
import { ConfigurationModule } from '../configuration/configuration.module';

// ─── PastoralAdminModule ───────────────────────────────────────────────────────
// Admin, reports, export, import, parent portal.
// Imports ChildProtectionModule directly (no forwardRef) because the cycle
// is broken: CP → PastoralCoreModule (leaf), PastoralAdminModule → CP.

@Module({
  imports: [AuthModule, ChildProtectionModule, PastoralCoreModule, PdfRenderingModule, ConfigurationModule],
  controllers: [
    PastoralAdminController,
    PastoralImportController,
    PastoralReportsController,
  ],
  providers: [
    PastoralExportService,
    PastoralImportService,
    PastoralReportDesInspectionService,
    PastoralReportSafeguardingService,
    PastoralReportService,
    PastoralReportSstActivityService,
    PastoralReportStudentSummaryService,
    PastoralReportWellbeingService,
  ],
  exports: [PastoralReportService],
})
export class PastoralAdminModule {}
