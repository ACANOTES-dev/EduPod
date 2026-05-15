import { Module } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';

import { PlatformGateway } from './platform.gateway';
import { RedisPubSubService } from './redis-pubsub.service';

@Module({
  imports: [AuthModule],
  providers: [RedisPubSubService, PlatformGateway],
  exports: [RedisPubSubService],
})
export class PlatformModule {}
