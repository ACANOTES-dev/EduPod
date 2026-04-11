import { Module } from '@nestjs/common';

import { RedisModule } from '../redis/redis.module';

import { PublicHouseholdsRateLimitService } from './public-households-rate-limit.service';
import { PublicHouseholdsController } from './public-households.controller';
import { PublicHouseholdsService } from './public-households.service';

@Module({
  imports: [RedisModule],
  controllers: [PublicHouseholdsController],
  providers: [PublicHouseholdsService, PublicHouseholdsRateLimitService],
})
export class PublicHouseholdsModule {}
