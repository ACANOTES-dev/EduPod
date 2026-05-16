import { Global, Module } from '@nestjs/common';

import { PlatformRoleGuard } from '../../common/guards/platform-role.guard';

import {
  PlatformPermissionsController,
  PlatformUsersController,
} from './platform-users.controller';
import { PlatformUsersService } from './platform-users.service';

@Global()
@Module({
  controllers: [PlatformUsersController, PlatformPermissionsController],
  providers: [PlatformUsersService, PlatformRoleGuard],
  exports: [PlatformUsersService, PlatformRoleGuard],
})
export class PlatformUsersModule {}
