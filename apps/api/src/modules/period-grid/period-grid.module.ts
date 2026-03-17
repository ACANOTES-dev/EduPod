import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { PeriodGridController } from './period-grid.controller';
import { PeriodGridService } from './period-grid.service';

@Module({
  imports: [AuthModule],
  controllers: [PeriodGridController],
  providers: [PeriodGridService],
  exports: [PeriodGridService],
})
export class PeriodGridModule {}
