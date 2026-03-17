import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { ClassRequirementsController } from './class-requirements.controller';
import { ClassRequirementsService } from './class-requirements.service';

@Module({
  imports: [AuthModule],
  controllers: [ClassRequirementsController],
  providers: [ClassRequirementsService],
  exports: [ClassRequirementsService],
})
export class ClassRequirementsModule {}
