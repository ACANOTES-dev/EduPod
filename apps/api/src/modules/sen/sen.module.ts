import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { SenProfileController } from './sen-profile.controller';
import { SenProfileService } from './sen-profile.service';
import { SenScopeService } from './sen-scope.service';

@Module({
  imports: [AuthModule],
  controllers: [SenProfileController],
  providers: [SenProfileService, SenScopeService],
  exports: [SenProfileService, SenScopeService],
})
export class SenModule {}
