import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PastoralCoreModule } from '../pastoral/pastoral-core.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { TenantsModule } from '../tenants/tenants.module';

import { CpAccessController } from './controllers/cp-access.controller';
import { CpExportController } from './controllers/cp-export.controller';
import { CpRecordsController } from './controllers/cp-records.controller';
import { CpAccessGuard } from './guards/cp-access.guard';
import { CpAccessService } from './services/cp-access.service';
import { CpExportService } from './services/cp-export.service';
import { CpRecordService } from './services/cp-record.service';
import { MandatedReportService } from './services/mandated-report.service';

@Module({
  imports: [AuthModule, PastoralCoreModule, PdfRenderingModule, TenantsModule],
  controllers: [CpAccessController, CpExportController, CpRecordsController],
  providers: [
    CpAccessGuard,
    CpAccessService,
    CpExportService,
    CpRecordService,
    MandatedReportService,
  ],
  exports: [CpAccessService, CpExportService, CpRecordService],
})
export class ChildProtectionModule {}
