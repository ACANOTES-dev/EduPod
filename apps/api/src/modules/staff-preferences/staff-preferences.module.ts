import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { StaffPreferencesController } from './staff-preferences.controller';
import { StaffPreferencesReadFacade } from './staff-preferences-read.facade';
import { StaffPreferencesService } from './staff-preferences.service';

@Module({
  imports: [AuthModule],
  controllers: [StaffPreferencesController],
  providers: [StaffPreferencesService, StaffPreferencesReadFacade],
  exports: [StaffPreferencesService, StaffPreferencesReadFacade],
})
export class StaffPreferencesModule {}
