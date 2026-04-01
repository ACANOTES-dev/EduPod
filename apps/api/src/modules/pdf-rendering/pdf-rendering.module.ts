import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { PdfJobService } from './pdf-job.service';
import { PdfRenderingService } from './pdf-rendering.service';

@Module({
  imports: [BullModule.registerQueue({ name: 'pdf-rendering' })],
  providers: [PdfRenderingService, PdfJobService],
  exports: [PdfRenderingService, PdfJobService],
})
export class PdfRenderingModule {}
