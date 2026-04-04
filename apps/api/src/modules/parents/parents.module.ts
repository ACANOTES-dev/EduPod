import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { ParentReadFacade } from './parent-read.facade';
import { ParentsController } from './parents.controller';
import { ParentsService } from './parents.service';

@Module({
  imports: [AuthModule],
  controllers: [ParentsController],
  providers: [ParentsService, ParentReadFacade],
  exports: [ParentsService, ParentReadFacade],
})
export class ParentsModule {}
