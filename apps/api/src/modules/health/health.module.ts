import { Module } from '@nestjs/common';

import { SearchModule } from '../search/search.module';

import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [SearchModule],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
