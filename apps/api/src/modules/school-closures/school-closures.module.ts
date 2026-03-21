import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { SchoolClosuresController } from './school-closures.controller';
import { SchoolClosuresService } from './school-closures.service';

@Module({
  imports: [AuthModule],
  controllers: [SchoolClosuresController],
  providers: [SchoolClosuresService],
  exports: [SchoolClosuresService],
})
export class SchoolClosuresModule {}
