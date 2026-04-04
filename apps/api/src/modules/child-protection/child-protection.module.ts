import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { PastoralCoreModule } from '../pastoral/pastoral-core.module';
import { PdfRenderingModule } from '../pdf-rendering/pdf-rendering.module';
import { SequenceModule } from '../sequence/sequence.module';

import { CpAccessController } from './controllers/cp-access.controller';
import { CpExportController } from './controllers/cp-export.controller';
import { CpRecordsController } from './controllers/cp-records.controller';
import { ChildProtectionReadFacade } from './child-protection-read.facade';
import { CpAccessGuard } from './guards/cp-access.guard';
import { CpAccessService } from './services/cp-access.service';
import { CpExportService } from './services/cp-export.service';
import { CpRecordService } from './services/cp-record.service';
import { MandatedReportService } from './services/mandated-report.service';

@Module({
  imports: [AuthModule, PastoralCoreModule, PdfRenderingModule, SequenceModule],
  controllers: [CpAccessController, CpExportController, CpRecordsController],
  providers: [
    ChildProtectionReadFacade,
    CpAccessGuard,
    CpAccessService,
    CpExportService,
    CpRecordService,
    MandatedReportService,
  ],
  exports: [CpAccessService, CpExportService, CpRecordService, ChildProtectionReadFacade],
})
export class ChildProtectionModule {}
