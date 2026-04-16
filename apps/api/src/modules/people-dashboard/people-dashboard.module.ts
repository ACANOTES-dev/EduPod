import { Module } from '@nestjs/common';

import { PeopleDashboardController } from './people-dashboard.controller';
import { PeopleDashboardService } from './people-dashboard.service';

@Module({
  controllers: [PeopleDashboardController],
  providers: [PeopleDashboardService],
})
export class PeopleDashboardModule {}
