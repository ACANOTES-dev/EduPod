import { Module, forwardRef } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { SchedulesModule } from '../schedules/schedules.module';

import { RoomsReadFacade } from './rooms-read.facade';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [AuthModule, forwardRef(() => SchedulesModule)],
  controllers: [RoomsController],
  providers: [RoomsService, RoomsReadFacade],
  exports: [RoomsService, RoomsReadFacade],
})
export class RoomsModule {}
