import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { StaffProfilesModule } from '../staff-profiles/staff-profiles.module';

import { StaffPreferencesReadFacade } from './staff-preferences-read.facade';
import { StaffPreferencesController } from './staff-preferences.controller';
import { StaffPreferencesService } from './staff-preferences.service';

@Module({
  imports: [AuthModule, StaffProfilesModule],
  controllers: [StaffPreferencesController],
  providers: [StaffPreferencesService, StaffPreferencesReadFacade],
  exports: [StaffPreferencesService, StaffPreferencesReadFacade],
})
export class StaffPreferencesModule {}
