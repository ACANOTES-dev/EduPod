import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SequenceModule } from '../sequence/sequence.module';

import { SecurityIncidentsController } from './security-incidents.controller';
import { SecurityIncidentsService } from './security-incidents.service';

@Module({
  imports: [AuthModule, SequenceModule],
  controllers: [SecurityIncidentsController],
  providers: [SecurityIncidentsService],
  exports: [SecurityIncidentsService],
})
export class SecurityIncidentsModule {}
