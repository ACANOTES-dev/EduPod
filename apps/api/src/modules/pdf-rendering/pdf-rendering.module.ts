import { Module } from '@nestjs/common';

import { PdfRenderingService } from './pdf-rendering.service';

@Module({
  providers: [PdfRenderingService],
  exports: [PdfRenderingService],
})
export class PdfRenderingModule {}
