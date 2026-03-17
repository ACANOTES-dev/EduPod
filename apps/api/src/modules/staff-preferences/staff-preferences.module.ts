import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { StaffPreferencesController } from './staff-preferences.controller';
import { StaffPreferencesService } from './staff-preferences.service';

@Module({
  imports: [AuthModule],
  controllers: [StaffPreferencesController],
  providers: [StaffPreferencesService],
  exports: [StaffPreferencesService],
})
export class StaffPreferencesModule {}
